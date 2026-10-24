/* Scripture Pod — Kannada and Tamil script to "typed English" (Latin letters).
 *
 * Lyrics found on the web are often written in Kannada or Tamil script. Songs are stored in typed
 * English, the way people type them on a phone, so the output is meant to be read aloud by an English
 * reader: a lowercase, plain-letter spelling with no diacritics. It is a reading aid, not a strict
 * scheme: Tamil has no separate g/d/b letters, so k, th, t and p are used for them.
 *
 * Used by the panel (src/renderer/panel/scripts/ui/workspace-and-editor-tools.js) and by
 * test/transliterate.test.js.
 */
(function (root) {
  var KN_VOWELS = { 'ಅ': 'a', 'ಆ': 'aa', 'ಇ': 'i', 'ಈ': 'ee', 'ಉ': 'u', 'ಊ': 'oo', 'ಋ': 'ru', 'ಎ': 'e', 'ಏ': 'ae', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'o', 'ಔ': 'au' };
  var KN_SIGNS = { 'ಾ': 'aa', 'ಿ': 'i', 'ೀ': 'ee', 'ು': 'u', 'ೂ': 'oo', 'ೃ': 'ru', 'ೆ': 'e', 'ೇ': 'ae', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au' };
  var KN_CONS = {
    'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'ng', 'ಚ': 'ch', 'ಛ': 'chh', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'nj',
    'ಟ': 't', 'ಠ': 'th', 'ಡ': 'd', 'ಢ': 'dh', 'ಣ': 'n', 'ತ': 'th', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
    'ಪ': 'p', 'ಫ': 'ph', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm', 'ಯ': 'y', 'ರ': 'r', 'ಱ': 'r', 'ಲ': 'l', 'ವ': 'v',
    'ಶ': 'sh', 'ಷ': 'sh', 'ಸ': 's', 'ಹ': 'h', 'ಳ': 'l', 'ೞ': 'zh', 'ೠ': 'ru'
  };
  var TA_VOWELS = { 'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ee', 'உ': 'u', 'ஊ': 'oo', 'எ': 'e', 'ஏ': 'ae', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'o', 'ஔ': 'au' };
  var TA_SIGNS = { 'ா': 'aa', 'ி': 'i', 'ீ': 'ee', 'ு': 'u', 'ூ': 'oo', 'ெ': 'e', 'ே': 'ae', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au', 'ௗ': 'au' };
  var TA_CONS = {
    'க': 'k', 'ங': 'ng', 'ச': 'ch', 'ஞ': 'nj', 'ட': 't', 'ண': 'n', 'த': 'th', 'ந': 'n', 'ப': 'p', 'ம': 'm',
    'ய': 'y', 'ர': 'r', 'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n',
    'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h', 'ஶ': 'sh'
  };
  var KN_VIRAMA = '್';
  var TA_VIRAMA = '்';
  var KN_DIGITS = '೦೧೨೩೪೫೬೭೮೯';
  var TA_DIGITS = '௦௧௨௩௪௫௬௭௮௯';
  // Anusvara is "m" before p-class consonants and at the end of a word, and "n" before the others
  var LABIALS = { 'ಪ': 1, 'ಫ': 1, 'ಬ': 1, 'ಭ': 1, 'ಮ': 1, 'ப': 1, 'ம': 1 };

  function isKannada(c) { return c >= 0x0C80 && c <= 0x0CFF; }
  function isTamil(c) { return c >= 0x0B80 && c <= 0x0BFF; }

  // Which language a text is written in, by the share of its letters: 'kannada', 'tamil' or 'latin'
  function detectScript(text) {
    var kn = 0, ta = 0, latin = 0;
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (isKannada(c)) kn++;
      else if (isTamil(c)) ta++;
      else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
    }
    var total = kn + ta + latin;
    if (!total) return 'latin';
    if (kn / total > 0.2 && kn >= ta) return 'kannada';
    if (ta / total > 0.2) return 'tamil';
    return 'latin';
  }

  function convertRun(s, i, vowels, signs, cons, virama, digits, isTamilRun, state) {
    var ch = s[i];
    if (vowels[ch] !== undefined) return { out: vowels[ch], next: i + 1 };
    var d = digits.indexOf(ch);
    if (d >= 0) return { out: String(d), next: i + 1 };
    if (ch === 'ಂ' || ch === 'ஂ') {
      var after = s[i + 1];
      return { out: (!after || LABIALS[after] || !(after in cons)) ? 'm' : 'n', next: i + 1 };
    }
    if (ch === 'ಃ' || ch === 'ஃ') return { out: 'h', next: i + 1 };
    if (ch === 'ಁ' || ch === '಼' || ch === '‌' || ch === '‍') return { out: '', next: i + 1 };
    if (cons[ch] !== undefined) {
      var base = cons[ch];
      // Tamil "ச" is ch at the start of a word or after a pulli, and s between vowels
      if (isTamilRun && ch === 'ச') {
        var prev = s[i - 1];
        base = (!prev || prev === TA_VIRAMA || !/[஀-௿]/.test(prev)) ? 'ch' : 's';
      }
      var nx = s[i + 1];
      if (nx === virama) return { out: base, next: i + 2 };
      if (signs[nx] !== undefined) {
        // two-part Tamil vowel signs written as separate letters
        var sign = signs[nx];
        var n2 = s[i + 2];
        if (isTamilRun && nx === 'ெ' && n2 === 'ா') return { out: base + 'o', next: i + 3 };
        if (isTamilRun && nx === 'ே' && n2 === 'ா') return { out: base + 'o', next: i + 3 };
        if (isTamilRun && nx === 'ெ' && n2 === 'ௗ') return { out: base + 'au', next: i + 3 };
        return { out: base + sign, next: i + 2 };
      }
      return { out: base + 'a', next: i + 1 };
    }
    if (signs[ch] !== undefined) return { out: signs[ch], next: i + 1 };
    if (ch === virama) return { out: '', next: i + 1 };
    return null;
  }

  function toTypedEnglish(text) {
    var s = String(text == null ? '' : text).normalize('NFC');
    var out = '';
    var i = 0;
    while (i < s.length) {
      var c = s.charCodeAt(i);
      var r = null;
      if (isKannada(c)) r = convertRun(s, i, KN_VOWELS, KN_SIGNS, KN_CONS, KN_VIRAMA, KN_DIGITS, false);
      else if (isTamil(c)) r = convertRun(s, i, TA_VOWELS, TA_SIGNS, TA_CONS, TA_VIRAMA, TA_DIGITS, true);
      if (r) { out += r.out; i = r.next; continue; }
      out += s[i];
      i++;
    }
    // lowercase words, a capital at the start of every line
    return out.split('\n').map(function (line) {
      var t = line.replace(/[ \t]+$/, '');
      return t.replace(/^(\s*(?:\[[^\]]*\]\s*)?)([a-z])/, function (m, pre, letter) { return pre + letter.toUpperCase(); });
    }).join('\n');
  }

  var api = { toTypedEnglish: toTypedEnglish, detectScript: detectScript };
  root.SP_TRANSLIT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
