const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let createBibleSearch = null;
try {
  require('node:sqlite');
  ({ createBibleSearch } = require('../src/main/bible-search'));
} catch (error) { /* node:sqlite needs Node 22.5+ */ }

const chapters = [
  { book: 'Genesis', chapter: '1', content: '[Genesis 1]\n1 In the beginning God created the heavens and the earth.\n2 And God said, Let there be light\n3 Darkness was on the face of the deep.' },
  { book: 'John', chapter: '3', content: '[John 3]\n16 For God so loved the world.\n17 God did not send his Son to condemn.' }
];

test('indexes a version and finds verses by contained text', { skip: !createBibleSearch }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-search-'));
  const search = createBibleSearch(path.join(dir, 'search.sqlite'));
  try {
    assert.deepStrictEqual(await search.call('index', { id: 'KJV', chapters }), { id: 'KJV', chapters: 2, verses: 5 });
    assert.deepStrictEqual((await search.call('status')).map(r => [r.id, r.verses]), [['KJV', 5]]);

    const god = await search.call('search', { id: 'KJV', tokens: ['god'], max: 10 });
    assert.deepStrictEqual(god.map(r => `${r.chapterIndex}:${r.verse}`), ['0:1', '0:2', '1:16', '1:17']);

    // substring, several tokens, a short token and a chapter filter
    assert.strictEqual((await search.call('search', { id: 'KJV', tokens: ['begin', 'earth'] })).length, 1);
    assert.strictEqual((await search.call('search', { id: 'KJV', tokens: ['god', 'wo'] })).map(r => r.verse).join(), '16');
    assert.deepStrictEqual((await search.call('search', { id: 'KJV', tokens: ['god'], chapters: [1] })).map(r => r.verse), ['16', '17']);
    assert.strictEqual((await search.call('search', { id: 'KJV', tokens: ['john 3:16'] })).length, 1);
    assert.strictEqual((await search.call('search', { id: 'KJV', tokens: ['god'], max: 2 })).length, 2);

    // reindexing replaces, removing drops
    await search.call('index', { id: 'KJV', chapters: [chapters[1]] });
    assert.strictEqual((await search.call('search', { id: 'KJV', tokens: ['beginning'] })).length, 0);
    await search.call('remove', { id: 'KJV' });
    assert.strictEqual(await search.call('search', { id: 'KJV', tokens: ['god'] }), null);
  } finally {
    search.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
