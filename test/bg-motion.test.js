const test = require('node:test');
const assert = require('node:assert/strict');
const bg = require('../src/shared/bg-motion.js');

test('every background motion has its own style, and an unknown one falls back to Drift', () => {
  const css = bg.css('bg-layer');
  bg.ids.filter((id) => id !== 'drift').forEach((id) => assert.ok(css.includes('.bg-motion-' + id), id));
  assert.equal(bg.normalize('aurora'), 'aurora');
  assert.equal(bg.normalize('nonsense'), 'drift');
  assert.equal(bg.normalize(undefined), 'drift');
});

test('the styles are written for the element they are given and keep to cheap properties', () => {
  const css = bg.css('bg');
  assert.ok(css.includes('#bg.bg-animated.bg-motion-waves'));
  assert.ok(!css.includes('#bg-layer'));
  assert.ok(!/filter\s*:\s*blur/.test(css), 'no blur filters');
  assert.ok(css.includes('prefers-reduced-motion'));
  // Every keyframe that is used exists
  const used = [...css.matchAll(/animation:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
  used.filter((n) => n.startsWith('bgm-')).forEach((n) => assert.ok(css.includes('@keyframes ' + n), n));
});

test('applying a motion sets one class and the colours to tint from', () => {
  const classes = new Set(['bg-animated', 'bg-motion-dust']);
  const vars = {};
  const el = { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, style: { setProperty: (k, v) => { vars[k] = v; } } };
  bg.apply(el, 'embers', '#110000', '#FF3300');
  assert.ok(classes.has('bg-motion-embers'));
  assert.ok(!classes.has('bg-motion-dust'));
  assert.equal(vars['--bg-hi'], '#FF3300');
  bg.apply(el, 'junk', 'bad', 'bad');
  assert.ok(classes.has('bg-motion-drift'));
  assert.equal(vars['--bg-hi'], '#ffffff');
});

test('a colour chosen for the movement wins over the gradient glow', () => {
  const vars = {};
  const el = { classList: { toggle: () => {} }, style: { setProperty: (k, v) => { vars[k] = v; } } };
  bg.apply(el, 'orbs', '#000000', '#FF0000', '#00FF88');
  assert.equal(vars['--bg-hi'], '#00FF88');
  bg.apply(el, 'orbs', '#000000', '#FF0000', '');
  assert.equal(vars['--bg-hi'], '#FF0000');
  bg.apply(el, 'orbs', '#000000', '#FF0000', 'not a colour');
  assert.equal(vars['--bg-hi'], '#FF0000');
});
