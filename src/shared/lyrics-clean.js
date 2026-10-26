/* Scripture Pod — tidy lyrics copied from the web before they are saved.
 *
 * Online lyrics often carry marks meant for a reader, not for the screen: verse numbers in front of a verse
 * ("1.", "2)"), repeat marks after a line or a chorus label ("x2", "(x4)", "xn", "2x", "-2", "repeat x2").
 * They are taken out here; the words and the line breaks stay as they were.
 */
(function (root) {
  // x2, ×2, x 2, X4, xn, 2x, (x2), [x2]  — a repeat mark on its own, optionally in brackets
  var REPEAT = '(?:[x×]\\s*(?:\\d{1,2}|n)|(?:\\d{1,2}|n)\\s*[x×]|repeat(?:\\s*[x×]?\\s*\\d{1,2}(?:\\s*times)?)?)';
  var BRACKETED_REPEAT = new RegExp('\\s*[\\(\\[]\\s*' + REPEAT + '\\s*[\\)\\]]\\s*$', 'i');
  var TRAILING_REPEAT = new RegExp('\\s+' + REPEAT + '\\s*$', 'i');
  var TRAILING_DASH_NUMBER = /\s[-–—]\s?\d{1,2}\s*$/;
  var ONLY_REPEAT = new RegExp('^\\s*[\\(\\[]?\\s*' + REPEAT + '\\s*[\\)\\]]?\\s*$', 'i');
  var LEADING_VERSE_NUMBER = /^\s*\d{1,2}\s*[.)]\s+(?=\S)/;
  var ONLY_VERSE_NUMBER = /^\s*\d{1,2}\s*[.)]?\s*$/;
  var HEADER_WITH_REPEAT = new RegExp('^\\s*\\[([^\\]]*?)\\s*[\\(\\-]?\\s*' + REPEAT + '\\s*\\)?\\s*\\]\\s*$', 'i');

  function cleanLine(line) {
    var l = line;
    // [Chorus x2] -> [Chorus]
    var h = l.match(HEADER_WITH_REPEAT);
    if (h && h[1].trim()) return '[' + h[1].trim() + ']';
    if (ONLY_REPEAT.test(l)) return null;                    // a line that is only "x2"
    l = l.replace(LEADING_VERSE_NUMBER, '');                // 1. Words ...
    var before;
    do {
      before = l;
      l = l.replace(BRACKETED_REPEAT, '').replace(TRAILING_REPEAT, '').replace(TRAILING_DASH_NUMBER, '');
    } while (l !== before);
    return l.replace(/[ \t]+$/, '');
  }

  function cleanPastedLyrics(text) {
    var src = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    src.forEach(function (raw) {
      // a line holding only a verse number marks where a verse starts: it becomes a break between verses
      if (ONLY_VERSE_NUMBER.test(raw) && raw.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); return; }
      var c = cleanLine(raw);
      if (c === null) return;
      out.push(c);
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  }

  var api = { cleanPastedLyrics: cleanPastedLyrics };
  root.SP_LYRICS_CLEAN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
