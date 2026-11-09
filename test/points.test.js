const test = require('node:test');
const assert = require('node:assert/strict');
const points = require('../src/shared/points.js');

test('points are one per line, with list marks and blank lines dropped', () => {
  assert.deepEqual(points.parsePoints('1. Trust God\n\n- Pray daily\r\n• Serve others\n  \nLove'), ['Trust God', 'Pray daily', 'Serve others', 'Love']);
  assert.deepEqual(points.parsePoints(''), []);
  assert.deepEqual(points.parsePoints(null), []);
  assert.equal(points.parsePoints('x'.repeat(500))[0].length, 220);
});

test('the small line is numbered, numbered with the total, or just the label', () => {
  assert.equal(points.roleFor(1, 5, { label: 'Point', numbered: true }), 'Point 2');
  assert.equal(points.roleFor(1, 5, { label: 'Point', numbered: true, of: true }), 'Point 2 of 5');
  assert.equal(points.roleFor(0, 3, { label: '', numbered: true }), '1');
  assert.equal(points.roleFor(0, 3, { label: 'Key idea', numbered: false }), 'Key idea');
  assert.equal(points.roleFor(0, 3, { label: '', numbered: false }), '');
  assert.equal(points.roleFor(0, 3, {}), '');
  assert.equal(points.roleFor(0, 3), '');
});

test('long points get smaller type, never below a readable size', () => {
  assert.equal(points.sizeFor('Short point', 56), 56);
  const mid = points.sizeFor('x'.repeat(120), 56);
  assert.ok(mid < 56 && mid >= 28);
  assert.equal(points.sizeFor('x'.repeat(5000), 56), 28);
});

test('the shown point stays inside the list', () => {
  assert.equal(points.clampIndex(9, 3), 2);
  assert.equal(points.clampIndex(-4, 3), 0);
  assert.equal(points.clampIndex(0, 0), -1);
});
