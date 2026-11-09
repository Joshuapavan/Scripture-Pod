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

test('a refused upload is reported with the reason, and sending all songs stops at the refusal', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'denied', apiKey: '' };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'Missing or insufficient permissions.' } }) }; };
  assert.equal(await cloud.uploadSong({ title: 'One', content: 'a' }), false);
  assert.equal(cloud.getStatus().ok, false);
  assert.equal(cloud.getStatus().code, 403);
  assert.match(cloud.getStatus().message, /insufficient permissions/);
  calls = 0;
  const r = await cloud.uploadAll([{ title: 'Two', content: 'b' }, { title: 'Three', content: 'c' }, { title: 'Four', content: 'd' }]);
  assert.equal(r.ok, false);
  assert.equal(r.sent, 0);
  assert.equal(calls, 1);
});

test('sending all songs sends each one and counts them', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'open', apiKey: '' };
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return { ok: true, status: 200, text: async () => '{}' }; };
  const r = await cloud.uploadAll([{ title: 'Alpha', text: 'x' }, { title: 'Beta', content: 'y' }, { title: 'Empty', content: '' }]);
  assert.equal(r.ok, true);
  assert.equal(r.sent, 2);
  assert.equal(r.total, 2);
  assert.equal(cloud.getStatus().ok, true);
});

test('the connection test reports reading and writing separately', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'mixed', apiKey: '' };
  globalThis.fetch = async (url, opts) => (opts.method === 'PATCH'
    ? { ok: false, status: 404, text: async () => '{}' }
    : { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'Missing or insufficient permissions.' } }) });
  const r = await cloud.testConnection();
  assert.equal(r.read.ok, false);
  assert.equal(r.write.ok, true);
  assert.equal(r.ok, false);
});

test('a new song is only created: one the library already has is kept, and that is not an error', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'keep', apiKey: '' };
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push(url); return { ok: false, status: 409, text: async () => JSON.stringify({ error: { message: 'Document already exists', status: 'ALREADY_EXISTS' } }) }; };
  const now = Date.now();
  assert.equal(await cloud.uploadSong({ title: 'Already There', content: 'web copy', createdAt: now, updatedAt: now }), false);
  assert.match(calls[0], /songs\/already-there\?currentDocument\.exists=false$/);
  assert.equal(cloud.getStatus().ok, true);
  // The same song is not sent again and again
  assert.equal(await cloud.uploadSong({ title: 'Already There', content: 'web copy', createdAt: now, updatedAt: now }), false);
  assert.equal(calls.length, 1);
});

test('editing a song updates the library copy, and a new song that is not there yet is created', async () => {
  globalThis.SP_FIREBASE_CONFIG = { projectId: 'edit', apiKey: '' };
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => '{}' }; };
  const now = Date.now();
  assert.equal(await cloud.uploadSong({ title: 'Brand New', content: 'one', createdAt: now, updatedAt: now }), true);
  assert.match(calls[0], /exists=false$/);
  assert.equal(await cloud.uploadSong({ title: 'Brand New', content: 'one edited', createdAt: now - 5000, updatedAt: now }), true);
  assert.doesNotMatch(calls[1], /currentDocument/);
});

test('a search matches songs in the app by title or lyrics, a few at a time', () => {
  const songs = [
    { title: 'Yeshu Naam', content: 'sing his name' },
    { title: 'Another', content: 'praise Yeshu all day' },
    { title: 'Unrelated', content: 'nothing here' },
    { title: '', content: 'yeshu without a title' },
    { title: 'Yeshu Empty', content: '' }
  ];
  assert.deepEqual(cloud.findLocalMatches(songs, 'yeshu').map((s) => s.title), ['Yeshu Naam', 'Another']);
  assert.deepEqual(cloud.findLocalMatches(songs, 'yeshu', { titleOnly: true }).map((s) => s.title), ['Yeshu Naam']);
  assert.deepEqual(cloud.findLocalMatches(songs, 'y'), []);
  assert.equal(cloud.findLocalMatches(Array.from({ length: 30 }, (_, i) => ({ title: 'Song ' + i, content: 'x' })), 'song', { limit: 4 }).length, 4);
});
