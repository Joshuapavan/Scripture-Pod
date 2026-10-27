const test = require('node:test');
const assert = require('node:assert/strict');
const { spokenToReference: ref } = require('../src/shared/spoken-reference.js');

test('spoken chapter and verse become a reference', () => {
  assert.equal(ref('turn to john three sixteen'), 'john 3:16');
  assert.equal(ref('john chapter 3 verse 16'), 'john 3:16');
  assert.equal(ref('let us read psalm twenty three'), 'psalm 23');
  assert.equal(ref('romans eight twenty eight'), 'romans 8:28');
});

test('numbered books are read from first, second and third', () => {
  assert.equal(ref('first corinthians thirteen four'), '1 corinthians 13:4');
  assert.equal(ref('open second timothy chapter three verse sixteen'), '2 timothy 3:16');
  assert.equal(ref('one john four eight'), '1 john 4:8');
});

test('large numbers and typed digits work', () => {
  assert.equal(ref('psalm one hundred nineteen'), 'psalm 119');
  assert.equal(ref('psalm 119 verse 105'), 'psalm 119:105');
});

test('words that are not a reference give null', () => {
  assert.equal(ref('love one another'), null);
  assert.equal(ref('john'), null);
  assert.equal(ref(''), null);
});
