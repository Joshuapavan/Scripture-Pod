/* Scripture Pod — reads songs saved by other presentation apps.
 *
 * Supported: OpenLyrics (.xml, used by OpenLP and others), OpenSong (.xml), ProPresenter 6 (.pro6),
 * Rich Text (.rtf) and Word (.docx). Every reader gives { title, content } where content is plain lyrics with
 * [Verse 1] / [Chorus] tags, the way songs are stored here.
 *
 * Used by the panel's Import button (src/renderer/panel/scripts/library/render-and-selection.js) and by
 * test/song-import.test.js.
 */
(function (root) {
  function decodeEntities(s) {
    return String(s || '')
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ''); }
  function tidy(text) {
    return String(text || '').replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/[ \t]+$/, ''); }).join('\n')
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  function firstTag(xml, tag) {
    var m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i').exec(xml);
    return m ? decodeEntities(stripTags(m[1])).trim() : '';
  }

  var KIND_NAMES = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-Chorus', i: 'Intro', e: 'Outro', t: 'Tag', o: 'Interlude' };
  function sectionTag(code) {
    var m = /^([a-z])(\d*)/i.exec(String(code || '').trim());
    if (!m) return '';
    var kind = KIND_NAMES[m[1].toLowerCase()] || 'Verse';
    var numbered = kind === 'Verse' || (m[2] && m[2] !== '1' && m[2] !== '');
    return '[' + kind + (numbered && m[2] ? ' ' + m[2] : '') + ']';
  }

  // OpenLyrics: <verse name="v1"><lines>one<br/>two</lines></verse>
  function parseOpenLyrics(xml) {
    var title = firstTag(xml, 'title');
    var blocks = [];
    var re = /<verse\b([^>]*)>([\s\S]*?)<\/verse>/gi;
    var m;
    while ((m = re.exec(xml))) {
      var name = (/name="([^"]*)"/i.exec(m[1]) || [])[1] || '';
      var lines = [];
      var lr = /<lines\b[^>]*>([\s\S]*?)<\/lines>/gi;
      var lm;
      while ((lm = lr.exec(m[2]))) lines.push(decodeEntities(stripTags(lm[1].replace(/<br\s*\/?>/gi, '\n'))).trim());
      var body = lines.join('\n').trim();
      if (!body) continue;
      var tag = sectionTag(name);
      blocks.push((tag ? tag + '\n' : '') + body);
    }
    return { title: title, content: tidy(blocks.join('\n\n')) };
  }

  // OpenSong: [V1] on its own line, lines starting with "." are chords and ";" are comments
  function parseOpenSong(xml) {
    var title = firstTag(xml, 'title');
    var lm = /<lyrics>([\s\S]*?)<\/lyrics>/i.exec(xml);
    var raw = lm ? decodeEntities(lm[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
    var out = [];
    raw.replace(/\r/g, '').split('\n').forEach(function (line) {
      if (/^\s*[.;]/.test(line)) return;
      var tag = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (tag) { out.push('', sectionTag(tag[1]) || '[' + tag[1] + ']'); return; }
      // "1 first line" / " first line": a leading verse digit or space is layout, not lyrics
      out.push(line.replace(/^[ \d]\s?/, function (x) { return /^\d/.test(x) ? '' : ''; }).replace(/^ /, ''));
    });
    return { title: title, content: tidy(out.join('\n').replace(/\|/g, '\n')) };
  }

  function base64ToText(b64) {
    var clean = String(b64 || '').replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('latin1');
    return atob(clean);
  }

  // Rich Text to plain text: paragraphs become lines, \'xx and \uN characters are kept
  function rtfToText(rtf) {
    var s = String(rtf || '');
    // drop groups that are not text: fonts, colours, style sheets, destinations like {\*\...}
    var prev;
    do { prev = s; s = s.replace(/\{\\\*[^{}]*\}|\{\\(?:fonttbl|colortbl|stylesheet|info|pict|expandedcolortbl)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ''); } while (s !== prev);
    var out = '';
    var skip = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\') {
        var rest = s.slice(i + 1);
        var hex = /^'([0-9a-fA-F]{2})/.exec(rest);
        var uni = /^u(-?\d+)\??/.exec(rest);
        var word = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rest);
        if (hex) { out += String.fromCharCode(parseInt(hex[1], 16)); i += 3; }
        else if (uni) { out += String.fromCharCode(Number(uni[1]) < 0 ? Number(uni[1]) + 65536 : Number(uni[1])); i += uni[0].length; }
        else if (word) {
          if (word[1] === 'par' || word[1] === 'line') out += '\n';
          else if (word[1] === 'tab') out += ' ';
          i += word[0].length;
        } else if (rest[0] === '\\' || rest[0] === '{' || rest[0] === '}') { out += rest[0]; i += 1; }
        else if (rest[0] === '\n' || rest[0] === '\r') { out += '\n'; i += 1; }
        else i += 1;
      } else if (c === '{' || c === '}') {
        continue;
      } else out += c;
    }
    return tidy(out);
  }

  // ProPresenter 6: every slide holds its text as base64 Rich Text, and a label such as "Verse 1"
  function parsePro6(xml) {
    var title = (/CCLISongTitle="([^"]*)"/i.exec(xml) || [])[1] || (/<RVPresentationDocument[^>]*\bdisplayName="([^"]*)"/i.exec(xml) || [])[1] || '';
    var blocks = [];
    var parts = xml.split(/<RVDisplaySlide\b/i).slice(1);
    parts.forEach(function (part) {
      var label = decodeEntities((/\blabel="([^"]*)"/i.exec(part) || [])[1] || '');
      var rtf = /RTFData="([^"]+)"/i.exec(part);
      if (!rtf) return;
      var text = rtfToText(base64ToText(rtf[1]));
      if (!text) return;
      var tag = /^(verse|chorus|bridge|pre-chorus|intro|outro|tag|interlude)\b\s*(\d*)/i.exec(label);
      var header = tag ? '[' + tag[1].charAt(0).toUpperCase() + tag[1].slice(1).toLowerCase() + (tag[2] ? ' ' + tag[2] : '') + ']\n' : '';
      blocks.push(header + text);
    });
    return { title: decodeEntities(title), content: tidy(blocks.join('\n\n')) };
  }

  // Word: word/document.xml inside the zip; paragraphs become lines
  async function inflateRaw(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function docxToText(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var i = 0;
    while (i + 30 < bytes.length && view.getUint32(i, true) === 0x04034b50) {
      var method = view.getUint16(i + 8, true);
      var size = view.getUint32(i + 18, true);
      var nameLen = view.getUint16(i + 26, true);
      var extraLen = view.getUint16(i + 28, true);
      var name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLen));
      var start = i + 30 + nameLen + extraLen;
      if (name === 'word/document.xml') {
        var data = bytes.subarray(start, start + size);
        var xmlBytes = method === 0 ? data : await inflateRaw(data);
        var xml = new TextDecoder().decode(xmlBytes);
        var paras = xml.split(/<\/w:p>/i).map(function (p) {
          return decodeEntities(p.replace(/<w:br\s*\/?>/gi, '\n').replace(/<w:tab\s*\/?>/gi, ' ').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi, '$1\u0001').replace(/<[^>]+>/g, '').replace(/\u0001/g, ''));
        });
        return tidy(paras.join('\n'));
      }
      i = start + size;
    }
    return '';
  }

  // What kind of song file this text is, or '' when it is not one of these formats
  function detectSongFormat(fileName, text) {
    var name = String(fileName || '').toLowerCase();
    var head = String(text || '').slice(0, 4000);
    if (name.endsWith('.pro6') || /<RVPresentationDocument/i.test(head)) return 'pro6';
    if (name.endsWith('.rtf') || /^\s*\{\\rtf/.test(head)) return 'rtf';
    if (/<song\b[^>]*openlyrics/i.test(head) || (/<song\b/i.test(head) && /<verse\b/i.test(text) && /<lines\b/i.test(text))) return 'openlyrics';
    if (/<song\b/i.test(head) && /<lyrics>/i.test(text)) return 'opensong';
    return '';
  }
  function parseSongFile(fileName, text) {
    var kind = detectSongFormat(fileName, text);
    var base = String(fileName || '').replace(/\.[^.]+$/, '');
    var r = null;
    if (kind === 'openlyrics') r = parseOpenLyrics(text);
    else if (kind === 'opensong') r = parseOpenSong(text);
    else if (kind === 'pro6') r = parsePro6(text);
    else if (kind === 'rtf') r = { title: '', content: rtfToText(text) };
    if (!r || !r.content) return null;
    return { title: r.title || base, content: r.content, format: kind };
  }

  var api = { parseSongFile: parseSongFile, detectSongFormat: detectSongFormat, docxToText: docxToText, rtfToText: rtfToText };
  root.SP_SONG_IMPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
