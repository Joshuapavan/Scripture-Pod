/* Scripture Pod — favourite lower-third designs.
 * A favourite is the value of a design in the picker ("classic-gms-rise", or "custom:<id>" for one you made).
 * The list is kept in order, newest last, and saved on this computer. Pure helpers, used by
 * src/renderer/panel/scripts/output/sync-and-output.js and by test/lt-favourites.test.js. */
(function (root) {
  var MAX = 60;

  function parse(raw) {
    var list;
    try { list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; } catch (e) { list = []; }
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (v) {
      if (typeof v !== 'string' || !v || v.length > 120 || seen[v]) return false;
      seen[v] = true;
      return true;
    }).slice(0, MAX);
  }

  function has(list, value) { return list.indexOf(value) >= 0; }

  // Adds the design, or takes it out when it is there already
  function toggle(list, value) {
    if (!value) return list.slice();
    if (has(list, value)) return list.filter(function (v) { return v !== value; });
    return list.concat(value).slice(-MAX);
  }

  // The favourites that still exist (a design you deleted drops out), with their labels, in the order saved
  function resolve(list, known) {
    var labels = {};
    (known || []).forEach(function (o) { if (o && o.value && !(o.value in labels)) labels[o.value] = o.label; });
    return list.filter(function (v) { return v in labels; }).map(function (v) { return { value: v, label: labels[v] }; });
  }

  var api = { parse: parse, has: has, toggle: toggle, resolve: resolve, MAX: MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_LT_FAVOURITES = api;
})(typeof window !== 'undefined' ? window : globalThis);
