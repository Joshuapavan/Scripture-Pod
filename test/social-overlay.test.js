const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const social = require('../src/shared/social-overlay.js');
const panelHtml = read('src/renderer/panel/panel.html');

test('the social overlay source is safe to inline in a template literal', () => {
  assert.ok(social.css.length > 1000);
  assert.ok(!social.css.includes('`') && !social.css.includes('${'));
  assert.ok(!global.SP_SOCIAL_SOURCE.includes('`') && !global.SP_SOCIAL_SOURCE.includes('${'));
});

test('every handle, action and style option has a panel control', () => {
  for (const platform of social.platforms) assert.ok(panelHtml.includes(`id="social-engagement-${platform}"`), `handle ${platform}`);
  for (const action of social.actions) assert.ok(panelHtml.includes(`id="social-engagement-${action}"`), `action ${action}`);
  const selects = { layout: social.layouts, theme: social.themes, position: social.positions, motion: social.motions };
  for (const [name, values] of Object.entries(selects)) {
    assert.ok(panelHtml.includes(`id="social-engagement-${name}"`), `select ${name}`);
    for (const value of values) assert.ok(panelHtml.includes(`<option value="${value}"`), `option ${name}=${value}`);
  }
});

test('the display and the embedded output page both use the shared overlay', () => {
  const display = read('src/renderer/display/display.html');
  const output = read('src/renderer/panel/scripts/output/output-and-streaming.js');
  assert.ok(display.includes('shared/social-overlay.js'));
  assert.ok(output.includes('SP_SOCIAL_SOURCE') && output.includes('SP_SOCIAL.css'));
});
