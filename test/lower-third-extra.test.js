const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const extra = require('../js/shared/lower-third-extra.js');

const consumers = {
  display: read('UI/scripture-pod-display.html'),
  output: read('js/panel/output-and-streaming.js'),
  bootstrap: read('js/panel/bootstrap-and-init.js')
};
const panelHtml = read('UI/scripture-pod-panel.html');

test('extra lower-third CSS is safe to inline in a template literal', () => {
  assert.ok(extra.css.length > 1000);
  assert.ok(!extra.css.includes('`'));
  assert.ok(!extra.css.includes('${'));
});

test('every extra design is selectable in all three layouts and styled', () => {
  for (const theme of extra.themes) {
    for (const layout of ['classic', 'centered', 'band']) {
      assert.ok(panelHtml.includes(`value="${layout}-${theme}"`), `panel option ${layout}-${theme}`);
    }
    assert.ok(extra.css.includes(`.theme-${theme}`), `css for ${theme}`);
  }
});

test('every extra animation is selectable and styled', () => {
  for (const motion of extra.motions) {
    assert.ok(panelHtml.includes(`<option value="${motion}">`), `panel option ${motion}`);
    assert.ok(extra.css.includes(`.motion-${motion}`), `css for ${motion}`);
  }
});

test('renderers accept and clear every extra design and animation', () => {
  for (const [name, source] of Object.entries(consumers)) {
    for (const theme of extra.themes) assert.ok(source.includes(`|${theme}|`) || source.includes(`|${theme})`), `${name} regex ${theme}`);
    for (const motion of extra.motions) assert.ok(source.includes(`|${motion}|`) || source.includes(`|${motion})`), `${name} regex ${motion}`);
  }
  for (const name of ['display', 'output']) {
    for (const theme of extra.themes) assert.ok(consumers[name].includes(`'theme-${theme}'`), `${name} class list ${theme}`);
    for (const motion of extra.motions) assert.ok(consumers[name].includes(`'motion-${motion}'`), `${name} class list ${motion}`);
  }
});
