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

  // What the last call to Firestore said, so the app can show it instead of failing quietly
  var status = { ok: null, code: 0, message: '', at: 0 };
  function setStatus(ok, code, message) {
    status = { ok: ok, code: code || 0, message: message || '', at: Date.now() };
    try { if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('sp-cloud-status', { detail: status })); } catch (e) { /* no window */ }
  }
  function getStatus() { return status; }
  // "Missing or insufficient permissions." from the error body, or the status code alone
  function errorText(res, body) {
    var msg = '';
    try { msg = (JSON.parse(body) || {}).error.message || ''; } catch (e) { msg = ''; }
    return msg || ('HTTP ' + (res && res.status));
  }

  // A song the library already has is never overwritten by a new copy (a search result added again, or the same
  // song typed on another computer): the library's version stays and is the one search shows. Only an edit of a
  // song, or { replace: true }, updates it.
  function isNewSong(song) {
    return !!song && song.createdAt != null && song.createdAt === song.updatedAt;
  }
  function alreadyThere(res, body) {
    return res.status === 409 || (res.status === 400 && /ALREADY_EXISTS|FAILED_PRECONDITION/.test(body || ''));
  }

  // Fire and forget: failures are logged and never get in the way of saving the song locally
  function uploadSong(song, opts) {
    try {
      if (!isEnabled() || !song || typeof fetch !== 'function') return Promise.resolve(false);
      var id = docIdFor(song.title);
      var fields = toFields(song);
      var content = fields.content.stringValue;
      if (!id || !content || lastUploaded[id] === content) return Promise.resolve(false);
      var createOnly = !(opts && opts.replace) && (isNewSong(song) || (opts && opts.createOnly));
      lastUploaded[id] = content;
      return fetch(withKey(baseUrl() + '/' + COLLECTION + '/' + id + (createOnly ? '?currentDocument.exists=false' : '')), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields })
      }).then(function (res) {
        if (res.ok) { setStatus(true, res.status, ''); return true; }
        var read = typeof res.text === 'function' ? res.text() : Promise.resolve('');
        return read.catch(function () { return ''; }).then(function (body) {
          // The library has this song already: that is fine, and its version is kept
          if (createOnly && alreadyThere(res, body)) { setStatus(true, res.status, ''); return false; }
          delete lastUploaded[id];
          var msg = errorText(res, body);
          console.warn('Song upload failed', res.status, msg);
          setStatus(false, res.status, msg);
          return false;
        });
      }).catch(function (e) { delete lastUploaded[id]; console.warn('Song upload failed', e); setStatus(false, 0, 'Could not reach Firebase (' + ((e && e.message) || 'offline') + ')'); return false; });
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

  // Sends every song, one after another. Stops at the first refusal (the rules, not the song, are the problem).
  function uploadAll(songs, onProgress) {
    var list = (Array.isArray(songs) ? songs : []).filter(function (s) { return s && docIdFor(s.title) && String(s.content != null ? s.content : (s.text || '')).trim(); });
    var sent = 0, i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve({ total: list.length, sent: sent, ok: true, status: status });
      var song = list[i++];
      return uploadSong(song, { createOnly: true }).then(function (ok) {
        // false is also "already sent": only a fresh refusal ends the run
        if (!ok && status.ok === false && status.at >= started) return { total: list.length, sent: sent, ok: false, status: status };
        if (ok) sent++;
        if (onProgress) onProgress(i, list.length);
        return next();
      });
    }
    var started = Date.now();
    return next();
  }

  // Does Firestore accept this project? A read, then a write that is refused or allowed without storing anything
  // (an update of a document that does not exist: the rules are checked first, then it answers "not found").
  function testConnection() {
    if (!isEnabled() || typeof fetch !== 'function') return Promise.resolve({ ok: false, read: null, write: null, message: 'Switched off, or no project ID' });
    var readCall = fetch(withKey(baseUrl() + ':runQuery'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: COLLECTION }], limit: 1 } })
    }).then(function (res) { return res.text().then(function (b) { return { ok: res.ok, code: res.status, message: res.ok ? '' : errorText(res, b) }; }); })
      .catch(function (e) { return { ok: false, code: 0, message: 'Could not reach Firebase (' + ((e && e.message) || 'offline') + ')' }; });
    var writeCall = fetch(withKey(baseUrl() + '/' + COLLECTION + '/__connection-check?currentDocument.exists=true'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFields({ title: 'connection check', content: 'check' }) })
    }).then(function (res) { return res.text().then(function (b) { return { ok: res.ok || res.status === 404, code: res.status, message: (res.ok || res.status === 404) ? '' : errorText(res, b) }; }); })
      .catch(function (e) { return { ok: false, code: 0, message: 'Could not reach Firebase (' + ((e && e.message) || 'offline') + ')' }; });
    return Promise.all([readCall, writeCall]).then(function (r) {
      var out = { ok: r[0].ok && r[1].ok, read: r[0], write: r[1] };
      setStatus(out.ok, out.ok ? 200 : (r[1].code || r[0].code), out.ok ? '' : (r[1].message || r[0].message));
      return out;
    });
  }

  var api = { getStatus: getStatus, uploadAll: uploadAll, testConnection: testConnection, isEnabled: isEnabled, getConfig: getConfig, saveSettings: saveSettings, titleKey: titleKey, docIdFor: docIdFor, uploadSong: uploadSong, searchSongs: searchSongs, SOURCE_NAME: SOURCE_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_SONG_CLOUD = api;
})(typeof window !== 'undefined' ? window : globalThis);
