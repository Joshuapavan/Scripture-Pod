/* Scripture Pod — the Displays view: every display that is being output, how it is projected and whether it is live.
 *
 * One drawing routine for both places it appears: the Displays tab in the panel and the pop-out window
 * (src/renderer/displays/displays.html) that can sit on another monitor.
 *
 *   SP_DISPLAYS_VIEW.render(root, snapshot, { act(action) })
 *
 * The snapshot is built by the panel (src/renderer/panel/scripts/integrations/displays.js).
 * summarize() is the part that decides what each display shows, and is covered by test/displays-view.test.js.
 */
(function (root) {
  var HOW = {
    main: 'Monitor: full screen with the clock',
    feed: 'Live: lower third on a transparent page',
    stage: 'Stage: current and next with the clock',
    live: 'Live: lower third on a transparent page',
    monitor: 'Monitor: full screen with the clock',
    program: 'Program: what is on air, shown in the app',
    preview: 'Preview: what is cued next, not on air'
  };

  // What one display is doing right now: status 'live' | 'clear' | 'blank' | 'off', and the words for it
  function describe(d, onAir) {
    var how = HOW[(d.kind === 'program' || d.kind === 'preview') ? d.kind : (d.role || d.kind)] || 'Output';
    // The Bible has no clock on a monitor, and stage shows its own view
    if ((d.role === 'monitor' || d.kind === 'main') && onAir && onAir.kind === 'bible') how = 'Monitor: full screen, no clock for the Bible';
    if (d.kind === 'preview') {
      return { status: d.cued ? 'preview' : 'clear', how: HOW.preview, showing: d.cued ? String(d.showing || '').replace(/\s+/g, ' ').trim().slice(0, 90) : '' };
    }
    var status = 'live';
    if (!d.open) status = 'off';
    else if (d.blank) status = 'blank';
    else if (!onAir || !onAir.live) status = 'clear';
    var showing = '';
    if (status === 'live' && onAir) showing = onAir.ref || onAir.title || onAir.text || '';
    return { status: status, how: how, showing: String(showing).replace(/\s+/g, ' ').trim().slice(0, 90) };
  }

  function summarize(snap) {
    var counts = { live: 0, preview: 0, clear: 0, blank: 0, off: 0 };
    (snap.displays || []).forEach(function (d) { counts[describe(d, snap.onAir).status]++; });
    return counts;
  }

  var STYLE = [
    '.dv{--dv-card:var(--sp-card,#17181b);--dv-line:var(--sp-line,#2a2c31);--dv-text:var(--sp-text,#ececee);--dv-muted:var(--sp-subtle,#8b8e97);--dv-ok:var(--sp-ok,#2fb170);--dv-live:#e5372a;--dv-warn:#d9a016;color:var(--dv-text);font:13px/1.4 system-ui,sans-serif;display:flex;flex-direction:column;gap:16px}',
    '.dv-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.dv-head h1{margin:0;font-size:20px;font-weight:600}',
    '.dv-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1 1 auto}',
    '.dv-chip{padding:2px 9px;border-radius:999px;border:1px solid var(--dv-line);font-size:11px;font-weight:600;color:var(--dv-muted)}',
    '.dv-chip.is-live{color:#fff;background:var(--dv-live);border-color:transparent}',
    '.dv-btn{padding:5px 12px;border-radius:999px;border:1px solid var(--dv-line);background:transparent;color:var(--dv-text);font:600 12px system-ui,sans-serif;cursor:pointer}',
    '.dv-btn:hover{border-color:var(--dv-text)}',
    '.dv-label{margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dv-muted)}',
    '.dv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}',
    '.dv-card{background:var(--dv-card);border:1px solid var(--dv-line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}',
    '.dv-card.is-live{border-color:var(--dv-live)}',
    '.dv-top{display:flex;align-items:center;gap:8px}',
    '.dv-top strong{font-size:14px;font-weight:600;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dv-pill{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;border:1px solid var(--dv-line);color:var(--dv-muted)}',
    '.dv-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}',
    '.dv-pill.is-live{color:#fff;background:var(--dv-live);border-color:transparent}',
    '.dv-pill.is-clear{color:var(--dv-ok)}',
    '.dv-pill.is-preview{color:#fff;background:#2f7de1;border-color:transparent}',
    '.dv-pill.is-blank{color:var(--dv-warn)}',
    '.dv-kind{font-size:11px;color:var(--dv-muted)}',
    '.dv-row{display:flex;gap:8px;font-size:12px}',
    '.dv-row span:first-child{flex:0 0 74px;color:var(--dv-muted)}',
    '.dv-row span:last-child{flex:1 1 auto;min-width:0}',
    '.dv-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px}',
    '.dv-actions select{max-width:170px;background:var(--dv-card);color:var(--dv-text);border:1px solid var(--dv-line);border-radius:8px;padding:4px 6px;font-size:12px}',
    '.dv-screens{display:flex;flex-direction:column;gap:6px}',
    '.dv-screen{display:flex;gap:10px;align-items:baseline;padding:8px 12px;border:1px solid var(--dv-line);border-radius:10px;background:var(--dv-card)}',
    '.dv-screen strong{font-weight:600}',
    '.dv-screen small{color:var(--dv-muted)}',
    '.dv-thumb{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:8px;border:1px solid var(--dv-line);background:#000}',
    '.dv-thumb.is-live{background:repeating-conic-gradient(#2a2c31 0% 25%,#1b1c20 0% 50%) 0 0/16px 16px}',
    '.dv-thumb iframe{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;pointer-events:none;background:transparent}',
    '.dv-thumb .dv-shade{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.82);color:var(--dv-muted);font-size:12px;font-weight:600}',
    '.dv-thumb .dv-shade.is-off{background:#0b0b0d}',
    '.dv-stage{position:absolute;inset:0;padding:8% 7%;display:flex;flex-direction:column;gap:6%;background:#000;color:#fff;overflow:hidden}',
    '.dv-stage b{font-size:15px;line-height:1.25;font-weight:600;white-space:pre-line;display:block;max-height:60%;overflow:hidden}',
    '.dv-stage small{font-size:11px;opacity:.55;white-space:pre-line;max-height:30%;overflow:hidden;display:block}',
    '.dv-empty{color:var(--dv-muted);padding:20px;border:1px dashed var(--dv-line);border-radius:12px;text-align:center}'
  ].join('\n');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, title, onclick) {
    var b = el('button', 'dv-btn', label);
    b.type = 'button';
    if (title) b.title = title;
    b.onclick = onclick;
    return b;
  }

  // Small live pictures: each display gets a scaled copy of the display page, fed the same content it is projecting.
  // The pictures are kept between redraws so they do not reload every second.
  function state(rootEl) {
    if (!rootEl.__dv) rootEl.__dv = { feeds: {}, thumbHtml: '', frames: {} };
    return rootEl.__dv;
  }
  function postFeed(frame, payload) {
    try {
      if (!frame.__ready || !frame.contentWindow) return;
      frame.contentWindow.postMessage(payload ? { type: 'PREVIEW_UPDATE', payload: payload } : { type: 'PREVIEW_CLEAR' }, '*');
    } catch (e) { /* the picture is not ready yet */ }
  }
  function paintStage(box, stage) {
    box.textContent = '';
    if (!stage) { box.appendChild(el('small', '', 'Nothing on air')); return; }
    var title = stage.ref || stage.title || '';
    if (title) box.appendChild(el('small', '', (title + (stage.section ? ' · ' + stage.section : '')).slice(0, 60)));
    box.appendChild(el('b', '', String(stage.current || '').slice(0, 220)));
    if (stage.next) box.appendChild(el('small', '', 'Next: ' + String(stage.next).slice(0, 120)));
  }
  function frameFor(rootEl, key) {
    var st = state(rootEl);
    var f = st.frames[key];
    if (!f) {
      f = document.createElement('iframe');
      f.setAttribute('tabindex', '-1');
      f.setAttribute('aria-hidden', 'true');
      f.onload = function () { f.__ready = true; postFeed(f, st.feeds[f.__feed]); };
      f.srcdoc = st.thumbHtml;
      st.frames[key] = f;
    }
    return f;
  }
  function setFeeds(rootEl, feeds) {
    var st = state(rootEl);
    st.feeds = feeds || {};
    Object.keys(st.frames).forEach(function (k) { var f = st.frames[k]; postFeed(f, st.feeds[f.__feed]); });
    rootEl.querySelectorAll('.dv-stage').forEach(function (box) { paintStage(box, st.feeds.stage && st.feeds.stage.stage); });
  }
  function buildThumb(rootEl, d, status) {
    var st = state(rootEl);
    var box = el('div', 'dv-thumb' + (d.thumb === 'live' ? ' is-live' : ''));
    if (status === 'off') { box.appendChild(el('div', 'dv-shade is-off', 'Not open')); return box; }
    if (d.thumb === 'stage') {
      var sb = el('div', 'dv-stage');
      paintStage(sb, st.feeds.stage && st.feeds.stage.stage);
      box.appendChild(sb);
    } else if (st.thumbHtml) {
      var f = frameFor(rootEl, d.key);
      f.__feed = d.thumb;
      box.appendChild(f);
      if (f.__ready) postFeed(f, st.feeds[d.thumb]);
      var fit = function () { var w = box.clientWidth; if (w) f.style.transform = 'scale(' + (w / 1920) + ')'; };
      if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(box);
      setTimeout(fit, 0);
    }
    if (status === 'blank') box.appendChild(el('div', 'dv-shade', 'Blanked'));
    return box;
  }

  var STATUS_WORDS = { live: 'LIVE', preview: 'PREVIEW', clear: 'CLEAR', blank: 'BLANK', off: 'OFF' };

  function render(rootEl, snap, opts) {
    opts = opts || {};
    var act = opts.act || function () {};
    if (!document.getElementById('dv-style')) {
      var st = el('style'); st.id = 'dv-style'; st.textContent = STYLE; document.head.appendChild(st);
    }
    // A menu that is open is left alone until it closes
    if (rootEl.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    if (opts.thumbHtml && opts.thumbHtml !== state(rootEl).thumbHtml) { var stt = state(rootEl); stt.thumbHtml = opts.thumbHtml; stt.frames = {}; rootEl.dataset.dvSig = ''; }
    var sig = JSON.stringify(snap);
    if (rootEl.dataset.dvSig === sig) return;
    rootEl.dataset.dvSig = sig;
    rootEl.textContent = '';
    var wrap = el('div', 'dv');
    var counts = summarize(snap);

    var head = el('div', 'dv-head');
    head.appendChild(el('h1', '', 'Displays'));
    var chips = el('div', 'dv-chips');
    chips.appendChild(el('span', 'dv-chip' + (counts.live ? ' is-live' : ''), counts.live + ' live'));
    if (counts.preview) chips.appendChild(el('span', 'dv-chip', counts.preview + ' in preview'));
    if (counts.clear) chips.appendChild(el('span', 'dv-chip', counts.clear + ' clear'));
    if (counts.blank) chips.appendChild(el('span', 'dv-chip', counts.blank + ' blanked'));
    if (counts.off) chips.appendChild(el('span', 'dv-chip', counts.off + ' off'));
    head.appendChild(chips);
    head.appendChild(btn('Identify screens', 'Show a number on every screen for a moment', function () { act({ action: 'identify' }); }));
    if (opts.canPopOut) head.appendChild(btn('Pop out', 'Open this as its own window, to put on another monitor', function () { act({ action: 'popout' }); }));
    wrap.appendChild(head);

    var onAir = snap.onAir || {};
    if (snap.previewOnly) wrap.appendChild(el('div', 'dv-chip', 'Preview only is on: nothing is going to the displays'));
    wrap.appendChild(el('div', 'dv-label', 'Outputs'));
    var grid = el('div', 'dv-grid');
    (snap.displays || []).forEach(function (d) {
      var info = describe(d, snap.onAir);
      var card = el('div', 'dv-card' + (info.status === 'live' ? ' is-live' : ''));
      var top = el('div', 'dv-top');
      top.appendChild(el('strong', '', d.name));
      top.appendChild(el('span', 'dv-pill is-' + info.status, STATUS_WORDS[info.status]));
      card.appendChild(top);
      if (d.thumb) card.appendChild(buildThumb(rootEl, d, info.status));
      card.appendChild(el('div', 'dv-kind', d.where || ''));
      var row = function (k, v) { var r = el('div', 'dv-row'); r.appendChild(el('span', '', k)); r.appendChild(el('span', '', v)); card.appendChild(r); };
      row(d.kind === 'preview' || d.kind === 'program' ? 'Role' : 'Projecting', info.status === 'off' ? 'Not open' : info.how);
      if (d.screenLabel) row('Screen', d.screenLabel);
      if (info.status === 'live' && info.showing) row('Showing', info.showing);
      else if (info.status === 'preview') row('Showing', info.showing || 'Cued');
      else if (info.status === 'clear') row('Showing', d.kind === 'preview' ? 'Nothing cued' : 'Nothing on air');
      else if (info.status === 'blank') row('Showing', 'Blacked out from here');
      var actions = el('div', 'dv-actions');
      if (d.open && d.canBlank) actions.appendChild(btn(d.blank ? 'Show' : 'Blank', d.blank ? 'Show this display again' : 'Black out only this display', function () { act({ action: 'blank', key: d.key, on: !d.blank }); }));
      if (d.open && d.canClose) actions.appendChild(btn(d.closeLabel || 'Close', '', function () { act({ action: 'close', key: d.key }); }));
      if (d.canMove) {
        var sel = el('select');
        sel.appendChild(new Option(d.open ? 'Move to…' : 'Open on…', ''));
        (snap.screens || []).forEach(function (s, i) { sel.appendChild(new Option(s.label || ('Screen ' + (i + 1)), String(s.id))); });
        sel.onchange = function () { if (sel.value) act({ action: 'move', key: d.key, screenId: sel.value }); };
        actions.appendChild(sel);
      }
      if (actions.childNodes.length) card.appendChild(actions);
      grid.appendChild(card);
    });
    if (!(snap.displays || []).length) grid.appendChild(el('div', 'dv-empty', 'No displays yet. Open the main screen, stream feed or stage display from Outputs, or open a display address in a browser.'));
    wrap.appendChild(grid);

    wrap.appendChild(el('div', 'dv-label', 'Screens on this computer'));
    var screens = el('div', 'dv-screens');
    (snap.screens || []).forEach(function (s, i) {
      var r = el('div', 'dv-screen');
      r.appendChild(el('strong', '', s.label || ('Screen ' + (i + 1))));
      var on = (snap.displays || []).filter(function (d) { return d.open && d.screenId != null && String(d.screenId) === String(s.id); }).map(function (d) { return d.name; });
      r.appendChild(el('small', '', s.width + '×' + s.height + (s.isPrimary ? ' · Main' : '') + (s.isInternal ? ' · Built-in' : '') + ' · ' + (on.length ? on.join(', ') : 'nothing on it')));
      screens.appendChild(r);
    });
    wrap.appendChild(screens);
    rootEl.appendChild(wrap);
  }

  var api = { render: render, setFeeds: setFeeds, describe: describe, summarize: summarize };
  root.SP_DISPLAYS_VIEW = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
