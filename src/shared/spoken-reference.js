/* Scripture Pod — turns a spoken or loosely typed Bible reference into "Book 3:16".
 *
 * "turn to john three sixteen", "first corinthians chapter thirteen verse four" and "psalm 23" all work.
 * Returns null when the words are not a reference (no number, or nothing left for the book name).
 *
 * Used by the search box (src/renderer/panel/scripts/ui/command-palette.js) and test/spoken-reference.test.js.
 */
(function (root) {
  var ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var ORDINALS = { first: '1', second: '2', third: '3', '1st': '1', '2nd': '2', '3rd': '3', i: '1', ii: '2', iii: '3' };
  var NUMBERED_BOOKS = /^(samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john|esdras|maccabees)$/;
  var FILLER = /^(please|um|uh|okay|ok|now|let's|lets|let|us|turn|to|open|go|read|show|find|look|at|take|a|the|book|of|in|bible|scripture|passage|and|up|pull|bring)$/;

  function words(text) {
    return String(text || '').toLowerCase().replace(/[,;.!?"]/g, ' ').replace(/:/g, ' colon ').split(/\s+/).filter(Boolean);
  }

  // "twenty three" -> 23, "one hundred nineteen" -> 119, "three" -> 3; null when the word is not a number
  function readNumber(tokens, i) {
    var t = tokens[i];
    if (/^\d+$/.test(t)) return { value: Number(t), next: i + 1 };
    var value = null;
    var next = i;
    if (t in ONES) {
      value = ONES[t]; next = i + 1;
      if (tokens[next] === 'hundred') {
        value *= 100; next++;
        if (tokens[next] === 'and') next++;
        var tail = readNumber(tokens, next);
        if (tail && tail.value < 100) { value += tail.value; next = tail.next; }
      }
    } else if (t in TENS) {
      value = TENS[t]; next = i + 1;
      if (tokens[next] in ONES && ONES[tokens[next]] >= 1 && ONES[tokens[next]] <= 9) { value += ONES[tokens[next]]; next++; }
    } else return null;
    return { value: value, next: next };
  }

  function spokenToReference(text) {
    var tokens = words(text);
    var book = [];
    var nums = [];
    var sawVerseWord = false;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === 'chapter' || t === 'chapters') continue;
      if (t === 'verse' || t === 'verses' || t === 'colon' || t === 'versus') { sawVerseWord = true; continue; }
      var n = readNumber(tokens, i);
      if (n) {
        // a leading number or ordinal-like number before any book word is part of the book (1 John)
        if (!book.length && nums.length === 0 && n.next < tokens.length && NUMBERED_BOOKS.test(tokens[n.next]) && n.value >= 1 && n.value <= 3) {
          book.push(String(n.value)); i = n.next - 1; continue;
        }
        nums.push(n.value); i = n.next - 1; continue;
      }
      if (t in ORDINALS && !book.length && i + 1 < tokens.length && NUMBERED_BOOKS.test(tokens[i + 1])) { book.push(ORDINALS[t]); continue; }
      if (!book.length && !nums.length && FILLER.test(t)) continue;
      if (nums.length) { if (/^(please|thanks|thank|you|amen)$/.test(t)) continue; return null; } // anything else after the numbers means it is not a reference
      book.push(t);
    }
    if (!book.length || !nums.length || nums.length > 2) return null;
    var name = book.join(' ');
    if (nums.length === 2) return name + ' ' + nums[0] + ':' + nums[1];
    return name + ' ' + nums[0];
  }

  var api = { spokenToReference: spokenToReference };
  root.SP_SPOKEN_REF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
