/* Scripture Pod — shared song library on Firebase (Cloud Firestore, through its REST API: no extra packages).
 *
 * Every song saved in the app is uploaded to the "songs" collection, and the lyrics search looks there first.
 * One document per song title, so the same song added on two computers is stored once.
 *
 * Uses the project in song-cloud-config.js (scripture-pod for the bundle), which the user can change or switch off
 * under Settings > Cloud song database. With no project id or when switched off, every call here does nothing.
 *
 * Firestore rules must allow reads and writes on /songs/{doc} for this to work.
 *
 * Used by src/renderer/panel/scripts/core/state-and-storage.js (upload) and
 * src/renderer/panel/scripts/ui/workspace-and-editor-tools.js (search), and by test/song-cloud.test.js.
 */
(function (root) {
  var COLLECTION = 'songs';
  var SOURCE_NAME = 'Scripture Pod Cloud';

  var SETTINGS_KEY = 'scripturePod.cloudDb.v1';

  // Settings saved on this computer win over the defaults in song-cloud-config.js (the Scripture Pod bundle's project)
  function getConfig() {
    var d = (root && root.SP_FIREBASE_CONFIG) || {};
    var saved = {};
    try { saved = JSON.parse(root.localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    function pick(k) { return String(saved[k] != null && saved[k] !== '' ? saved[k] : (d[k] || '')).trim(); }
    return {
      enabled: saved.enabled !== false,
      projectId: pick('projectId'),
      projectNumber: pick('projectNumber'),
      apiKey: pick('apiKey')
    };
  }
  function saveSettings(next) {
    try { root.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next || {})); } catch (e) { /* storage unavailable */ }
  }
  // The API key is optional: it is only needed when the project's rules or Google Cloud settings ask for one
  function isEnabled() { var c = getConfig(); return !!(c.enabled && c.projectId); }

  // "Yeshu  Naam!" -> "yeshu naam": lower case, letters and digits only, one space between words
  function titleKey(title) {
    return String(title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function docIdFor(title) {
    var key = titleKey(title);
    return key ? encodeURIComponent(key.replace(/ /g, '-')).slice(0, 300) : '';
  }
  function wordsOf(text) {
    var seen = {};
    return titleKey(text).split(' ').filter(function (w) { if (!w || seen[w]) return false; seen[w] = true; return true; }).slice(0, 30);
  }

  function baseUrl() { return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(getConfig().projectId) + '/databases/(default)/documents'; }
  function keyParam() { var k = getConfig().apiKey; return k ? 'key=' + encodeURIComponent(k) : ''; }
  function withKey(url) { var k = keyParam(); return k ? url + (url.indexOf('?') < 0 ? '?' : '&') + k : url; }

  function toFields(song) {
    var title = String(song.title || '').trim();
    var content = String(song.content != null ? song.content : (song.text || '')).trim();
    return {
      title: { stringValue: title },
      titleKey: { stringValue: titleKey(title) },
      words: { arrayValue: { values: wordsOf(title).map(function (w) { return { stringValue: w }; }) } },
      content: { stringValue: content },
      updatedAt: { integerValue: String(Date.now()) }
    };
  }
  function fromDoc(doc) {
    var f = (doc && doc.fields) || {};
    var title = f.title && f.title.stringValue;
    var content = f.content && f.content.stringValue;
    if (!title || !content) return null;
    return { title: title, artist: '', album: '', lyrics: content, source: SOURCE_NAME, worship: true };
  }

  var lastUploaded = {};  // doc id -> content last sent, so unchanged songs are not sent again

  // Fire and forget: failures are logged and never get in the way of saving the song locally
  function uploadSong(song) {
    try {
      if (!isEnabled() || !song || typeof fetch !== 'function') return Promise.resolve(false);
      var id = docIdFor(song.title);
      var fields = toFields(song);
      var content = fields.content.stringValue;
      if (!id || !content || lastUploaded[id] === content) return Promise.resolve(false);
      lastUploaded[id] = content;
      return fetch(withKey(baseUrl() + '/' + COLLECTION + '/' + id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields })
      }).then(function (res) {
        if (!res.ok) { delete lastUploaded[id]; console.warn('Song upload failed', res.status); }
        return res.ok;
      }).catch(function (e) { delete lastUploaded[id]; console.warn('Song upload failed', e); return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function runQuery(where, limit, signal) {
    return fetch(withKey(baseUrl() + ':runQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: signal,
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: COLLECTION }], where: where, limit: limit } })
    }).then(function (res) { return res.ok ? res.json() : []; }).catch(function () { return []; });
  }

  // Songs whose title starts with the search, or has one of its words. Resolves to [] when off or offline.
  function searchSongs(query, limit, signal) {
    if (!isEnabled() || typeof fetch !== 'function') return Promise.resolve([]);
    var key = titleKey(query);
    if (!key) return Promise.resolve([]);
    var max = limit || 10;
    var longest = key.split(' ').sort(function (a, b) { return b.length - a.length; })[0];
    var queries = [
      runQuery({ compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'titleKey' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: key } } },
        { fieldFilter: { field: { fieldPath: 'titleKey' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: key + '' } } }
      ] } }, max, signal),
      runQuery({ fieldFilter: { field: { fieldPath: 'words' }, op: 'ARRAY_CONTAINS', value: { stringValue: longest } } }, max, signal)
    ];
    return Promise.all(queries).then(function (lists) {
      var seen = {};
      var out = [];
      lists.forEach(function (rows) {
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          var song = fromDoc(row && row.document);
          if (!song) return;
          var k = titleKey(song.title);
          if (seen[k]) return;
          seen[k] = true;
          out.push(song);
        });
      });
      return out;
    });
  }

  var api = { isEnabled: isEnabled, getConfig: getConfig, saveSettings: saveSettings, titleKey: titleKey, docIdFor: docIdFor, uploadSong: uploadSong, searchSongs: searchSongs, SOURCE_NAME: SOURCE_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_SONG_CLOUD = api;
})(typeof window !== 'undefined' ? window : globalThis);
