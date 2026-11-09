/* Scripture Pod — song order and services.
 *
 * Songs can be dragged into any order (song.order) and filed under one or more services such as
 * "Sunday morning" (song.services holds service ids). The list of services lives in localStorage.
 *
 * Used by src/renderer/panel/scripts/ui/song-services.js, the hydrate/build steps in
 * core/state-and-storage.js and core/bootstrap-and-init.js, and test/song-services.test.js.
 */
(function (root) {
  var STORAGE_KEY = 'scripturePod.songServices.v1';

  // Songs with a saved order come first, in that order; songs never moved follow, oldest first
  function sortSongs(songs) {
    return songs
      .map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) {
        var ao = Number.isFinite(a.s.order), bo = Number.isFinite(b.s.order);
        if (ao && bo) return a.s.order - b.s.order || a.i - b.i;
        if (ao !== bo) return ao ? -1 : 1;
        return (a.s.createdAt || 0) - (b.s.createdAt || 0) || a.i - b.i;
      })
      .map(function (x) { return x.s; });
  }

  // Puts the dragged song where the target song is, renumbers every song, and returns the songs whose number changed
  function moveSong(songs, fromId, toId) {
    var from = songs.findIndex(function (s) { return s.id === fromId; });
    var to = songs.findIndex(function (s) { return s.id === toId; });
    if (from < 0 || to < 0 || from === to) return [];
    var moved = songs.splice(from, 1)[0];
    songs.splice(to, 0, moved);
    var changed = [];
    songs.forEach(function (s, i) { if (s.order !== i) { s.order = i; changed.push(s); } });
    return changed;
  }

  function inService(song, serviceId) {
    if (!serviceId || serviceId === 'all') return true;
    return Array.isArray(song.services) && song.services.indexOf(serviceId) >= 0;
  }

  // Adds the song to the service, or takes it out if it is already there. Returns true when it is now in it.
  function toggleService(song, serviceId) {
    var list = Array.isArray(song.services) ? song.services.slice() : [];
    var at = list.indexOf(serviceId);
    if (at >= 0) list.splice(at, 1); else list.push(serviceId);
    song.services = list;
    return at < 0;
  }

  function load(storage) {
    try {
      var v = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') || {};
      var services = (Array.isArray(v.services) ? v.services : []).filter(function (x) { return x && x.id && x.name; });
      var active = services.some(function (x) { return x.id === v.active; }) ? v.active : 'all';
      return { services: services, active: active };
    } catch (e) { return { services: [], active: 'all' }; }
  }
  function save(storage, state) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function addService(state, name) {
    var clean = String(name || '').trim().slice(0, 40);
    if (!clean) return null;
    var dupe = state.services.find(function (x) { return x.name.toLowerCase() === clean.toLowerCase(); });
    if (dupe) return dupe;
    var svc = { id: 'svc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: clean };
    state.services.push(svc);
    return svc;
  }
  function renameService(state, id, name) {
    var clean = String(name || '').trim().slice(0, 40);
    var svc = state.services.find(function (x) { return x.id === id; });
    if (!svc || !clean) return false;
    if (state.services.some(function (x) { return x.id !== id && x.name.toLowerCase() === clean.toLowerCase(); })) return false;
    svc.name = clean;
    return true;
  }
  // Removes the service and returns the songs that were filed under it (their lists are already updated)
  function removeService(state, songs, id) {
    state.services = state.services.filter(function (x) { return x.id !== id; });
    if (state.active === id) state.active = 'all';
    var touched = [];
    songs.forEach(function (s) {
      if (Array.isArray(s.services) && s.services.indexOf(id) >= 0) {
        s.services = s.services.filter(function (x) { return x !== id; });
        touched.push(s);
      }
    });
    return touched;
  }

  var api = { sortSongs: sortSongs, moveSong: moveSong, inService: inService, toggleService: toggleService, load: load, save: save, addService: addService, renameService: renameService, removeService: removeService };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_SONG_SERVICES = api;
})(typeof window !== 'undefined' ? window : globalThis);
