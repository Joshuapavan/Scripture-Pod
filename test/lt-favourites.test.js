const test = require('node:test');
const assert = require('node:assert/strict');
const fav = require('../src/shared/lt-favourites.js');

test('a saved list is cleaned: only text, no repeats, not too long', () => {
  assert.deepEqual(fav.parse('["a","b","a",3,null,""]'), ['a', 'b']);
  assert.deepEqual(fav.parse('not json'), []);
  assert.deepEqual(fav.parse(null), []);
  assert.equal(fav.parse(Array.from({ length: 200 }, (_, i) => 'd' + i)).length, fav.MAX);
});

test('starring adds a design and starring again takes it out', () => {
  let list = [];
  list = fav.toggle(list, 'classic-gms-rise');
  list = fav.toggle(list, 'custom:abc');
  assert.deepEqual(list, ['classic-gms-rise', 'custom:abc']);
  assert.ok(fav.has(list, 'custom:abc'));
  list = fav.toggle(list, 'classic-gms-rise');
  assert.deepEqual(list, ['custom:abc']);
  assert.deepEqual(fav.toggle(list, ''), ['custom:abc']);
});

test('favourites that no longer exist drop out and the rest keep their order and labels', () => {
  const known = [{ value: 'a', label: 'Alpha' }, { value: 'custom:x', label: 'Mine' }, { value: 'b', label: 'Beta' }];
  assert.deepEqual(fav.resolve(['b', 'gone', 'custom:x'], known), [{ value: 'b', label: 'Beta' }, { value: 'custom:x', label: 'Mine' }]);
  assert.deepEqual(fav.resolve([], known), []);
});
