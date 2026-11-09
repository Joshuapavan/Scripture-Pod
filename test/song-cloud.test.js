const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../src/shared/song-cloud.js');

test('titles are matched ignoring case, punctuation and spacing', () => {
  assert.equal(cloud.titleKey('  Yeshu,  Naam!! '), 'yeshu naam');
  assert.equal(cloud.docIdFor('Yeshu Naam'), cloud.docIdFor('yeshu   naam!'));
  assert.equal(cloud.docIdFor('***'), '');
});

test('with no Firebase config nothing is sent and search finds nothing', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: '', projectNumber: '', apiKey: '' };
  assert.equal(cloud.isEnabled(), false);
  assert.equal(await cloud.uploadSong({ title: 'A', content: 'x' }), false);
  assert.deepEqual(await cloud.searchSongs('a'), []);
});

test('the bundled project is used by default and saved settings override or switch it off', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'scripture-pod', projectNumber: '483963646608', apiKey: '' };
  assert.equal(cloud.isEnabled(), true);
  assert.equal(cloud.getConfig().projectNumber, '483963646608');
  cloud.saveSettings({ enabled: true, projectId: 'other', projectNumber: '', apiKey: '' });
  assert.equal(cloud.getConfig().projectId, 'other');
  assert.equal(cloud.getConfig().projectNumber, '483963646608');
  cloud.saveSettings({ enabled: false });
  assert.equal(cloud.isEnabled(), false);
  delete globalThis.localStorage;
});

test('a song is uploaded once to a document named after its title, and unchanged songs are skipped', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'demo', apiKey: 'k' };
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => [] }; };
  assert.equal(await cloud.uploadSong({ title: 'Yeshu Naam', content: 'line one' }), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /projects\/demo\/databases\/\(default\)\/documents\/songs\/yeshu-naam\?key=k$/);
  assert.equal(calls[0].opts.method, 'PATCH');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.fields.content.stringValue, 'line one');
  assert.equal(body.fields.titleKey.stringValue, 'yeshu naam');
  assert.equal(await cloud.uploadSong({ title: 'Yeshu Naam', content: 'line one' }), false);
  assert.equal(await cloud.uploadSong({ title: 'Yeshu Naam', content: '' }), false);
  assert.equal(calls.length, 1);
});

test('search merges title-prefix and word matches without repeats', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'demo', apiKey: 'k' };
  const doc = (title) => ({ document: { fields: { title: { stringValue: title }, content: { stringValue: 'lyrics' } } } });
  let n = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => (n++ === 0 ? [doc('Yeshu Naam'), {}] : [doc('yeshu naam'), doc('Naam Yeshu')]) });
  const found = await cloud.searchSongs('yeshu');
  assert.deepEqual(found.map((s) => s.title), ['Yeshu Naam', 'Naam Yeshu']);
  assert.equal(found[0].source, cloud.SOURCE_NAME);
});
