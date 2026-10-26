const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanPastedLyrics: clean } = require('../src/shared/lyrics-clean.js');

test('verse numbers in front of a verse are removed', () => {
  assert.equal(clean('1. alpha one\nalpha two'), 'alpha one\nalpha two');
  assert.equal(clean('2) beta one'), 'beta one');
  assert.equal(clean('3.  gamma'), 'gamma');
});

test('a line holding only a verse number becomes a break between verses', () => {
  assert.equal(clean('1\nalpha one\n2.\nbeta one'), 'alpha one\n\nbeta one');
});

test('repeat marks after a line are removed', () => {
  assert.equal(clean('praise the name x2'), 'praise the name');
  assert.equal(clean('praise the name (x4)'), 'praise the name');
  assert.equal(clean('praise the name [X2]'), 'praise the name');
  assert.equal(clean('praise the name xn'), 'praise the name');
  assert.equal(clean('praise the name 2x'), 'praise the name');
  assert.equal(clean('praise the name ×3'), 'praise the name');
  assert.equal(clean('praise the name -2'), 'praise the name');
  assert.equal(clean('praise the name - 2'), 'praise the name');
  assert.equal(clean('praise the name (repeat x2)'), 'praise the name');
  assert.equal(clean('praise the name-2'), 'praise the name');
  assert.equal(clean('praise the name–2'), 'praise the name');
  assert.equal(clean('sing to the king-4'), 'sing to the king');
});

test('repeat marks on a chorus label and lines of only a mark', () => {
  assert.equal(clean('[Chorus x2]\nalpha'), '[Chorus]\nalpha');
  assert.equal(clean('[Chorus (x4)]\nalpha'), '[Chorus]\nalpha');
  assert.equal(clean('alpha\nx2\nbeta'), 'alpha\nbeta');
});

test('ordinary words and numbers are left alone', () => {
  assert.equal(clean('10,000 reasons to sing'), '10,000 reasons to sing');
  assert.equal(clean('he is the king'), 'he is the king');
  assert.equal(clean('we are 2 together'), 'we are 2 together');
  assert.equal(clean('Verse 1:\nalpha'), 'Verse 1:\nalpha');
  assert.equal(clean('the box'), 'the box');
  assert.equal(clean('see psalm 23-24'), 'see psalm 23-24');
  assert.equal(clean('a well-known song'), 'a well-known song');
  assert.equal(clean('alpha\n\n\n\nbeta'), 'alpha\n\nbeta');
});
