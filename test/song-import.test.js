const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { parseSongFile, detectSongFormat, docxToText, rtfToText } = require('../src/shared/song-import.js');

test('OpenLyrics verses become tagged sections', () => {
  const xml = '<?xml version="1.0"?><song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8"><properties><titles><title>Made Up Hymn</title></titles></properties><lyrics><verse name="v1"><lines>alpha one<br/>alpha two</lines></verse><verse name="c"><lines>beta one<br/>beta &amp; two</lines></verse></lyrics></song>';
  assert.equal(detectSongFormat('x.xml', xml), 'openlyrics');
  const s = parseSongFile('x.xml', xml);
  assert.equal(s.title, 'Made Up Hymn');
  assert.equal(s.content, '[Verse 1]\nalpha one\nalpha two\n\n[Chorus]\nbeta one\nbeta & two');
});

test('OpenSong sections, chords and comments', () => {
  const xml = '<song><title>Plain Tune</title><lyrics>[V1]\n.C   G\n first line\n second line\n;a note\n[C]\n chorus line</lyrics></song>';
  assert.equal(detectSongFormat('y.xml', xml), 'opensong');
  const s = parseSongFile('y.xml', xml);
  assert.equal(s.title, 'Plain Tune');
  assert.equal(s.content, '[Verse 1]\nfirst line\nsecond line\n\n[Chorus]\nchorus line');
});

test('ProPresenter 6 slides are read from their rich text', () => {
  const rtf = (t) => Buffer.from('{\\rtf1\\ansi{\\fonttbl\\f0 Arial;}\\f0 ' + t.replace(/\n/g, '\\par ') + '}').toString('base64');
  const xml = '<RVPresentationDocument CCLISongTitle="Sample Song"><RVDisplaySlide label="Verse 1"><RVTextElement RTFData="' + rtf('one line\ntwo line') + '"/></RVDisplaySlide><RVDisplaySlide label="Chorus"><RVTextElement RTFData="' + rtf('sing it') + '"/></RVDisplaySlide></RVPresentationDocument>';
  const s = parseSongFile('z.pro6', xml);
  assert.equal(s.title, 'Sample Song');
  assert.equal(s.content, '[Verse 1]\none line\ntwo line\n\n[Chorus]\nsing it');
});

test('rich text keeps paragraphs and accents', () => {
  assert.equal(rtfToText("{\\rtf1\\ansi caf\\'e9\\par second line}"), 'café\nsecond line');
});

test('a Word file is read paragraph by paragraph', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>First line</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r><w:r><w:t xml:space="preserve"> line</w:t></w:r></w:p></w:body></w:document>';
  const data = zlib.deflateRawSync(Buffer.from(xml));
  const name = Buffer.from('word/document.xml');
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(8, 8); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(xml.length, 22); head.writeUInt16LE(name.length, 26);
  const zip = Buffer.concat([head, name, data]);
  assert.equal(await docxToText(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length)), 'First line\nSecond line');
});

test('other files are not mistaken for songs', () => {
  assert.equal(detectSongFormat('bible.xml', '<bible translation="X"><book/></bible>'), '');
  assert.equal(parseSongFile('n.xml', '<note>hi</note>'), null);
});
