/* Scripture Pod: the QR code, countdown and announcement ticker overlays.
 *
 * One implementation for every page that draws them:
 *   - src/renderer/display/display.html (loads this file)
 *   - src/renderer/panel/scripts/output/output-and-streaming.js (inlines SP_EXTRA_SOURCE and the CSS into the
 *     Preview / Program / standalone output page)
 * so the Program monitor, the overlay preview and every live display match.
 *
 * The panel sends the whole state of the three overlays in one message; update(state) draws it. The overlays sit in
 * a layer of their own that this file creates, over whatever is on air, so no page markup is needed.
 *
 * Written as one function so its source can be inlined; no backticks or template placeholders anywhere in this file.
 */
function spExtraModule(root) {
  var POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'];
  var SPEEDS = { slow: 70, normal: 110, fast: 170 };
  var SEPARATOR = '   •   ';

  // ── Pure helpers (also used by the tests) ──────────────────────────────────────
  // A QR code arrives as a square grid: { n: 29, d: "0101..." } with one character per module
  function qrPath(matrix) {
    var n = matrix && Number(matrix.n), d = matrix && String(matrix.d || '');
    if (!n || n < 1 || d.length !== n * n) return { size: 0, path: '' };
    var quiet = 4, parts = [];
    for (var y = 0; y < n; y++) {
      var x = 0;
      while (x < n) {
        if (d.charAt(y * n + x) === '1') {
          var run = 1;
          while (x + run < n && d.charAt(y * n + x + run) === '1') run++;
          parts.push('M' + (x + quiet) + ' ' + (y + quiet) + 'h' + run + 'v1h-' + run + 'z');
          x += run;
        } else x++;
      }
    }
    return { size: n + quiet * 2, path: parts.join('') };
  }

  function pad2(v) { return v < 10 ? '0' + v : String(v); }
  // 125000 ms -> "02:05", and "1:02:05" from an hour up
  function formatCountdown(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h > 0 ? h + ':' + pad2(m) + ':' + pad2(s) : pad2(m) + ':' + pad2(s);
  }
  // The next time the clock shows "HH:MM": today if it is still ahead, otherwise tomorrow
  function nextClockTime(hhmm, now) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return null;
    var h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    var base = new Date(now);
    var t = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, min, 0, 0).getTime();
    if (t <= now) t += 24 * 3600 * 1000;
    return t;
  }
  // Seconds a message line needs to cross the screen once at a speed in pixels per second
  function tickerSeconds(contentWidth, boxWidth, speedName) {
    var speed = SPEEDS[speedName] || SPEEDS.normal;
    return Math.max(6, (contentWidth + boxWidth) / speed);
  }
  function tickerText(raw) {
    return String(raw || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).join(SEPARATOR);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────────
  var L = '#sp-extra-layer';
  var css = [
    L + '{position:fixed;inset:0;z-index:25;pointer-events:none;font-family:"Montserrat","Geist",system-ui,sans-serif;}',
    L + ' .sp-x{position:absolute;opacity:0;visibility:hidden;transition:opacity 420ms ease,visibility 0s linear 420ms,transform 520ms cubic-bezier(.2,.85,.25,1);}',
    L + ' .sp-x.is-on{opacity:1;visibility:visible;transition-delay:0s;}',
    /* placement for the QR code and the countdown */
    L + ' .sp-x[data-pos="bottom-right"]{right:4vw;bottom:8vh;transform:translateY(14px);}',
    L + ' .sp-x[data-pos="bottom-left"]{left:4vw;bottom:8vh;transform:translateY(14px);}',
    L + ' .sp-x[data-pos="top-right"]{right:4vw;top:6vh;transform:translateY(-14px);}',
    L + ' .sp-x[data-pos="top-left"]{left:4vw;top:6vh;transform:translateY(-14px);}',
    L + ' .sp-x[data-pos="center"]{left:50%;top:50%;transform:translate(-50%,-46%);}',
    L + ' .sp-x.is-on[data-pos="center"]{transform:translate(-50%,-50%);}',
    L + ' .sp-x.is-on:not([data-pos="center"]){transform:none;}',
    /* with the ticker along an edge, the corner overlays on that edge sit above or below it */
    L + '.tk-bottom .sp-x[data-pos^="bottom"]{bottom:calc(8vh + var(--x-tk-h,7.2vh));}',
    L + '.tk-top .sp-x[data-pos^="top"]{top:calc(6vh + var(--x-tk-h,7.2vh));}',

    /* QR code: a card with a caption over the code */
    L + ' .sp-x-qr{display:flex;flex-direction:column;align-items:center;gap:1.2vh;padding:1.6vh 1.6vh 1.4vh;border-radius:1.4vh;background:var(--x-qr-card,#fff);color:var(--x-qr-ink,#101216);box-shadow:0 1.6vh 5vh rgba(0,0,0,.5);}',
    L + ' .sp-x-qr svg{display:block;width:var(--x-qr-size,28vh);height:var(--x-qr-size,28vh);}',
    L + ' .sp-x-qr svg path{fill:var(--x-qr-ink,#101216);}',
    L + ' .sp-x-qr .sp-x-cap{font-weight:800;font-size:calc(var(--x-qr-size,28vh) * .1);letter-spacing:.04em;text-transform:uppercase;text-align:center;max-width:var(--x-qr-size,28vh);line-height:1.1;}',
    L + ' .sp-x-qr .sp-x-cap:empty{display:none;}',

    /* countdown: a label over big tabular numbers */
    L + ' .sp-x-cd{display:flex;flex-direction:column;align-items:center;gap:.4vh;padding:2vh 3.4vh;border-radius:1.6vh;background:var(--x-cd-bg,rgba(8,10,16,.82));color:var(--x-cd-ink,#fff);box-shadow:0 1.6vh 5vh rgba(0,0,0,.5);text-align:center;}',
    L + ' .sp-x-cd .sp-x-lab{font-weight:700;font-size:calc(var(--x-cd-size,12vh) * .2);letter-spacing:.14em;text-transform:uppercase;color:var(--x-cd-accent,#90d5ff);}',
    L + ' .sp-x-cd .sp-x-lab:empty{display:none;}',
    L + ' .sp-x-cd .sp-x-time{font-weight:800;font-size:var(--x-cd-size,12vh);line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.02em;}',
    L + ' .sp-x-cd.is-done .sp-x-time{color:var(--x-cd-accent,#90d5ff);}',

    /* ticker: a band across the screen with a fixed tag and scrolling messages */
    L + ' .sp-x-tk{left:0;right:0;height:var(--x-tk-h,7.2vh);display:flex;align-items:stretch;overflow:hidden;background:var(--x-tk-bg,rgba(8,10,16,.9));color:var(--x-tk-ink,#fff);box-shadow:0 0 5vh rgba(0,0,0,.45);}',
    L + ' .sp-x-tk[data-where="bottom"]{bottom:0;transform:translateY(100%);}',
    L + ' .sp-x-tk[data-where="top"]{top:0;transform:translateY(-100%);}',
    L + ' .sp-x-tk.is-on{transform:none !important;}',
    L + ' .sp-x-tk .sp-x-tag{flex:0 0 auto;display:flex;align-items:center;padding:0 2.4vh;background:var(--x-tk-accent,#90d5ff);color:var(--x-tk-accent-ink,#0b0d10);font-weight:800;font-size:calc(var(--x-tk-h,7.2vh) * .38);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;z-index:1;}',
    L + ' .sp-x-tk .sp-x-tag:empty{display:none;}',
    L + ' .sp-x-tk .sp-x-run{position:relative;flex:1 1 auto;overflow:hidden;display:flex;align-items:center;}',
    L + ' .sp-x-tk .sp-x-track{position:absolute;left:0;white-space:nowrap;font-weight:700;font-size:calc(var(--x-tk-h,7.2vh) * .44);will-change:transform;animation:sp-x-scroll var(--x-tk-dur,30s) linear infinite;}',
    '@keyframes sp-x-scroll{from{transform:translateX(var(--x-tk-from,100vw));}to{transform:translateX(var(--x-tk-to,-100%));}}',
    '@media (prefers-reduced-motion:reduce){' + L + ' .sp-x{transition-duration:.01ms !important;}' + L + ' .sp-x-tk .sp-x-track{animation:none;transform:none;}}'
  ].join('\n');

  // ── Drawing ─────────────────────────────────────────────────────────────────────
  var timers = { cd: 0 };
  var signatures = {};
  var cdState = null;

  function el(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function layerOf(doc) {
    var layer = doc.getElementById('sp-extra-layer');
    if (!layer) {
      layer = doc.createElement('div');
      layer.id = 'sp-extra-layer';
      layer.setAttribute('aria-hidden', 'true');
      (doc.body || doc.documentElement).appendChild(layer);
    }
    return layer;
  }
  function slot(doc, kind) {
    var layer = layerOf(doc);
    var node = layer.querySelector('.sp-x-' + kind);
    if (!node) { node = el(doc, 'div', 'sp-x sp-x-' + kind); layer.appendChild(node); }
    return node;
  }
  function hex(v, fallback) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback; }
  function lum(h) {
    var c = h.slice(1).match(/.{2}/g).map(function (p) { return parseInt(p, 16) / 255; }).map(function (v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function inkFor(bg) { return lum(bg) >= 0.4 ? '#0b0d10' : '#ffffff'; }
  function posOf(v) { return POSITIONS.indexOf(v) >= 0 ? v : 'bottom-right'; }
  function num(v, lo, hi, d) { var n = Number(v); return isNaN(n) ? d : Math.max(lo, Math.min(hi, n)); }

  function drawQr(doc, cfg) {
    var node = slot(doc, 'qr');
    var on = !!(cfg && cfg.enabled);
    var parts = qrPath(cfg && cfg.matrix);
    if (!on || !parts.size) { node.classList.remove('is-on'); return; }
    var sig = JSON.stringify([cfg.caption, cfg.style, parts.path.length, cfg.matrix.n]) + parts.path.slice(0, 64);
    if (signatures.qr !== sig) {
      signatures.qr = sig;
      node.replaceChildren();
      node.appendChild(el(doc, 'div', 'sp-x-cap', String(cfg.caption || '').trim().slice(0, 40)));
      var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + parts.size + ' ' + parts.size);
      svg.setAttribute('shape-rendering', 'crispEdges');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'QR code');
      var path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', parts.path);
      svg.appendChild(path);
      node.appendChild(svg);
    }
    var dark = cfg.style === 'dark';
    node.classList.add('sp-x-qr');
    node.dataset.pos = posOf(cfg.position);
    node.style.setProperty('--x-qr-card', dark ? '#101216' : '#ffffff');
    node.style.setProperty('--x-qr-ink', dark ? '#ffffff' : '#101216');
    node.style.setProperty('--x-qr-size', num(cfg.size, 12, 60, 28) + 'vh');
    node.classList.add('is-on');
  }

  function paintCountdown(doc) {
    var node = slot(doc, 'cd');
    if (!cdState || !cdState.enabled) return;
    var time = node.querySelector('.sp-x-time');
    if (!time) return;
    var left = cdState.endsAt - Date.now();
    if (left <= 0) {
      time.textContent = String(cdState.endText || '').trim() || '00:00';
      node.classList.add('is-done');
      if (cdState.hideAtEnd && left < -4000) node.classList.remove('is-on');
    } else {
      time.textContent = formatCountdown(left);
      node.classList.remove('is-done');
    }
  }
  function drawCountdown(doc, cfg) {
    var node = slot(doc, 'cd');
    var on = !!(cfg && cfg.enabled && Number(cfg.endsAt) > 0);
    clearInterval(timers.cd);
    timers.cd = 0;
    if (!on) { cdState = null; node.classList.remove('is-on'); return; }
    var sig = JSON.stringify([cfg.label, cfg.endsAt, cfg.endText, cfg.hideAtEnd]);
    if (signatures.cd !== sig) {
      signatures.cd = sig;
      node.replaceChildren(el(doc, 'div', 'sp-x-lab', String(cfg.label || '').trim().slice(0, 40)), el(doc, 'div', 'sp-x-time', '--:--'));
    }
    cdState = { enabled: true, endsAt: Number(cfg.endsAt), endText: cfg.endText, hideAtEnd: !!cfg.hideAtEnd };
    node.classList.add('sp-x-cd');
    node.dataset.pos = posOf(cfg.position);
    var accent = hex(cfg.accent, '#90d5ff');
    node.style.setProperty('--x-cd-accent', accent);
    node.style.setProperty('--x-cd-size', num(cfg.size, 5, 30, 12) + 'vh');
    node.classList.add('is-on');
    paintCountdown(doc);
    timers.cd = setInterval(function () { paintCountdown(doc); }, 250);
  }

  function drawTicker(doc, cfg) {
    var node = slot(doc, 'tk');
    var text = tickerText(cfg && cfg.text);
    var on = !!(cfg && cfg.enabled && text);
    if (!on) { node.classList.remove('is-on'); return; }
    var bg = hex(cfg.color, '#101216');
    var accent = hex(cfg.accent, '#90d5ff');
    var where = cfg.where === 'top' ? 'top' : 'bottom';
    var sig = JSON.stringify([text, cfg.label, cfg.speed, bg, accent, where, cfg.height]);
    node.classList.add('sp-x-tk');
    node.dataset.where = where;
    node.style.setProperty('--x-tk-bg', bg);
    node.style.setProperty('--x-tk-ink', inkFor(bg));
    node.style.setProperty('--x-tk-accent', accent);
    node.style.setProperty('--x-tk-accent-ink', inkFor(accent));
    node.style.setProperty('--x-tk-h', num(cfg.height, 4, 14, 7.2) + 'vh');
    if (signatures.tk !== sig) {
      signatures.tk = sig;
      var tag = el(doc, 'div', 'sp-x-tag', String(cfg.label || '').trim().slice(0, 24));
      var run = el(doc, 'div', 'sp-x-run');
      var track = el(doc, 'div', 'sp-x-track', text);
      run.appendChild(track);
      node.replaceChildren(tag, run);
      node.classList.add('is-on');
      // The speed is in pixels a second, so the time a pass takes follows the text length
      var fit = function () {
        var box = run.clientWidth || (doc.documentElement.clientWidth || 1280), width = track.scrollWidth || 600;
        track.style.setProperty('--x-tk-from', box + 'px');
        track.style.setProperty('--x-tk-to', '-' + width + 'px');
        track.style.setProperty('--x-tk-dur', tickerSeconds(width, box, cfg.speed) + 's');
      };
      fit();
      setTimeout(fit, 120);
    }
    node.classList.add('is-on');
  }

  function update(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    state = state || {};
    drawQr(doc, state.qr);
    drawCountdown(doc, state.countdown);
    drawTicker(doc, state.ticker);
    var layer = layerOf(doc), tk = state.ticker, tkOn = !!(tk && tk.enabled && tickerText(tk.text));
    layer.classList.toggle('tk-bottom', tkOn && tk.where !== 'top');
    layer.classList.toggle('tk-top', tkOn && tk.where === 'top');
    layer.style.setProperty('--x-tk-h', tkOn ? num(tk.height, 4, 14, 7.2) + 'vh' : '7.2vh');
  }

  function inject(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('sp-extra-css')) return;
    var style = doc.createElement('style');
    style.id = 'sp-extra-css';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }

  root.SP_EXTRA = {
    positions: POSITIONS, speeds: Object.keys(SPEEDS), css: css, update: update, inject: inject,
    qrPath: qrPath, formatCountdown: formatCountdown, nextClockTime: nextClockTime, tickerSeconds: tickerSeconds, tickerText: tickerText
  };
}

spExtraModule(typeof window !== 'undefined' ? window : globalThis);
if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
  (typeof window !== 'undefined' ? window : globalThis).SP_EXTRA_SOURCE = '(' + spExtraModule.toString() + ')(window);';
}
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).SP_EXTRA;
