    // Desktop app: Bible search runs against a SQLite index on disk (see
    // src/main/bible-search-worker.js) instead of an index in this page's
    // memory. Elsewhere, or if the index is unavailable, search falls back to
    // the in-memory scan in state-and-storage.js.
    const bibleSearchDbReady = new Set();
    const bibleSearchDbTimers = new Map();
    const BIBLE_SEARCH_DB_REINDEX_DELAY_MS = 1000;

    function bibleSearchDbAvailable() {
      return !!(window.BSPDesktop && typeof window.BSPDesktop.bibleSearch === 'function');
    }

    function buildBibleSearchDbChapters(list) {
      return list.map((item) => {
        const extracted = extractBookAndChapter(item);
        return {
          book: item?.book || extracted.book || '',
          chapter: item?.chapter || extracted.chap || '',
          content: String(item?.content || '')
        };
      });
    }

    function indexBibleInSearchDb(id, list) {
      return window.BSPDesktop.bibleSearch('index', { id, chapters: buildBibleSearchDbChapters(list) })
        .then(() => { bibleSearchDbReady.add(id); return true; })
        .catch(() => false);
    }

    // Bible records are written from several places (import, annotate, sync,
    // restore); idbPut / dbPutMany / idbDelete / dbClearStore call these so the
    // index follows the stored data. Re-indexing is debounced because
    // annotating saves a version repeatedly.
    function queueBibleSearchDbIndex(record) {
      if (!bibleSearchDbAvailable() || !record || !record.id || record.unloaded || !Array.isArray(record.parsedData)) return;
      const id = record.id;
      const list = record.parsedData;
      bibleSearchDbReady.delete(id);
      clearTimeout(bibleSearchDbTimers.get(id));
      bibleSearchDbTimers.set(id, setTimeout(() => {
        bibleSearchDbTimers.delete(id);
        indexBibleInSearchDb(id, list);
      }, BIBLE_SEARCH_DB_REINDEX_DELAY_MS));
    }

    function removeBibleFromSearchDb(id) {
      if (!bibleSearchDbAvailable()) return;
      clearTimeout(bibleSearchDbTimers.get(id));
      bibleSearchDbTimers.delete(id);
      bibleSearchDbReady.delete(id);
      window.BSPDesktop.bibleSearch('remove', { id }).catch(() => {});
    }

    function clearBibleSearchDb() {
      if (!bibleSearchDbAvailable()) return;
      bibleSearchDbTimers.forEach(timer => clearTimeout(timer));
      bibleSearchDbTimers.clear();
      bibleSearchDbReady.clear();
      window.BSPDesktop.bibleSearch('clear').catch(() => {});
    }

    // After startup: index any version the database does not have yet, one at a
    // time (each is loaded, sent, and left for the idle unload to free).
    async function syncBibleSearchDb() {
      if (!bibleSearchDbAvailable()) return;
      let known;
      try {
        known = await window.BSPDesktop.bibleSearch('status');
      } catch (error) {
        return;
      }
      const have = new Map(known.map(row => [row.id, row.chapters]));
      for (const id of Object.keys(bibles)) {
        if (bibleSearchDbTimers.has(id)) continue;
        if (!isBibleLoaded(id) && have.has(id)) { bibleSearchDbReady.add(id); continue; }
        if (!(await ensureBibleLoaded(id))) continue;
        // A chapter count mismatch means the stored index is stale
        if (have.get(id) === bibles[id].length) { bibleSearchDbReady.add(id); continue; }
        await indexBibleInSearchDb(id, bibles[id]);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Matches for a keyword search, or null when the database cannot answer
    // (caller falls back to findBibleKeywordMatches).
    async function findBibleKeywordMatchesInDb(query, opts = {}) {
      const versionId = opts.versionId || activeBibleVersion;
      if (!bibleSearchDbAvailable() || !bibleSearchDbReady.has(versionId) || !isBibleLoaded(versionId)) return null;
      const q = normalizeSearchText(query).trim();
      if (!q || q.length < 2) return [];
      const tokens = q.split(/\s+/).filter(Boolean);
      const list = bibles[versionId];
      const bookKey = normalizeBookName(opts.book || '');
      let chapters;
      if (bookKey) {
        chapters = [];
        list.forEach((item, index) => {
          if (normalizeBookName(item?.book || extractBookAndChapter(item).book || '') === bookKey) chapters.push(index);
        });
      }
      let rows;
      try {
        rows = await window.BSPDesktop.bibleSearch('search', { id: versionId, tokens, chapters, max: opts.maxResults || 200 });
      } catch (error) {
        return null;
      }
      if (!rows) return null;
      return rows.map((row) => {
        const item = list[row.chapterIndex];
        const extracted = extractBookAndChapter(item);
        return {
          chapterIndex: row.chapterIndex,
          book: item?.book || extracted.book || '',
          chapter: item?.chapter || extracted.chap || '',
          verse: row.verse,
          text: row.text
        };
      });
    }

