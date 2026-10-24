const test = require('node:test');
const assert = require('node:assert/strict');
const { toTypedEnglish, detectScript } = require('../src/shared/transliterate.js');

test('Kannada words become typed English', () => {
  assert.equal(toTypedEnglish('ಕನ್ನಡ').toLowerCase(), 'kannada');
  assert.equal(toTypedEnglish('ಬೆಂಗಳೂರು').toLowerCase(), 'bengalooru');
  assert.equal(toTypedEnglish('ನಮಸ್ಕಾರ').toLowerCase(), 'namaskaara');
});

test('Tamil words become typed English', () => {
  assert.equal(toTypedEnglish('தமிழ்').toLowerCase(), 'thamizh');
  assert.equal(toTypedEnglish('வணக்கம்').toLowerCase(), 'vanakkam');
  assert.equal(toTypedEnglish('சென்னை').toLowerCase(), 'chennai');
});

test('Latin text, brackets, numbers and line breaks are kept', () => {
  assert.equal(toTypedEnglish('[Verse 1]\nhello world'), '[Verse 1]\nHello world');
  assert.equal(toTypedEnglish('೧೨೩ ೪'), '123 4');
});

test('mixed lines keep their Latin words', () => {
  assert.equal(toTypedEnglish('ಕನ್ನಡ song').toLowerCase(), 'kannada song');
});

test('the script of a text is detected', () => {
  assert.equal(detectScript('hello there'), 'latin');
  assert.equal(detectScript('ಕನ್ನಡ ಭಾಷೆ'), 'kannada');
  assert.equal(detectScript('தமிழ் மொழி'), 'tamil');
  assert.equal(detectScript(''), 'latin');
});
