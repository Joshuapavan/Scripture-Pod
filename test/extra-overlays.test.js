const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const extra = require('../src/shared/extra-overlays.js');

test('the shared file is safe to inline in a template literal', () => {
  assert.ok(extra.css.length > 1000);
  assert.ok(!read('src/shared/extra-overlays.js').includes('`'));
  assert.ok(!extra.css.includes('${'));
  assert.ok(typeof globalThis.SP_EXTRA_SOURCE === 'string' && globalThis.SP_EXTRA_SOURCE.includes('spExtraModule'));
});

test('a QR grid becomes one drawing path with a quiet border', () => {
  // 3 x 3 grid with a dark top row and a dark centre
  const grid = extra.qrPath({ n: 3, d: '111010000' });
  assert.equal(grid.size, 3 + 8);
  assert.equal(grid.path, 'M4 4h3v1h-3zM5 5h1v1h-1z');
  assert.equal(extra.qrPath({ n: 3, d: '11' }).size, 0);
  assert.equal(extra.qrPath(null).path, '');
});

test('the countdown reads minutes and seconds, and hours once there are any', () => {
  assert.equal(extra.formatCountdown(125000), '02:05');
  assert.equal(extra.formatCountdown(59001), '01:00');
  assert.equal(extra.formatCountdown(3725000), '1:02:05');
  assert.equal(extra.formatCountdown(-5), '00:00');
});

test('a clock time means the next time it is on the clock', () => {
  const noon = new Date(2026, 9, 31, 12, 0, 0).getTime();
  assert.equal(new Date(extra.nextClockTime('18:30', noon)).getDate(), 31);
  assert.equal(new Date(extra.nextClockTime('18:30', noon)).getHours(), 18);
  assert.equal(new Date(extra.nextClockTime('09:15', noon)).getDate(), 1);
  assert.equal(extra.nextClockTime('25:00', noon), null);
  assert.equal(extra.nextClockTime('soon', noon), null);
});

test('ticker messages are joined, and a pass takes longer for longer text', () => {
  assert.equal(extra.tickerText('Welcome\n\n  Service at 6  \n'), 'Welcome   •   Service at 6');
  assert.ok(extra.tickerSeconds(3000, 1000, 'slow') > extra.tickerSeconds(3000, 1000, 'fast'));
  assert.ok(extra.tickerSeconds(10, 10, 'fast') >= 6);
});

test('the display page and the preview page both load the overlays', () => {
  const display = read('src/renderer/display/display.html');
  assert.ok(display.includes('shared/extra-overlays.js'));
  assert.ok(display.includes('EXTRA_OVERLAYS'));
  const output = read('src/renderer/panel/scripts/output/output-and-streaming.js');
  assert.ok(output.includes('SP_EXTRA_SOURCE') && output.includes('EXTRA_OVERLAYS'));
  assert.ok(read('src/renderer/panel/panel.html').includes('shared/extra-overlays.js'));
});
