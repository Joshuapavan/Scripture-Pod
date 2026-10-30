    // ── QR code, countdown and ticker overlays: the panel side ─────────────────────────────
    // Three overlays that sit over whatever is on air. Their settings are kept as one block (extraOverlays). The state of
    // all three travels in one EXTRA_OVERLAYS message to every display, and again every few seconds while any is on, so
    // a display that connects late catches up. The drawing is in src/shared/extra-overlays.js.
    const XO_KINDS = ['qr', 'countdown', 'ticker'];
    const xoOn = { qr: false, countdown: false, ticker: false };
    let xoCountdownEndsAt = 0;
    let xoCountdownTimer = null;
    let xoPublishTimer = null;
    const xoEl = (id) => document.getElementById('xo-' + id);
    const xoVal = (id, d = '') => { const e = xoEl(id); return e ? String(e.value) : d; };
    const xoQrCache = { text: '', matrix: null };

    function collectExtraOverlays() {
      return {
        qr: { url: xoVal('qr-url').trim(), caption: xoVal('qr-caption').trim(), position: xoVal('qr-pos', 'bottom-right'), style: xoVal('qr-look', 'light'), size: Number(xoVal('qr-size', '28')) || 28 },
        countdown: { label: xoVal('cd-label').trim(), mode: xoVal('cd-mode', 'duration'), minutes: Number(xoVal('cd-minutes', '10')) || 10, time: xoVal('cd-time', '18:00'), endText: xoVal('cd-end').trim(), hideAtEnd: !!(xoEl('cd-hide') && xoEl('cd-hide').checked), position: xoVal('cd-pos', 'top-right'), accent: xoVal('cd-accent', '#90D5FF'), size: Number(xoVal('cd-size', '12')) || 12 },
        ticker: { text: xoVal('tk-text'), label: xoVal('tk-label').trim(), where: xoVal('tk-where', 'bottom'), speed: xoVal('tk-speed', 'normal'), color: xoVal('tk-color', '#101216'), accent: xoVal('tk-accent', '#90D5FF'), height: Number(xoVal('tk-height', '7')) || 7 }
      };
    }
    function applyExtraOverlays(cfg) {
      cfg = cfg || {};
      const put = (id, v) => { const e = xoEl(id); if (e && v != null) e.value = String(v); };
      const q = cfg.qr || {}, c = cfg.countdown || {}, t = cfg.ticker || {};
      put('qr-url', q.url); put('qr-caption', q.caption); put('qr-pos', q.position); put('qr-look', q.style); put('qr-size', q.size);
      put('cd-label', c.label); put('cd-mode', c.mode); put('cd-minutes', c.minutes); put('cd-time', c.time); put('cd-end', c.endText); put('cd-pos', c.position); put('cd-accent', c.accent); put('cd-size', c.size);
      const hide = xoEl('cd-hide'); if (hide && typeof c.hideAtEnd === 'boolean') hide.checked = c.hideAtEnd;
      put('tk-text', t.text); put('tk-label', t.label); put('tk-where', t.where); put('tk-speed', t.speed); put('tk-color', t.color); put('tk-accent', t.accent); put('tk-height', t.height);
      syncExtraOverlayLabels();
    }
    function syncExtraOverlayLabels() {
      const set = (id, text) => { const e = xoEl(id); if (e) e.textContent = text; };
      set('qr-size-value', xoVal('qr-size', '28') + '%'); set('cd-size-value', xoVal('cd-size', '12') + '%'); set('tk-height-value', xoVal('tk-height', '7') + '%');
      const clock = xoVal('cd-mode') === 'clock';
      const minutes = xoEl('cd-minutes-row'), time = xoEl('cd-time-row');
      if (minutes) minutes.hidden = clock;
      if (time) time.hidden = !clock;
    }

    // The QR grid for a link, as { n, d: "0101..." }; the same text is only worked out once
    function xoQrMatrix(text) {
      if (!text) return null;
      if (xoQrCache.text === text) return xoQrCache.matrix;
      let matrix = null;
      try {
        const qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        const n = qr.getModuleCount();
        let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) d += qr.isDark(r, c) ? '1' : '0';
        matrix = { n, d };
      } catch (e) { matrix = null; }
      xoQrCache.text = text; xoQrCache.matrix = matrix;
      return matrix;
    }

    function buildExtraState(only) {
      const cfg = collectExtraOverlays();
      const on = (k) => (only ? only === k : !!xoOn[k]);
      return {
        qr: { enabled: on('qr'), matrix: xoQrMatrix(cfg.qr.url), caption: cfg.qr.caption, position: cfg.qr.position, style: cfg.qr.style, size: cfg.qr.size },
        countdown: { enabled: on('countdown'), endsAt: only === 'countdown' && !xoOn.countdown ? Date.now() + 5 * 60000 : xoCountdownEndsAt, label: cfg.countdown.label, endText: cfg.countdown.endText, hideAtEnd: cfg.countdown.hideAtEnd, position: cfg.countdown.position, accent: cfg.countdown.accent, size: cfg.countdown.size },
        ticker: { enabled: on('ticker'), text: cfg.ticker.text, label: cfg.ticker.label, where: cfg.ticker.where, speed: cfg.ticker.speed, color: cfg.ticker.color, accent: cfg.ticker.accent, height: cfg.ticker.height }
      };
    }

    function publishExtraOverlays() {
      const msg = { type: 'EXTRA_OVERLAYS', proto: 1, sender: 'control', ts: Date.now(), state: buildExtraState() };
      try { if (typeof broadcastMessage === 'function') broadcastMessage(msg); } catch (e) { /* not ready */ }
      try { if (typeof postMessageToEmbeddedProgramDisplay === 'function') postMessageToEmbeddedProgramDisplay(msg); } catch (e) { /* not ready */ }
      if (typeof updateAirIndicator === 'function') updateAirIndicator();
    }

    // The example in the Overlays preview: the overlay being edited, shown whether or not it is on air
    function previewExtraOverlay(kind) {
      const frame = document.getElementById('overlay-preview-frame');
      if (!frame || !frame.contentWindow) return;
      const state = kind ? buildExtraState(kind) : { qr: { enabled: false }, countdown: { enabled: false }, ticker: { enabled: false } };
      try { frame.contentWindow.postMessage({ type: 'EXTRA_OVERLAYS', state }, '*'); } catch (e) { /* preview not ready */ }
    }
    function currentExtraOverlayKind() {
      const which = document.body.dataset.overlay;
      return XO_KINDS.includes(which) ? which : '';
    }

    function setExtraButton(kind, on) {
      const btn = document.getElementById('xo-' + kind + '-show-btn');
      if (!btn) return;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('active', on);
      btn.textContent = on ? 'Hide from air' : (kind === 'countdown' ? 'Start and show on air' : 'Show on air');
    }

    function toggleExtraOverlay(kind) {
      if (!XO_KINDS.includes(kind)) return;
      const enable = !xoOn[kind];
      const cfg = collectExtraOverlays();
      if (enable) {
        if (typeof isPreviewOnlyMode === 'function' && isPreviewOnlyMode()) { showToast('Preview only is on, so this stays off the air. Turn it off with P.'); return; }
        if (kind === 'qr' && !xoQrMatrix(cfg.qr.url)) { showToast(cfg.qr.url ? 'That is too long for a QR code' : 'Enter a link or some text for the QR code'); return; }
        if (kind === 'ticker' && !cfg.ticker.text.trim()) { showToast('Enter at least one message for the ticker'); return; }
        if (kind === 'countdown') {
          const end = cfg.countdown.mode === 'clock' ? (window.SP_EXTRA && window.SP_EXTRA.nextClockTime(cfg.countdown.time, Date.now())) : Date.now() + Math.max(1, cfg.countdown.minutes) * 60000;
          if (!end) { showToast('Choose a time of day for the countdown'); return; }
          xoCountdownEndsAt = end;
          clearTimeout(xoCountdownTimer);
          // After zero the countdown takes itself off, if it is set to
          if (cfg.countdown.hideAtEnd) {
            xoCountdownTimer = setTimeout(() => {
              if (xoOn.countdown && xoCountdownEndsAt === end) (typeof runWithoutServiceLock === 'function' ? runWithoutServiceLock : (f) => f())(() => toggleExtraOverlay('countdown'));
            }, Math.max(0, end - Date.now()) + 4600);
          }
        }
      } else if (kind === 'countdown') {
        clearTimeout(xoCountdownTimer);
      }
      xoOn[kind] = enable;
      setExtraButton(kind, enable);
      publishExtraOverlays();
      previewExtraOverlay(currentExtraOverlayKind());
    }

    function hideAllExtraOverlays() {
      let any = false;
      XO_KINDS.forEach((k) => { if (xoOn[k]) { xoOn[k] = false; setExtraButton(k, false); any = true; } });
      clearTimeout(xoCountdownTimer);
      if (any) publishExtraOverlays();
    }

    // Any change: kept with the other settings, sent on if the overlay is on air, and shown in the preview
    function onExtraOverlayChange(typing) {
      syncExtraOverlayLabels();
      try {
        if (typeof appState !== 'undefined' && appState) { appState.settings = appState.settings || {}; appState.settings.extraOverlays = collectExtraOverlays(); }
        if (typeof saveState === 'function') saveState();
        if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
      } catch (e) { /* storage unavailable */ }
      clearTimeout(xoPublishTimer);
      xoPublishTimer = setTimeout(() => {
        // A countdown that is running keeps its end; a change to the minutes applies to the next start
        if (XO_KINDS.some((k) => xoOn[k])) publishExtraOverlays();
        previewExtraOverlay(currentExtraOverlayKind());
      }, typing ? 180 : 0);
    }

    // While anything is on, the state is sent again every few seconds for displays that joined late
    setInterval(() => { if (XO_KINDS.some((k) => xoOn[k])) publishExtraOverlays(); }, 4000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncExtraOverlayLabels); else syncExtraOverlayLabels();
