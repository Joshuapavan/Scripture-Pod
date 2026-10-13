const fs = require('fs');
const { execFileSync } = require('child_process');
const parse5 = require('parse5');
const postcss = require('postcss');

const htmlPath = 'UI/scripture-pod-panel.html';
const cssPath = 'UI/scripture-pod-panel.css';
const html = fs.readFileSync(htmlPath, 'utf8');
const committedHtml = execFileSync('git', ['show', 'HEAD:UI/scripture-pod-panel.html'], { encoding: 'utf8' });
const committedAst = parse5.parse(committedHtml);
const cssParts = [];
function collectCommittedStyles(node) {
  if (node.tagName === 'style') {
    cssParts.push((node.childNodes || []).map(child => child.value || '').join(''));
  }
  (node.childNodes || []).forEach(collectCommittedStyles);
}
collectCommittedStyles(committedAst);
if (!cssParts.length) throw new Error('No committed panel styles found');
const ast = parse5.parse(html, { sourceCodeLocationInfo: true });
const existingIds = new Set();
const groups = new Map();
const edits = [];
let generatedId = 0;
let styleCount = 0;

function walk(node) {
  if (node.tagName === 'style') {
    cssParts.push((node.childNodes || []).map(child => child.value || '').join(''));
    if (node.sourceCodeLocation) {
      edits.push({
        start: node.sourceCodeLocation.startOffset,
        end: node.sourceCodeLocation.endOffset,
        replacement: ''
      });
    }
  }
  if (node.attrs) {
    const idAttribute = node.attrs.find(attribute => attribute.name === 'id');
    const styleAttribute = node.attrs.find(attribute => attribute.name === 'style');
    if (idAttribute) existingIds.add(idAttribute.value);

    if (styleAttribute && styleAttribute.value.trim()) {
      styleCount += 1;
      let id = idAttribute?.value;
      if (!id) {
        do {
          id = `panel-inline-style-${++generatedId}`;
        } while (existingIds.has(id));
        existingIds.add(id);
      }

      const styleLocation = node.sourceCodeLocation.attrs.style;
      const group = groups.get(styleAttribute.value) || { ids: [], value: styleAttribute.value };
      group.ids.push(id);
      groups.set(styleAttribute.value, group);
      edits.push({
        start: styleLocation.startOffset,
        end: styleLocation.endOffset,
        replacement: idAttribute ? '' : `id="${id}"`
      });
    }
  }

  (node.childNodes || []).forEach(walk);
}

walk(ast);
if (styleCount > 298) throw new Error(`Unexpected inline style count: ${styleCount}`);

let committedInlineStyleCount = 0;
let committedGeneratedId = 0;
function collectCommittedInlineStyles(node) {
  if (node.attrs) {
    const idAttribute = node.attrs.find(attribute => attribute.name === 'id');
    const styleAttribute = node.attrs.find(attribute => attribute.name === 'style');
    if (styleAttribute && styleAttribute.value.trim()) {
      committedInlineStyleCount += 1;
      const id = idAttribute?.value || `panel-inline-style-${++committedGeneratedId}`;
      if (!existingIds.has(id)) {
        throw new Error(`Current markup is missing the styled element #${id}`);
      }
      const group = groups.get(styleAttribute.value) || { ids: [], value: styleAttribute.value };
      group.ids.push(id);
      groups.set(styleAttribute.value, group);
    }
  }
  (node.childNodes || []).forEach(collectCommittedInlineStyles);
}
collectCommittedInlineStyles(committedAst);
if (committedInlineStyleCount !== 298 || committedGeneratedId !== 199) {
  throw new Error(`Unexpected committed inline-style map: ${committedInlineStyleCount} styles, ${committedGeneratedId} generated IDs`);
}

let nextHtml = html;
edits.sort((left, right) => right.start - left.start);
for (const edit of edits) {
  nextHtml = nextHtml.slice(0, edit.start) + edit.replacement + nextHtml.slice(edit.end);
}

const generatedRules = [];
for (const group of groups.values()) {
  const selectors = group.ids.map(id => {
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) return `#${id}#${id}`;
    const escapedId = JSON.stringify(id);
    return `[id=${escapedId}][id=${escapedId}]`;
  }).join(',\n');
  const parsedStyle = postcss.parse(`.inline-style { ${group.value} }`);
  const declarations = parsedStyle.first.nodes.map(declaration => {
    return `  ${declaration.prop}: ${declaration.value}${declaration.important ? ' !important' : ''};`;
  }).join('\n');
  generatedRules.push(`${selectors} {\n${declarations}\n}`);
}

const verification = parse5.parse(nextHtml);
let remainingStyles = 0;
let remainingStyleBlocks = 0;
function verify(node) {
  if (node.attrs?.some(attribute => attribute.name === 'style' && attribute.value.trim())) {
    remainingStyles += 1;
  }
  if (node.tagName === 'style') remainingStyleBlocks += 1;
  (node.childNodes || []).forEach(verify);
}
verify(verification);
if (remainingStyles || remainingStyleBlocks) throw new Error(`Extraction left ${remainingStyles} inline styles and ${remainingStyleBlocks} style blocks`);

if (nextHtml.includes('href="./scripture_pod-panel.css"')) {
  nextHtml = nextHtml.replace('href="./scripture_pod-panel.css"', 'href="./scripture-pod-panel.css"');
} else if (!nextHtml.includes('href="./scripture-pod-panel.css"')) {
  nextHtml = nextHtml.replace('</title>', '</title>\n  <link rel="stylesheet" href="./scripture-pod-panel.css">');
}

fs.writeFileSync(htmlPath, nextHtml);
const css = `${cssParts.join('\n\n')}\n\n/* Extracted inline panel styles */\n${generatedRules.join('\n\n')}\n`;
fs.writeFileSync(cssPath, css);
console.log(`Restored ${cssParts.length} stylesheet blocks and ${committedInlineStyleCount} committed inline styles into ${cssPath} (${groups.size} reusable rules).`);