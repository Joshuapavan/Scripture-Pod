const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, summarize } = require('../src/shared/displays-view.js');

const live = { live: true, kind: 'bible', ref: 'John 3:16' };

test('an open display shows what is on air', () => {
  const d = describe({ kind: 'feed', role: 'live', open: true }, live);
  assert.equal(d.status, 'live');
  assert.equal(d.showing, 'John 3:16');
  assert.match(d.how, /lower third/);
});

test('nothing on air means clear, a closed window means off, a blanked one means blank', () => {
  assert.equal(describe({ kind: 'main', open: true }, { live: false }).status, 'clear');
  assert.equal(describe({ kind: 'main', open: false }, live).status, 'off');
  assert.equal(describe({ kind: 'main', open: true, blank: true }, live).status, 'blank');
});

test('a monitor says there is no clock for the Bible', () => {
  assert.match(describe({ kind: 'main', role: 'monitor', open: true }, live).how, /no clock/);
  assert.match(describe({ kind: 'main', role: 'monitor', open: true }, { live: true, kind: 'lyrics' }).how, /clock/);
});

test('the summary counts every state', () => {
  const snap = { onAir: live, displays: [{ kind: 'feed', open: true }, { kind: 'main', open: true, blank: true }, { kind: 'stage', open: false }] };
  assert.deepEqual(summarize(snap), { live: 1, preview: 0, clear: 0, blank: 1, off: 1 });
});

test('the preview monitor shows what is cued, never live', () => {
  const cued = describe({ kind: 'preview', open: true, cued: true, showing: 'Psalm 23:1' }, live);
  assert.equal(cued.status, 'preview');
  assert.equal(cued.showing, 'Psalm 23:1');
  assert.equal(describe({ kind: 'preview', open: true, cued: false }, live).status, 'clear');
});

test('stream media shows as a display: live while something plays, clear otherwise', () => {
  const on = describe({ kind: 'media', open: true, showing: 'ACI Intro' }, { live: false });
  assert.equal(on.status, 'live');
  assert.equal(on.showing, 'ACI Intro');
  assert.equal(describe({ kind: 'media', open: true, showing: '' }, live).status, 'clear');
});
