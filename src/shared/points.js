/* Scripture Pod — sermon points shown as a lower third.
 * The pastor says a point, the operator shows it. A point is a line of text; the lower third that shows it is the
 * Name & Role one (same design, colours and animation), with the point as the big line and "Point 2" as the small one.
 * Pure helpers, used by src/renderer/panel/scripts/ui/points-overlay.js and by test/points.test.js. */
(function (root) {
  // One point per line; blank lines and a leading "1." / "-" / "•" are dropped, the rest is kept as typed
  function parsePoints(text) {
    return String(text == null ? '' : text).split(/\r?\n/)
      .map(function (line) { return line.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').trim(); })
      .filter(Boolean)
      .slice(0, 100)
      .map(function (t) { return t.slice(0, 220); });
  }

  // The small line under the point: "Point 2", "Point 2 of 5", or the label alone
  function roleFor(index, total, opts) {
    var o = opts || {};
    var label = String(o.label == null ? '' : o.label).trim();
    if (!o.numbered) return label;
    var n = index + 1 + (o.of && total ? ' of ' + total : '');
    return (label ? label + ' ' : '') + n;
  }

  // Long points get a smaller type so they stay a few lines, never taller than the screen allows
  function sizeFor(text, base) {
    var size = Number(base) || 56;
    var len = String(text || '').length;
    if (len <= 48) return size;
    return Math.max(28, Math.round(size * Math.sqrt(48 / len)));
  }

  function clampIndex(index, total) {
    if (!total) return -1;
    return Math.max(0, Math.min(total - 1, index));
  }

  var api = { parsePoints: parsePoints, roleFor: roleFor, sizeFor: sizeFor, clampIndex: clampIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_POINTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
