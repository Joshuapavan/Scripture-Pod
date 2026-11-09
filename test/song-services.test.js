const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/shared/song-services.js');

const mk = (id, extra) => Object.assign({ id, title: id, createdAt: Number(id.charCodeAt(0)) }, extra);

test('songs never moved sit after moved ones, oldest first', () => {
  const sorted = S.sortSongs([mk('c'), mk('a', { order: 1 }), mk('b', { order: 0 }), mk('d')]);
  assert.deepEqual(sorted.map((s) => s.id), ['b', 'a', 'c', 'd']);
});

test('moving a song puts it at the target position and renumbers only what changed', () => {
  const songs = [mk('a', { order: 0 }), mk('b', { order: 1 }), mk('c', { order: 2 }), mk('d', { order: 3 })];
  const changed = S.moveSong(songs, 'd', 'b');
  assert.deepEqual(songs.map((s) => s.id), ['a', 'd', 'b', 'c']);
  assert.deepEqual(changed.map((s) => s.id), ['d', 'b', 'c']);
  assert.deepEqual(S.moveSong(songs, 'a', 'a'), []);
  assert.deepEqual(S.moveSong(songs, 'zzz', 'a'), []);
});

test('the order survives sorting after a move on songs that had no order before', () => {
  const songs = [mk('a'), mk('b'), mk('c')];
  S.moveSong(songs, 'c', 'a');
  assert.deepEqual(S.sortSongs(songs.slice().reverse()).map((s) => s.id), ['c', 'a', 'b']);
});

test('services: create, file a song, filter, rename, delete', () => {
  const store = {};
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const state = S.load(storage);
  assert.deepEqual(state, { services: [], active: 'all' });
  const am = S.addService(state, ' Morning ');
  const pm = S.addService(state, 'Evening');
  assert.equal(S.addService(state, 'morning').id, am.id);
  assert.equal(S.addService(state, '   '), null);
  const song = mk('a');
  assert.equal(S.inService(song, 'all'), true);
  assert.equal(S.inService(song, am.id), false);
  assert.equal(S.toggleService(song, am.id), true);
  assert.equal(S.toggleService(song, pm.id), true);
  assert.equal(S.inService(song, am.id), true);
  assert.equal(S.toggleService(song, pm.id), false);
  assert.equal(S.renameService(state, am.id, 'Sunday morning'), true);
  assert.equal(S.renameService(state, pm.id, 'sunday MORNING'), false);
  state.active = am.id;
  S.save(storage, state);
  assert.equal(S.load(storage).active, am.id);
  const touched = S.removeService(state, [song, mk('b')], am.id);
  assert.deepEqual(touched.map((s) => s.id), ['a']);
  assert.deepEqual(song.services, []);
  assert.equal(state.active, 'all');
  assert.equal(S.load({ getItem: () => '{bad' }).active, 'all');
});
