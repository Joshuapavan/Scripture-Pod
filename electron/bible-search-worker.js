// Bible search index, kept in SQLite on disk. Runs in a worker thread so the
// output windows never wait on indexing, and the panel never holds the index
// in its own memory. Each version gets one FTS5 table with a trigram
// tokenizer, which answers "contains this text" queries like the old
// in-memory scan did, without loading anything into the heap.
const { parentPort, workerData } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 1;
const db = new DatabaseSync(workerData.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -4096; PRAGMA temp_store = FILE;');

function resetSchema() {
  db.prepare('SELECT name FROM sqlite_master WHERE name LIKE \'fts\\_%\' ESCAPE \'\\\' AND type = \'table\'')
    .all().forEach(row => db.exec(`DROP TABLE IF EXISTS "${row.name}"`));
  db.exec('DROP TABLE IF EXISTS versions');
  db.exec(`CREATE TABLE versions (
    vid INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT UNIQUE NOT NULL,
    chapters INTEGER NOT NULL,
    verses INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
  )`);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
if (db.prepare('PRAGMA user_version').get().user_version !== SCHEMA_VERSION) resetSchema();

// Same normalization as the panel's normalizeSearchText, so a query and the
// stored text always line up.
function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g, '')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableFor(vid) {
  return `fts_${Number(vid)}`;
}

function removeVersion(id) {
  const row = db.prepare('SELECT vid FROM versions WHERE id = ?').get(id);
  if (!row) return false;
  db.exec(`DROP TABLE IF EXISTS "${tableFor(row.vid)}"`);
  db.prepare('DELETE FROM versions WHERE vid = ?').run(row.vid);
  return true;
}

const methods = {
  status() {
    return db.prepare('SELECT id, chapters, verses FROM versions').all();
  },

  // chapters: [{ book, chapter, content }] in the panel's chapter order, so a
  // stored chapter_idx is the index into that version's array.
  index({ id, chapters }) {
    if (!id || !Array.isArray(chapters)) throw new Error('bad index request');
    db.exec('BEGIN');
    try {
      removeVersion(id);
      const { lastInsertRowid } = db.prepare('INSERT INTO versions (id, chapters, verses, indexed_at) VALUES (?, 0, 0, ?)')
        .run(id, Date.now());
      const vid = Number(lastInsertRowid);
      const table = tableFor(vid);
      db.exec(`CREATE VIRTUAL TABLE "${table}" USING fts5(norm, text UNINDEXED, chapter_idx UNINDEXED, verse UNINDEXED, tokenize = 'trigram')`);
      const insert = db.prepare(`INSERT INTO "${table}" (norm, text, chapter_idx, verse) VALUES (?, ?, ?, ?)`);
      let verses = 0;
      chapters.forEach((chapter, chapterIndex) => {
        const book = chapter && chapter.book || '';
        const chap = chapter && chapter.chapter || '';
        String(chapter && chapter.content || '').split('\n').forEach((line) => {
          const match = line.match(/^(\d+)\s+(.+)/);
          if (!match) return;
          insert.run(normalizeSearchText(`${book} ${chap}:${match[1]} ${match[2]}`), match[2], chapterIndex, match[1]);
          verses++;
        });
      });
      db.prepare('UPDATE versions SET chapters = ?, verses = ? WHERE vid = ?').run(chapters.length, verses, vid);
      db.exec('COMMIT');
      return { id, chapters: chapters.length, verses };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },

  remove({ id }) {
    return removeVersion(id);
  },

  clear() {
    resetSchema();
    return true;
  },

  // tokens are already normalized; every token must appear in the verse.
  // chapters (optional) limits the search to those chapter indexes.
  search({ id, tokens, chapters, max }) {
    const row = db.prepare('SELECT vid FROM versions WHERE id = ?').get(id);
    if (!row || !Array.isArray(tokens) || !tokens.length) return null;
    const table = tableFor(row.vid);
    const long = [];
    const params = [];
    const where = [];
    tokens.forEach((token) => {
      if ([...token].length >= 3) {
        long.push(`"${token.replace(/"/g, '""')}"`);
      } else {
        where.push("norm LIKE ? ESCAPE '\\'");
        params.push(`%${token.replace(/[\\%_]/g, '\\$&')}%`);
      }
    });
    if (long.length) {
      where.unshift(`"${table}" MATCH ?`);
      params.unshift(long.join(' AND '));
    }
    if (Array.isArray(chapters)) {
      if (!chapters.length) return [];
      where.push(`chapter_idx IN (${chapters.map(n => Number(n) | 0).join(',')})`);
    }
    const limit = Math.max(1, Math.min(Number(max) || 200, 1000));
    return db.prepare(`SELECT chapter_idx AS chapterIndex, verse, text FROM "${table}" WHERE ${where.join(' AND ')} ORDER BY rowid LIMIT ${limit}`)
      .all(...params)
      .map(r => ({ chapterIndex: Number(r.chapterIndex), verse: String(r.verse), text: r.text }));
  }
};

parentPort.on('message', ({ requestId, method, payload }) => {
  try {
    if (!methods[method]) throw new Error(`unknown method ${method}`);
    parentPort.postMessage({ requestId, result: methods[method](payload || {}) });
  } catch (error) {
    parentPort.postMessage({ requestId, error: String(error && error.message || error) });
  }
});
