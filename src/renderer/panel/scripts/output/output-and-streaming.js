    function setProgramDisplayAspect(aspect) {
      const shell = document.getElementById('program-display-shell');
      if (!shell) return;
      const normalized = (aspect === '9:16') ? '9:16' : '16:9';
      shell.dataset.aspect = normalized;
      document.getElementById('program-aspect-16x9')?.classList.toggle('active', normalized === '16:9');
      document.getElementById('program-aspect-9x16')?.classList.toggle('active', normalized === '9:16');
      requestAnimationFrame(() => {
        updateEmbeddedProgramDisplayScale();
        syncEmbeddedProgramDisplay();
        syncStandaloneOutputDirect();
      });
    }

    function clampProgramPreviewZoom(value) {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0.82;
      return Math.max(0.5, Math.min(2, num));
    }

    function setProgramPreviewZoom(value, opts = {}) {
      programPreviewZoom = clampProgramPreviewZoom(value);
      const slider = document.getElementById('program-scale-slider');
      if (slider && opts.fromSlider !== true) slider.value = programPreviewZoom.toFixed(2);
      updateEmbeddedProgramDisplayScale();
    }

    function updateProgramScaleUi(scale, baseW, baseH) {
      const zoomValue = document.getElementById('program-scale-value');
      const sizeValue = document.getElementById('program-scale-size');
      if (zoomValue) zoomValue.textContent = `${Math.round(programPreviewZoom * 100)}%`;
      if (sizeValue) {
        const w = Math.max(1, Math.round(baseW * scale));
        const h = Math.max(1, Math.round(baseH * scale));
        sizeValue.textContent = `Scaled (${w}x${h})`;
      }
    }

    function layoutProgramScaleControls() {
      const bar = document.getElementById('program-scale-controls');
      const leftBlock = bar ? bar.querySelector('.program-scale-left') : null;
      const goLiveGroup = bar ? bar.querySelector('.program-display-controls') : null;
      const outputBtn = document.getElementById('btn-open-standalone-output');
      if (!bar || !leftBlock || !goLiveGroup) return;

      const barW = bar.clientWidth || 0;
      const goW = goLiveGroup.offsetWidth || 0;
      if (!barW || !goW) return;
      const compact = barW < 620;
      bar.classList.toggle('is-compact', compact);
      if (compact) {
        goLiveGroup.style.left = '';
        return;
      }

      const defaultLeft = (barW - goW) / 2;
      const leftBound = (leftBlock.offsetLeft || 0) + (leftBlock.offsetWidth || 0) + 8;

      let rightBound = barW - goW - 8;
      if (outputBtn && outputBtn.offsetParent === bar) {
        rightBound = Math.min(rightBound, (outputBtn.offsetLeft || barW) - goW - 12);
      }

      const clampedLeft = Math.max(leftBound, Math.min(defaultLeft, rightBound));
      goLiveGroup.style.left = `${Math.max(0, clampedLeft)}px`;
    }

    let pendingProgramPreviewPayload = null;

    function applyProgramDisplaySource(source, opts = {}) {
      const frame = document.getElementById('program-display-frame');
      if (!frame) return;
      const normalized = 'lyrics';
      const forceReload = !!opts.forceReload;
      if (!forceReload && currentProgramDisplaySource === normalized && frame.dataset.previewDocument === '1') {
        return;
      }
      currentProgramDisplaySource = normalized;
      embeddedProgramDisplayReady = false;
      frame.dataset.previewDocument = '1';
      frame.removeAttribute('src');
      frame.srcdoc = buildStandaloneDisplayHtml({ preview: true });

      // Projection streaming now captures from the Program Display directly,
      // so source switching is handled automatically. This call is a no-op
      // but kept for API compatibility.
      if (window.BSPDesktop && typeof window.BSPDesktop.switchStreamSource === 'function') {
        try { window.BSPDesktop.switchStreamSource(normalized); } catch (e) {}
      }
    }

    function getStandaloneOutputUrl() {
      return getDisplayFileForTab('lyrics', 'standalone');
    }

    function getEmbeddedDisplayViewport() {
      const shell = document.getElementById('program-display-shell');
      const isPortrait = shell?.dataset?.aspect === '9:16';
      return isPortrait
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
    }

    function updateEmbeddedProgramDisplayScale() {
      const shell = document.getElementById('program-display-shell');
      const frame = document.getElementById('program-display-frame');
      if (!shell || !frame) return;
      const shellW = shell.clientWidth || 0;
      const shellH = shell.clientHeight || 0;
      if (!shellW || !shellH) return;
      const isPortrait = shell.dataset.aspect === '9:16';
      const baseW = isPortrait ? 1080 : 1920;
      const baseH = isPortrait ? 1920 : 1080;
      // Use strict "contain" scaling so framing is never cropped in embedded preview.
      const fitScale = Math.min(1, Math.min(shellW / baseW, shellH / baseH));
      const scale = fitScale * programPreviewZoom;
      const scaledW = baseW * scale;
      const scaledH = baseH * scale;
      const offsetX = Math.round((shellW - scaledW) / 2);
      const offsetY = Math.round((shellH - scaledH) / 2);
      [frame].forEach((el) => {
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = baseW + 'px';
        el.style.height = baseH + 'px';
        el.style.transformOrigin = 'top left';
        el.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      });
      updateProgramScaleUi(scale, baseW, baseH);
    }

    function postMessageToEmbeddedProgramDisplay(message) {
      const frame = document.getElementById('program-display-frame');
      if (!frame || !frame.contentWindow || !embeddedProgramDisplayReady) return false;
      frame.contentWindow.postMessage(message, '*');
      return true;
    }

    // ── Preview monitor ────────────────────────────────────────────────────
    // A second embedded display beside Program. Preview payloads land here,
    // so the Program monitor (and the output synced from it) only ever shows
    // what is actually live.
    // Preview payloads go to every preview display: the Preview monitor and
    // the large preview on the Overlays tab ({ shell, frame } element ids).
    const PREVIEW_DISPLAYS = [
      { shell: 'preview-display-shell', frame: 'preview-display-frame' },
      // Built the first time the Overlays tab opens, not at startup
      { shell: 'overlay-preview-shell', frame: 'overlay-preview-frame', lazy: true },
      // Built the first time Settings opens
      { shell: 'settings-preview-shell', frame: 'settings-preview-frame', lazy: 'settings' }
    ];
    const previewDisplaysReady = new Set();
    let previewMonitorState = { kind: 'clear' };

    function hasPreviewMonitor() {
      return !!document.getElementById('preview-display-frame');
    }

    function postMessageToPreviewMonitor(message) {
      let posted = false;
      PREVIEW_DISPLAYS.forEach(({ frame: frameId }) => {
        const frame = document.getElementById(frameId);
        if (!frame || !frame.contentWindow || !previewDisplaysReady.has(frameId)) return;
        frame.contentWindow.postMessage(message, '*');
        posted = true;
      });
      return posted;
    }

    function syncPreviewMonitor() {
      if (!previewDisplaysReady.size) return;
      if (previewMonitorState.kind === 'update' && previewMonitorState.payload) {
        postMessageToPreviewMonitor({ type: 'PREVIEW_UPDATE', payload: previewMonitorState.payload });
      } else {
        postMessageToPreviewMonitor({ type: 'PREVIEW_CLEAR' });
      }
    }

    function scalePreviewDisplay(shellId, frameId) {
      const shell = document.getElementById(shellId);
      const frame = document.getElementById(frameId);
      if (!shell || !frame) return;
      const shellW = shell.clientWidth || 0;
      const shellH = shell.clientHeight || 0;
      if (!shellW || !shellH) return;
      const { width: baseW, height: baseH } = getEmbeddedDisplayViewport();
      const scale = Math.min(shellW / baseW, shellH / baseH);
      const offsetX = Math.round((shellW - baseW * scale) / 2);
      const offsetY = Math.round((shellH - baseH * scale) / 2);
      frame.style.width = baseW + 'px';
      frame.style.height = baseH + 'px';
      frame.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }


    function initPreviewMonitor() {
      PREVIEW_DISPLAYS.filter(display => !display.lazy).forEach(initPreviewDisplay);
    }

    function initOverlayPreview() {
      PREVIEW_DISPLAYS.filter(display => display.lazy === true).forEach(initPreviewDisplay);
    }

    function initSettingsPreview() {
      PREVIEW_DISPLAYS.filter(display => display.lazy === 'settings').forEach(initPreviewDisplay);
      const frame = document.getElementById('settings-preview-frame');
      if (frame) scalePreviewDisplay('settings-preview-shell', 'settings-preview-frame');
    }

    function initPreviewDisplay({ shell: shellId, frame: frameId }) {
      const frame = document.getElementById(frameId);
      const shell = document.getElementById(shellId);
      if (!frame || frame.dataset.bound) return;
      frame.dataset.bound = '1';
      previewDisplaysReady.delete(frameId);
      frame.addEventListener('load', () => {
        previewDisplaysReady.add(frameId);
        // The Overlays preview sits over a program feed, so the page itself is see-through
        if (frameId === 'overlay-preview-frame') {
          try {
            const doc = frame.contentDocument;
            doc.documentElement.style.background = 'transparent';
            doc.body.style.background = 'transparent';
          } catch (error) { /* cross-origin: keep the default */ }
        }
        scalePreviewDisplay(shellId, frameId);
        syncPreviewMonitor();
      });
      frame.srcdoc = buildStandaloneDisplayHtml({ preview: true });
      if (shell && typeof ResizeObserver === 'function') {
        new ResizeObserver(() => scalePreviewDisplay(shellId, frameId)).observe(shell);
      } else {
        window.addEventListener('resize', () => scalePreviewDisplay(shellId, frameId));
      }
    }

    function setPreviewMonitorCaption(text) {
      const caption = document.getElementById('preview-monitor-caption');
      if (caption) caption.textContent = text;
    }

    function setProgramMonitorOnAir(onAir) {
      document.body.classList.toggle('sp-program-on-air', !!onAir);
      const caption = document.getElementById('program-monitor-caption');
      if (caption) caption.textContent = onAir ? 'On air' : 'Clear';
      const ref = document.getElementById('program-monitor-ref');
      const liveItem = onAir ? getLiveItem() : null;
      if (ref) ref.textContent = liveItem ? getItemPageRef(liveItem, liveLineCursor) : '';
    }

    function setPreviewMonitorRef(text) {
      const ref = document.getElementById('preview-monitor-ref');
      if (ref) ref.textContent = text || '';
    }

    function clearPreviewMonitor() {
      previewMonitorState = { kind: 'clear' };
      return postMessageToPreviewMonitor({ type: 'PREVIEW_CLEAR' });
    }

    function sendProgramPreview(payload, opts = {}) {
      if (!payload) return false;
      if (typeof forMonitor === 'function') payload = forMonitor(payload);
      // A mirrored live payload already carries the version gap
      if (!opts.mirror && typeof applyBibleVersionGap === 'function') payload = applyBibleVersionGap(payload);
      const viewport = getEmbeddedDisplayViewport();
      const previewPayload = {
        ...payload,
        seq: nextSeq(),
        displayViewportWidth: viewport.width,
        displayViewportHeight: viewport.height
      };
      if (hasPreviewMonitor()) {
        previewMonitorState = { kind: 'update', payload: previewPayload };
        syncPreviewMonitor();
        return true;
      }
      embeddedProgramDisplayState = { kind: 'update', payload: previewPayload };
      if (!embeddedProgramDisplayReady) {
        pendingProgramPreviewPayload = previewPayload;
        return true;
      }
      pendingProgramPreviewPayload = null;
      return postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_UPDATE', payload: previewPayload });
    }

    function clearProgramPreview() {
      if (hasPreviewMonitor()) {
        if (!clearPreviewMonitor()) {
          showToast('Preview display is not ready');
          return false;
        }
        showToast('Preview cleared');
        return true;
      }
      pendingProgramPreviewPayload = null;
      embeddedProgramDisplayState = { kind: 'clear' };
      if (!postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_CLEAR' })) {
        showToast('Preview display is not ready');
        return false;
      }
      showToast('Preview cleared');
      return true;
    }

    function postMessageToStandaloneOutput(message, target) {
      if (window.BSPDesktop && typeof window.BSPDesktop.sendOutputMessage === 'function') {
        window.BSPDesktop.sendOutputMessage(message, target).catch(() => {});
        return true;
      }
      if (!standaloneDisplayWindow || standaloneDisplayWindow.closed) return false;
      try {
        standaloneDisplayWindow.postMessage(message, '*');
        return true;
      } catch (e) {
        return false;
      }
    }

    function syncStandaloneOutputDirect(burstSeq) {
      const viewport = getEmbeddedDisplayViewport();
      const seq = burstSeq || nextSeq();
      if (currentProgramDisplaySource !== 'lyrics') return;
      // The output window only ever shows what is on air. A stale Program state
      // (nothing live) must not paint a black full-screen page over a transparent output.
      const onAir = typeof getOnAirPayload === 'function' ? getOnAirPayload() : null;
      if (onAir && embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload) {
        // The stream feed shows the live output (lower third); the HDMI main screen is a monitor (full screen)
        const base = embeddedProgramDisplayState.payload;
        const send = (payload, target) => postMessageToStandaloneOutput({
          type: 'PREVIEW_UPDATE',
          payload: {
            ...payload,
            mode: payload.lowerThirdOnly ? payload.mode : (payload.forceLt ? 'lt' : 'full'),
            seq,
            displayViewportWidth: viewport.width,
            displayViewportHeight: viewport.height
          }
        }, target);
        send(typeof forOutput === 'function' ? forOutput(base) : base, 'feed');
        send(typeof forMonitor === 'function' ? forMonitor(base) : base, 'output');
      } else {
        postMessageToStandaloneOutput({ type: 'PREVIEW_CLEAR' });
      }
    }

    function queueStandaloneSyncBurst() {
      standaloneSyncTimers.forEach(tid => clearTimeout(tid));
      standaloneSyncTimers = [];
      const burstSeq = nextSeq();
      const delays = [0, 120, 320, 700, 1200];
      delays.forEach((delay) => {
        const tid = setTimeout(() => syncStandaloneOutputDirect(burstSeq), delay);
        standaloneSyncTimers.push(tid);
      });
    }

    function syncEmbeddedProgramDisplay() {
      if (currentProgramDisplaySource !== 'lyrics') return;
      if (!embeddedProgramDisplayReady) return;
      const viewport = getEmbeddedDisplayViewport();
      if (embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload) {
        postMessageToEmbeddedProgramDisplay({
          type: 'PREVIEW_UPDATE',
          payload: {
            ...embeddedProgramDisplayState.payload,
            displayViewportWidth: viewport.width,
            displayViewportHeight: viewport.height
          }
        });
      } else {
        postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_CLEAR' });
      }
    }

    function initEmbeddedProgramDisplay() {
      const frame = document.getElementById('program-display-frame');
      const shell = document.getElementById('program-display-shell');
      if (!frame) return;
      const slider = document.getElementById('program-scale-slider');
      const zoomInBtn = document.getElementById('program-scale-in');
      const zoomOutBtn = document.getElementById('program-scale-out');
      const fitBtn = document.getElementById('program-scale-fit');
      embeddedProgramDisplayReady = false;
      if (slider && !slider.dataset.bound) {
        slider.dataset.bound = '1';
        slider.addEventListener('input', () => setProgramPreviewZoom(slider.value, { fromSlider: true }));
      }
      if (zoomInBtn && !zoomInBtn.dataset.bound) {
        zoomInBtn.dataset.bound = '1';
        zoomInBtn.addEventListener('click', () => setProgramPreviewZoom(programPreviewZoom + 0.05));
      }
      if (zoomOutBtn && !zoomOutBtn.dataset.bound) {
        zoomOutBtn.dataset.bound = '1';
        zoomOutBtn.addEventListener('click', () => setProgramPreviewZoom(programPreviewZoom - 0.05));
      }
      if (fitBtn && !fitBtn.dataset.bound) {
        fitBtn.dataset.bound = '1';
        fitBtn.addEventListener('click', () => setProgramPreviewZoom(1));
      }
      frame.addEventListener('load', () => {
        embeddedProgramDisplayReady = true;
        updateEmbeddedProgramDisplayScale();
        layoutProgramScaleControls();
        if (pendingProgramPreviewPayload) {
          postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_UPDATE', payload: pendingProgramPreviewPayload });
          pendingProgramPreviewPayload = null;
        } else {
	        syncEmbeddedProgramDisplay();
        }
      });
      applyProgramDisplaySource('lyrics', { forceReload: true });
      initPreviewMonitor();
      setProgramDisplayAspect('16:9');
      setProgramPreviewZoom(programPreviewZoom);
      layoutProgramScaleControls();
      if (shell && typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => {
          updateEmbeddedProgramDisplayScale();
          layoutProgramScaleControls();
        });
        ro.observe(shell);
      } else {
        window.addEventListener('resize', () => {
          updateEmbeddedProgramDisplayScale();
          layoutProgramScaleControls();
        });
      }
    }

    // Absolute, so the embedded and standalone output pages find the bundled fonts
    const BUNDLED_FONTS_CSS_URL = new URL('../fonts/fonts.css', window.location.href).href;

    function buildStandaloneDisplayHtml(opts = {}) {
      const channelLiteral = JSON.stringify(CHANNEL_NAME);
      const isPreviewLiteral = opts.preview ? 'true' : 'false';
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Scripture Pod - ${opts.preview ? 'Program Preview' : 'Standalone Output'}</title>
  <link rel="stylesheet" href="${BUNDLED_FONTS_CSS_URL}">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: 'Segoe UI', system-ui, sans-serif; }
    /* Gradient background: settles in, then drifts and breathes. Moved with transforms on two
       inherited layers, so it runs on the GPU and stays smooth. */
    #bg.bg-animated { overflow: hidden; }
    #bg.bg-animated::before, #bg.bg-animated::after { content: ""; position: absolute; pointer-events: none; will-change: transform, opacity; }
    #bg.bg-animated::before {
        inset: -35%;
        background: inherit;
        background-size: cover;
        animation: bg-settle 1.8s cubic-bezier(0.2, 0.7, 0.2, 1) both, bg-drift 18s ease-in-out 1.8s infinite alternate;
    }
    #bg.bg-animated::after {
        inset: -20%;
        background: radial-gradient(circle at 70% 65%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 55%);
        animation: bg-glow-in 2.4s ease-out both, bg-glow 14s ease-in-out 2.4s infinite alternate;
    }
    @keyframes bg-settle { from { transform: translate(0, 0) scale(1.7); opacity: 0; } to { transform: translate(-4%, -3%) scale(1.2) rotate(0deg); opacity: 1; } }
    @keyframes bg-drift { from { transform: translate(-4%, -3%) scale(1.2) rotate(0deg); } to { transform: translate(5%, 4%) scale(1.38) rotate(7deg); } }
    @keyframes bg-glow-in { from { opacity: 0; transform: translate(-8%, 6%); } to { opacity: 1; transform: translate(0, 0); } }
    @keyframes bg-glow { from { transform: translate(-9%, 7%) scale(1); } to { transform: translate(10%, -8%) scale(1.25); } }
    @media (prefers-reduced-motion: reduce) { #bg.bg-animated::before, #bg.bg-animated::after { animation: none; } }
    body.display-full-mode, body.display-custom-mode { background: #000; }
    body.lower-third-only-mode, body.lyrics-lt-mode { background: transparent; }
    #bg { position: fixed; inset: 0; z-index: 2; background: #000 center / cover no-repeat; transition: filter 220ms ease, opacity 220ms ease; }
    #bg-video { position: fixed; inset: 0; z-index: 2; width: 100%; height: 100%; object-fit: cover; display: none; }
    #bg-page { position: fixed; inset: 0; z-index: 2; width: 100%; height: 100%; border: 0; display: none; pointer-events: none; }
    #stage { position: fixed; inset: 0; z-index: 3; color: #fff; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; display: flex; pointer-events: none; }
    #text-layer { width: 100%; word-break: break-word; }
    #name-role-overlay { position: fixed; inset: 0; z-index: 8; display: flex; align-items: flex-end; justify-content: flex-start; padding: 0 7vw 8vh; transform: translate(var(--name-role-offset-x,0vw),var(--name-role-offset-y,0vh)); pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 700ms ease, visibility 0s linear 700ms; }
    #name-role-overlay.is-visible { opacity: 1; visibility: visible; transition-delay: 0s; }
    .style-centered#name-role-overlay { justify-content: center; padding-bottom: 8vh; }
    .style-band#name-role-overlay { justify-content: center; padding: 0 0 7vh; }
    .style-right#name-role-overlay { scale: -1 1; transform: translate(calc(var(--name-role-offset-x,0vw) * -1),var(--name-role-offset-y,0vh)); }
    .style-right#name-role-overlay .name-role-overlay-copy, .style-right#name-role-overlay .name-role-overlay-logo { scale: -1 1; }
    .style-right#name-role-overlay .name-role-overlay-copy { align-items: flex-end; text-align: right; }
    .name-role-overlay-card { display: flex; flex-direction: row; align-items: center; gap: 18px; max-width: 86vw; min-height: 92px; padding: 14px 24px; border: 1px solid rgba(218,238,241,0.24); border-left: 5px solid var(--name-role-accent,#90D5FF); border-radius: 5px; background: rgba(8,14,18,0.82); box-shadow: 0 20px 64px rgba(0,0,0,0.42); backdrop-filter: blur(14px); color: #fff; text-align: left; opacity: 0; transform: translateY(24px) scale(0.96); transition: opacity 560ms ease, transform 720ms cubic-bezier(0.2,0.85,0.25,1), filter 620ms ease, clip-path 680ms cubic-bezier(0.2,0.85,0.25,1); will-change: opacity, transform, filter, clip-path; }
    .style-centered#name-role-overlay .name-role-overlay-card { border: 0; border-top: 4px solid var(--name-role-accent,#90D5FF); text-align: center; }
    .style-band#name-role-overlay .name-role-overlay-card { width: 100%; max-width: 100%; justify-content: center; border: 0; border-top: 3px solid var(--name-role-accent,#90D5FF); border-radius: 0; background: rgba(8,14,18,0.9); text-align: center; }
    #name-role-overlay.theme-gms .name-role-overlay-card { border: 0; border-radius: 2px; background: linear-gradient(105deg,var(--name-role-primary,var(--name-role-accent,#90D5FF)) 0 76%,#101216 76%); color: var(--name-role-foreground,#fff); box-shadow: 0 12px 34px rgba(0,0,0,0.38); }
    #name-role-overlay.theme-gms .name-role-overlay-role { color: var(--name-role-foreground,#fff); }
    #name-role-overlay.theme-noir .name-role-overlay-card { border: 1px solid rgba(222,192,132,0.78); border-left: 5px solid var(--name-role-accent,#d5b56d); background: linear-gradient(145deg,color-mix(in srgb,var(--name-role-primary,#1b1d22) 82%,#000),color-mix(in srgb,var(--name-role-primary,#1b1d22) 45%,#000)); box-shadow: 0 18px 54px rgba(0,0,0,0.58); }
    #name-role-overlay.theme-broadcast .name-role-overlay-card { border: 0; border-left: 7px solid var(--name-role-accent,#90D5FF); border-radius: 0; background: linear-gradient(105deg,var(--name-role-primary,#1559a7),color-mix(in srgb,var(--name-role-primary,#1559a7) 66%,#101216)); box-shadow: 0 12px 32px rgba(0,0,0,0.38); }
    #name-role-overlay.theme-modern .name-role-overlay-card { border: 1px solid rgba(241,248,245,0.72); border-left: 5px solid var(--name-role-accent,#90D5FF); border-radius: 2px; background: var(--name-role-primary,var(--name-role-accent,#90D5FF)); color: var(--name-role-foreground,#fff); box-shadow: 0 14px 42px rgba(0,0,0,0.3); }
    #name-role-overlay.theme-modern .name-role-overlay-role { color: var(--name-role-foreground,#fff); }
    #name-role-overlay.theme-clean .name-role-overlay-card { border: 1px solid rgba(16,22,28,0.16); border-left: 5px solid var(--name-role-accent,#90D5FF); border-radius: 3px; background: var(--name-role-primary,#fff); color: var(--name-role-foreground,#101216); box-shadow: 0 14px 42px rgba(0,0,0,0.2); }
    #name-role-overlay.theme-clean .name-role-overlay-role { color: var(--name-role-foreground,#101216); }
    #name-role-overlay.theme-glass .name-role-overlay-card { border: 1px solid rgba(255,255,255,0.38); border-left: 5px solid var(--name-role-accent,#90D5FF); border-radius: 8px; background: linear-gradient(120deg,color-mix(in srgb,var(--name-role-primary,#121e2c) 78%,transparent),color-mix(in srgb,var(--name-role-primary,#121e2c) 55%,transparent)); color: var(--name-role-foreground,#fff); box-shadow: 0 18px 48px rgba(0,0,0,0.36); backdrop-filter: blur(18px); }
    #name-role-overlay.theme-copper .name-role-overlay-card { border: 0; border-left: 6px solid var(--name-role-accent,#90D5FF); border-radius: 3px; background: linear-gradient(105deg,var(--name-role-primary,#503027),color-mix(in srgb,var(--name-role-primary,#503027) 58%,#241a18) 74%,#241a18 74%); color: var(--name-role-foreground,#fff); box-shadow: 0 14px 38px rgba(0,0,0,0.34); }
    #name-role-overlay.theme-editorial .name-role-overlay-card { border: 0; border-left: 7px solid var(--name-role-accent,#90D5FF); border-radius: 1px; background: linear-gradient(90deg,color-mix(in srgb,var(--name-role-primary,#90D5FF) 24%,#131820),#131820 78%); color: #f5f2ea; box-shadow: 0 15px 42px rgba(0,0,0,0.42); }
    #name-role-overlay.theme-editorial .name-role-overlay-role { color: var(--name-role-accent,#90D5FF); }
    #name-role-overlay.theme-neon .name-role-overlay-card { border: 1px solid color-mix(in srgb,var(--name-role-accent,#90D5FF) 64%,transparent); border-left: 5px solid var(--name-role-accent,#90D5FF); border-radius: 10px; background: linear-gradient(115deg,#080c12,color-mix(in srgb,var(--name-role-primary,#90D5FF) 25%,#080c12)); color: #f8fafc; box-shadow: 0 0 0 1px color-mix(in srgb,var(--name-role-accent,#90D5FF) 22%,transparent),0 0 28px color-mix(in srgb,var(--name-role-accent,#90D5FF) 30%,transparent); }
    #name-role-overlay.theme-neon .name-role-overlay-role { color: var(--name-role-accent,#90D5FF); }
    #name-role-overlay.theme-ribbon .name-role-overlay-card { border: 0; border-left: 12px solid var(--name-role-accent,#90D5FF); border-bottom: 2px solid var(--name-role-accent,#90D5FF); border-radius: 0 6px 6px 0; background: var(--name-role-primary,#90D5FF); color: var(--name-role-foreground,#101216); box-shadow: 0 14px 34px rgba(0,0,0,0.34); }
    #name-role-overlay.theme-news .name-role-overlay-card { border: 0; border-left: 8px solid var(--name-role-accent,#90D5FF); border-bottom: 3px solid var(--name-role-accent,#90D5FF); border-radius: 0; background: linear-gradient(90deg,color-mix(in srgb,var(--name-role-primary,#0d1014) 82%,#0d1014),color-mix(in srgb,var(--name-role-primary,#1d2126) 82%,#1d2126)); box-shadow: 0 12px 36px rgba(0,0,0,0.48); }
    #name-role-overlay.theme-spotlight .name-role-overlay-card { border: 1px solid rgba(255,255,255,0.22); border-bottom: 4px solid var(--name-role-accent,#90D5FF); border-radius: 12px; background: linear-gradient(135deg,color-mix(in srgb,var(--name-role-primary,#101925) 76%,#101925),color-mix(in srgb,var(--name-role-primary,#080b13) 62%,#080b13)); box-shadow: 0 0 34px color-mix(in srgb,var(--name-role-accent,#90D5FF) 38%,transparent),0 20px 56px rgba(0,0,0,0.5); }
    #name-role-overlay.is-light-background .name-role-overlay-card { background: var(--name-role-primary,#fff); color: var(--name-role-foreground,#101216); }
    #name-role-overlay.is-light-background.theme-legacy .name-role-overlay-copy-panel { background: var(--name-role-primary,#fff); }
    #name-role-overlay.theme-legacy .name-role-overlay-card { flex-direction: row; align-items: center; gap: 18px; width: min(980px,82vw); max-width: 82vw; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
    #name-role-overlay.theme-legacy .name-role-overlay-stack { align-self: center; flex: 1; }
    #name-role-overlay.theme-legacy .name-role-overlay-copy-panel { align-self: stretch; min-width: 0; padding: 14px 22px 16px; border-left: 5px solid var(--name-role-accent,#90D5FF); background: linear-gradient(90deg,color-mix(in srgb,var(--name-role-primary,#90D5FF) 94%,transparent),color-mix(in srgb,var(--name-role-primary,#90D5FF) 76%,transparent) 72%,transparent); color: var(--name-role-foreground,#fff); text-shadow: 0 2px 9px rgba(0,0,0,0.85); }
    #name-role-overlay.is-light-background .name-role-overlay-card { background: var(--name-role-primary,#fff); color: var(--name-role-foreground,#101216); }
    #name-role-overlay.is-light-background .name-role-overlay-role { color: var(--name-role-foreground,#101216); }
    #name-role-overlay.is-light-background.theme-editorial .name-role-overlay-card { background: linear-gradient(90deg,color-mix(in srgb,var(--name-role-primary,#90D5FF) 24%,#131820),#131820 78%); color: #f5f2ea; }
    #name-role-overlay.is-light-background.theme-neon .name-role-overlay-card { background: linear-gradient(115deg,#080c12,color-mix(in srgb,var(--name-role-primary,#90D5FF) 25%,#080c12)); color: #f8fafc; }
    #name-role-overlay.is-light-background.theme-editorial .name-role-overlay-role, #name-role-overlay.is-light-background.theme-neon .name-role-overlay-role { color: var(--name-role-accent,#90D5FF); }
    #name-role-overlay.is-light-background.theme-legacy .name-role-overlay-copy-panel { background: var(--name-role-primary,#fff); color: var(--name-role-foreground,#101216); text-shadow: none; }
    #name-role-overlay.theme-legacy .name-role-overlay-accent { display: none; }
    #name-role-overlay.theme-legacy .name-role-overlay-logo { align-self: center; width: min(var(--name-role-logo-size,128px),22vw); height: min(var(--name-role-logo-size,128px),16vh); margin: 0; }
    #name-role-overlay.is-visible .name-role-overlay-card { opacity: 1; transform: translateY(0) scale(1); }
    #name-role-overlay.motion-slide:not(.is-visible) .name-role-overlay-card { transform: translateX(-54px); }
    #name-role-overlay.motion-slide.is-visible .name-role-overlay-card { transform: translateX(0); }
    #name-role-overlay.motion-sweep:not(.is-visible) .name-role-overlay-card { transform: translateX(-72px) skewX(-7deg); }
    #name-role-overlay.motion-sweep.is-visible .name-role-overlay-card { transform: translateX(0) skewX(0); }
    #name-role-overlay.motion-zoom:not(.is-visible) .name-role-overlay-card { transform: scale(0.72); }
    #name-role-overlay.motion-zoom.is-visible .name-role-overlay-card { transform: scale(1); }
    #name-role-overlay.motion-shutter:not(.is-visible) .name-role-overlay-card { transform: scaleX(0.12); }
    #name-role-overlay.motion-shutter.is-visible .name-role-overlay-card { transform: scaleX(1); }
    #name-role-overlay.motion-spring .name-role-overlay-card { transition-timing-function: cubic-bezier(0.2,1.4,0.35,1); }
    #name-role-overlay.motion-glide:not(.is-visible) .name-role-overlay-card { transform: translateX(-5vw) scale(0.98); }
    #name-role-overlay.motion-glide.is-visible .name-role-overlay-card { transform: translateX(0) scale(1); }
    #name-role-overlay.motion-blur:not(.is-visible) .name-role-overlay-card { filter: blur(12px); transform: translateY(14px) scale(1.02); }
    #name-role-overlay.motion-blur.is-visible .name-role-overlay-card { filter: blur(0); transform: translateY(0) scale(1); }
    #name-role-overlay.motion-flip:not(.is-visible) .name-role-overlay-card { transform: perspective(900px) rotateX(18deg) translateY(18px); transform-origin: center bottom; }
    #name-role-overlay.motion-flip.is-visible .name-role-overlay-card { transform: perspective(900px) rotateX(0) translateY(0); }
    #name-role-overlay.motion-wipe:not(.is-visible) .name-role-overlay-card { clip-path: inset(0 100% 0 0); transform: translateX(-18px); }
    #name-role-overlay.motion-wipe.is-visible .name-role-overlay-card { clip-path: inset(0); transform: translateX(0); }
    #name-role-overlay.motion-float:not(.is-visible) .name-role-overlay-card { transform: translateY(30px) scale(0.97); }
    #name-role-overlay.motion-float.is-visible .name-role-overlay-card { transform: translateY(0) scale(1); }
    #name-role-overlay.motion-glow:not(.is-visible) .name-role-overlay-card { filter: blur(10px); transform: scale(0.95); }
    #name-role-overlay.motion-glow.is-visible .name-role-overlay-card { filter: drop-shadow(0 0 18px color-mix(in srgb,var(--name-role-accent,#90D5FF) 55%,transparent)); transform: scale(1); }
    #name-role-overlay.motion-reveal:not(.is-visible) .name-role-overlay-card { clip-path: inset(100% 0 0 0); transform: translateY(18px); }
    #name-role-overlay.motion-reveal.is-visible .name-role-overlay-card { clip-path: inset(0); transform: translateY(0); }
    #name-role-overlay.motion-drop:not(.is-visible) .name-role-overlay-card { transform: translateY(-6vh) scale(0.95); }
    #name-role-overlay.motion-drop.is-visible .name-role-overlay-card { transform: translateY(0) scale(1); }
    #name-role-overlay.motion-curtain:not(.is-visible) .name-role-overlay-card { clip-path: inset(0 50% 0 50%); transform: scaleX(0.82); }
    #name-role-overlay.motion-curtain.is-visible .name-role-overlay-card { clip-path: inset(0); transform: scaleX(1); }
    #name-role-overlay.motion-pop:not(.is-visible) .name-role-overlay-card { transform: scale(0.68) rotate(-5deg); }
    #name-role-overlay.motion-pop.is-visible .name-role-overlay-card { transform: scale(1) rotate(0); }
    #name-role-overlay.motion-expand:not(.is-visible) .name-role-overlay-card { clip-path: inset(0 0 60% 0); transform: scaleY(0.76); transform-origin: center bottom; }
    #name-role-overlay.motion-expand.is-visible .name-role-overlay-card { clip-path: inset(0); transform: scaleY(1); }
    .name-role-overlay-accent { width: 4px; height: 58px; flex: 0 0 4px; border-radius: 2px; background: var(--name-role-accent,#90D5FF); transform: scaleY(0.15); transition: transform 540ms cubic-bezier(0.2,0.85,0.25,1) 120ms; }
    #name-role-overlay.is-visible .name-role-overlay-accent { transform: scaleY(1); }
    .style-centered#name-role-overlay .name-role-overlay-accent { width: 34px; height: 3px; flex-basis: 34px; align-self: flex-start; margin-top: 8px; transform: scaleX(0.15); }
    .style-centered#name-role-overlay.is-visible .name-role-overlay-accent { transform: scaleX(1); }
    .style-band#name-role-overlay .name-role-overlay-accent { display: none; }
    .name-role-overlay-logo { display: block; width: var(--name-role-logo-size,128px); height: var(--name-role-logo-size,128px); max-width: min(24vw,320px); max-height: min(28vh,320px); object-fit: contain; flex: 0 0 auto; }
    #name-role-overlay .name-role-overlay-logo { filter: brightness(0) invert(1); }
    #name-role-overlay.logo-black .name-role-overlay-logo { filter: brightness(0); }
    #name-role-overlay.logo-off .name-role-overlay-logo { display: none; }
    #name-role-overlay.is-resetting, #name-role-overlay.is-resetting * { transition: none !important; animation: none !important; }
    .name-role-overlay-logo[hidden] { display: none; }
    .name-role-overlay-content { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 8px; }
    .name-role-overlay-copy { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 0.08em; }
    .name-role-overlay-stack { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 8px; }
    .name-role-overlay-copy-panel { display: flex; min-width: 0; align-items: center; padding: 12px 18px; border: 1px solid rgba(255,255,255,0.14); border-left: 4px solid var(--name-role-accent,#90D5FF); border-radius: 4px; background: rgba(8,14,18,0.76); }
    .style-centered#name-role-overlay .name-role-overlay-content, .style-band#name-role-overlay .name-role-overlay-content { align-items: center; }
    .name-role-social[hidden], .name-role-action[hidden] { display: none; }
    .name-role-social { display: inline-flex; align-items: center; gap: 5px; min-width: 0; flex: 0 0 auto; }
    .name-role-social b { display: inline-flex; align-items: center; justify-content: center; width: var(--social-engagement-icon-size,20px); height: var(--social-engagement-icon-size,20px); flex: 0 0 var(--social-engagement-icon-size,20px); color: var(--social-engagement-accent,#90D5FF); }
    .name-role-social b svg { display: block; width: 100%; height: 100%; }
    .name-role-social span { max-width: 32vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name-role-action { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border: 1px solid color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 70%,transparent); border-radius: 999px; background: rgba(7,12,16,0.32); color: currentColor; font-size: var(--social-engagement-action-size,11px); font-weight: 800; opacity: 0; transform: translateY(9px) scale(0.96); transition: opacity 360ms ease,transform 460ms cubic-bezier(0.2,0.85,0.25,1); }
    #name-role-overlay.is-visible .name-role-action:not([hidden]) { opacity: 1; transform: translateY(0) scale(1); }
    #name-role-overlay.is-visible .name-role-action-like { transition-delay: 100ms; }
    #name-role-overlay.is-visible .name-role-action-share { transition-delay: 190ms; }
    #name-role-overlay.is-visible .name-role-action-subscribe { transition-delay: 280ms; }
    .name-role-overlay-name { max-width: 72vw; overflow-wrap: anywhere; font-size: var(--name-role-name-size,56px); font-weight: 800; line-height: 1.04; }
    .name-role-overlay-role { color: var(--name-role-accent,#90D5FF); font-size: var(--name-role-role-size,24px); font-weight: 600; line-height: 1.15; opacity: 0; transform: translateY(10px); transition: opacity 440ms ease 180ms, transform 520ms ease 180ms; }
    #name-role-overlay.is-visible .name-role-overlay-role { opacity: 1; transform: translateY(0); }
    #stage.mode-full { align-items: center; justify-content: center; padding: 20px; }
    #stage.mode-full #text-layer { max-width: calc(100vw - 40px); text-align: center; }
    #stage.mode-lt { align-items: flex-end; justify-content: center; padding: 0; }
    #lt-wrap { width: 100%; display: none; padding: 12px 24px; background: linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.0)); }
    #stage.mode-lt #lt-wrap { display: flex; align-items: center; justify-content: center; }
    #stage.mode-lt #text-layer { max-width: min(96vw, 1900px); text-align: center; }
    .jo-ref-line { margin-bottom: 8px; font-weight: 800; letter-spacing: 0.03em; display: inline-block; }
    .jo-body { font-weight: inherit; }
    .dual-secondary-wrapper, .triple-tertiary-wrapper { margin-top: var(--bible-version-gap, 14px); width: 100%; }
    .dual-secondary-wrapper { opacity: 0.96; }
    #hud { position: fixed; right: 10px; top: 10px; z-index: 9; font-size: 11px; color: rgba(255,255,255,0.65); background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15); border-radius: 7px; padding: 4px 8px; }
    ${(typeof window !== 'undefined' && window.SP_LT_EXTRA && window.SP_LT_EXTRA.css) || ''}
    ${(typeof window !== 'undefined' && window.SP_SOCIAL && window.SP_SOCIAL.css) || ''}
  </style>
</head>
<body>
  <div id="bg"></div>
  <video id="bg-video" muted autoplay playsinline></video>
  <iframe id="bg-page" title="Background web page" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>
  <div id="stage" class="mode-full">
    <div id="lt-wrap">
      <div id="text-layer"></div>
    </div>
    <div id="text-layer-full" style="display:none"></div>
  </div>
  <div id="name-role-overlay" aria-hidden="true">
    <div class="name-role-overlay-card">
      <span class="name-role-overlay-accent"></span>
      <img class="name-role-overlay-logo" alt="" hidden>
      <div class="name-role-overlay-stack">
        <div class="name-role-overlay-copy-panel">
          <div class="name-role-overlay-copy">
            <strong class="name-role-overlay-name"></strong>
            <span class="name-role-overlay-role"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="social-engagement-overlay" aria-hidden="true" data-position="bottom-center" data-theme="solid"></div>
  <div id="hud">${opts.preview ? 'Program Preview' : 'Standalone Output'}</div>
  <script>${(typeof window !== 'undefined' && window.SP_SOCIAL_SOURCE) || ''}</script>
  <script>
    (function () {
      const CHANNEL_NAME = ${channelLiteral};
      const IS_PREVIEW = ${isPreviewLiteral};
      const channel = IS_PREVIEW ? null : new BroadcastChannel(CHANNEL_NAME);
      const bg = document.getElementById('bg');
      const bgVideo = document.getElementById('bg-video');
      const bgPage = document.getElementById('bg-page');
      // Ensure loop behavior works reliably across sources/browsers
      try {
        bgVideo.addEventListener('ended', function () {
          try {
            console.debug('[DISPLAY] bgVideo ended event fired', { src: bgVideo && bgVideo.src, loop: !!(bgVideo && bgVideo.loop) });
            if (!bgVideo) return;
            // If a seamless-loop controller is present, don't interfere
            var skip = false;
            try {
              var ctrl = (typeof getSeamlessLoopController === 'function') ? getSeamlessLoopController(bgVideo) : null;
              if (ctrl && ctrl.enabled) skip = true;
            } catch (e) {}
            if (skip) return;
            if (bgVideo.loop && bgVideo.src) {
              // First attempt: simple rewind + play
              try { bgVideo.currentTime = 0; } catch (_) {}
              var p = bgVideo.play();
              if (p && p.catch) {
                p.catch(function (err) {
                  console.debug('[DISPLAY] bgVideo.play() rejected on ended — attempting reload', err);
                  // Fallback: reset src and reload then play
                  try {
                    var orig = bgVideo.src;
                    bgVideo.removeAttribute('src');
                    try { bgVideo.load(); } catch (_) {}
                    bgVideo.src = orig;
                    try { bgVideo.load(); } catch (_) {}
                    bgVideo.play().catch(function (e) { console.debug('[DISPLAY] bgVideo reload/play failed', e); });
                  } catch (e2) { console.debug('[DISPLAY] bgVideo ended fallback failed', e2); }
                });
              }
            }
          } catch (e) { console.debug('[DISPLAY] bgVideo ended handler error', e); }
        });
      } catch (e) { console.debug('[DISPLAY] could not bind bgVideo ended handler', e); }
      const stage = document.getElementById('stage');
      const ltWrap = document.getElementById('lt-wrap');
      const ltText = document.getElementById('text-layer');
      const fullText = document.getElementById('text-layer-full');
      const hud = document.getElementById('hud');
      let lastSeq = 0;
      let lowerThirdOnlyMode = false;
      let lastNormalUpdate = null;
      if (IS_PREVIEW && hud) hud.style.display = 'none';

      function safeAlign(value, fallback) {
        const v = String(value || '').toLowerCase();
        if (v === 'left' || v === 'right' || v === 'center' || v === 'justify') return v;
        return fallback;
      }

      function safeVAlign(value, fallback) {
        const v = String(value || '').toLowerCase();
        if (v === 'top' || v === 'middle' || v === 'bottom') return v;
        return fallback;
      }

      function mapVAlign(value) {
        if (value === 'top') return 'flex-start';
        if (value === 'bottom') return 'flex-end';
        return 'center';
      }

      function sendHello() {
        if (!channel) return;
        channel.postMessage({ type: 'HELLO', proto: 1, sender: 'display', ts: Date.now() });
      }

      function respondPong() {
        if (!channel) return;
        channel.postMessage({ type: 'PONG', proto: 1, sender: 'display', ts: Date.now() });
      }

      function getWebPageBackgroundUrl(src) {
        const raw = String(src || '').trim();
        if (!raw) return '';
        try {
          const url = new URL(/^https?:\\/\\//i.test(raw) ? raw : 'https://' + raw);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
          if (/\\/background-media\\/[a-f0-9-]+\\/?$/i.test(url.pathname)) return '';
          if (/\\.(?:3gp|avi|flv|gif|m3u8|m4v|mkv|mov|mp4|mpeg|mpg|mpd|ogv|ogg|ts|webm|wmv)$/i.test(url.pathname)) return '';
          return url.href;
        } catch (_) {
          return '';
        }
      }

      function setBackground(data) {
        const enabled = !!data.bgEnabled;
        const bgType = String(data.bgType || 'color');
        const opacity = Math.max(0, Math.min(1, Number(data.bgOpacity == null ? 1 : data.bgOpacity)));
        const blurPx = Math.max(0, Math.min(40, Number(data.bgBlur || 0)));
        bg.style.opacity = enabled ? String(opacity) : '0';
        bg.style.filter = blurPx > 0 ? 'blur(' + blurPx + 'px)' : 'none';
        bg.classList.remove('bg-animated');

        if (!enabled) {
          bg.style.background = '#000';
          bg.style.backgroundImage = 'none';
          bgPage.style.display = 'none';
          bgPage.removeAttribute('src');
          bgPage.dataset.src = '';
          bgVideo.pause();
          bgVideo.removeAttribute('src');
          bgVideo.style.display = 'none';
          return;
        }

        if (bgType === 'video' && data.bgVideo) {
          bg.style.background = '#000';
          bg.style.backgroundImage = 'none';
          const pageUrl = getWebPageBackgroundUrl(data.bgVideo);
          if (pageUrl) {
            bgVideo.pause();
            bgVideo.removeAttribute('src');
            bgVideo.style.display = 'none';
            if (bgPage.dataset.src !== pageUrl) {
              bgPage.dataset.src = pageUrl;
              bgPage.src = pageUrl;
            }
            bgPage.style.display = 'block';
            return;
          }
          bgPage.style.display = 'none';
          bgPage.removeAttribute('src');
          bgPage.dataset.src = '';
          try {
            if (bgVideo.src !== data.bgVideo) bgVideo.src = data.bgVideo;
            bgVideo.loop = !!data.bgVideoLoop;
            bgVideo.playbackRate = Math.max(0.25, Math.min(2.5, Number(data.bgVideoSpeed || 1)));
            bgVideo.style.display = 'block';
            bgVideo.play().catch(function () {});
          } catch (e) {}
          return;
        }

        bgVideo.pause();
        bgVideo.style.display = 'none';
        bgVideo.removeAttribute('src');
        bgPage.style.display = 'none';
        bgPage.removeAttribute('src');
        bgPage.dataset.src = '';

        if (bgType === 'image' && data.bgImage) {
          bg.style.background = '#000';
          bg.style.backgroundImage = 'url("' + String(data.bgImage).replace(/"/g, '\\"') + '")';
          return;
        }

        const mode = String(data.bgMode || 'solid');
        bg.classList.toggle('bg-animated', mode === 'gradient');
        const angle = Number(data.bgGradientAngle || 135);
        const shadow = data.bgGradientShadow || '#111111';
        const highlight = data.bgGradientHighlight || '#000000';
        if (mode === 'gradient') {
          bg.style.backgroundImage = data.bgGradientShape === 'linear'
            ? 'linear-gradient(' + angle + 'deg, ' + shadow + ', ' + highlight + ')'
            : 'radial-gradient(ellipse 90% 130% at 30% 28%, ' + highlight + ' 0%, ' + shadow + ' 100%)';
        } else {
          bg.style.backgroundImage = 'none';
          bg.style.backgroundColor = data.bgColor || '#000000';
        }
      }

      function setTypography(data, target) {
        target.style.fontFamily = data.fontFamily || "'Segoe UI',sans-serif";
        target.style.fontWeight = String(data.fontWeight || '700');
        target.style.lineHeight = String(data.mode === 'full' ? (data.lineHeightFull || 1.1) : (data.lineHeightLT || 1.1));
        target.style.color = data.textColor || '#ffffff';
      }

      function setModeAndLayout(data) {
        const mode = String(data.mode || 'full');
        const isFull = mode === 'full';
        stage.classList.toggle('mode-full', isFull);
        stage.classList.toggle('mode-lt', !isFull);
        fullText.style.display = isFull ? 'block' : 'none';
        ltWrap.style.display = isFull ? 'none' : 'flex';

        if (isFull) {
          const hAlign = safeAlign(data.hAlignFull, 'center');
          const vAlign = safeVAlign(data.vAlignFull, 'middle');
          stage.style.justifyContent = (hAlign === 'left') ? 'flex-start' : (hAlign === 'right') ? 'flex-end' : 'center';
          stage.style.alignItems = mapVAlign(vAlign);
          fullText.style.textAlign = (hAlign === 'justify') ? 'left' : hAlign;
          // Same side padding as the display page (a percentage of the width)
          fullText.style.boxSizing = 'border-box';
          fullText.style.width = '100%';
          fullText.style.padding = '0 ' + Math.max(0, Number(data.padLRFull != null ? data.padLRFull : (data.padLR != null ? data.padLR : 5))) + '%';
          fullText.style.fontSize = String(Math.max(10, Number(data.fontSizeFull || 40))) + 'pt';
          fullText.style.textTransform = String(data.fullTextTransform || 'none');
          setTypography(data, fullText);
        } else {
          const isBible = !!data.isBible;
          const hAlign = isBible ? safeAlign(data.hAlignLTBible || data.hAlignLT, 'center') : safeAlign(data.hAlignLT, 'center');
          const vAlign = isBible ? safeVAlign(data.vAlignLTBible || data.vAlignLT, 'middle') : safeVAlign(data.vAlignLT, 'middle');
          const ltHeightPct = Math.max(10, Math.min(92, Number(data.ltBgHeightPct || 24)));
          ltWrap.style.height = ltHeightPct + 'vh';
          ltWrap.style.alignItems = mapVAlign(vAlign);
          ltWrap.style.justifyContent = (hAlign === 'left') ? 'flex-start' : (hAlign === 'right') ? 'flex-end' : 'center';
          ltText.style.textAlign = (hAlign === 'justify') ? 'left' : hAlign;
          ltText.style.fontSize = String(Math.max(10, Number(data.fontSizeLT || 42))) + 'pt';
          ltText.style.textTransform = String(data.ltTextTransform || 'none');
          setTypography(data, ltText);
        }
      }

      function applyUpdate(data) {
        if (!data || typeof data !== 'object') return;
        const sourceData = data;
        if (!data.lowerThirdOnly) {
          const outputMode = IS_PREVIEW ? null : 'full';
          if (outputMode) data = { ...data, mode: outputMode };
        }
        if (data.seq && data.seq <= lastSeq) return;
        if (data.seq) lastSeq = data.seq;
        if (data.restorePrevious) {
          lowerThirdOnlyMode = false;
          document.body.classList.remove('lower-third-only-mode', 'display-full-mode');
          if (lastNormalUpdate) {
            applyUpdate({
              ...lastNormalUpdate,
              seq: 0,
              nameRoleOverlay: {
                ...(lastNormalUpdate.nameRoleOverlay || {}),
                ...(data.nameRoleOverlay || {}),
                enabled: false
              },
              socialEngagementOverlay: {
                ...(lastNormalUpdate.socialEngagementOverlay || {}),
                ...(data.socialEngagementOverlay || {}),
                enabled: false
              }
            });
          }
          else {
            updateNameRoleOverlay(null);
            updateSocialEngagementOverlay(null);
            fullText.innerHTML = '';
            ltText.innerHTML = '';
            setBackground({ bgEnabled: false });
            document.body.classList.remove('lyrics-lt-mode', 'display-full-mode', 'display-custom-mode');
          }
          return;
        }
        if (data.lowerThirdOnly) {
          const entering = !lowerThirdOnlyMode;
          lowerThirdOnlyMode = true;
          document.body.classList.add('lower-third-only-mode');
          document.body.classList.remove('lyrics-lt-mode', 'display-full-mode', 'display-custom-mode');
          if (entering) {
            fullText.innerHTML = '';
            ltText.innerHTML = '';
            setBackground({ bgEnabled: false });
          }
          updateNameRoleOverlay(data.nameRoleOverlay);
          updateSocialEngagementOverlay(data.socialEngagementOverlay);
          return;
        }
        if (lowerThirdOnlyMode) {
          lastNormalUpdate = sourceData;
          return;
        }
        lastNormalUpdate = sourceData;
        document.body.classList.remove('lower-third-only-mode');
        const displayMode = String(data.mode || 'full');
        document.body.classList.toggle('display-full-mode', displayMode === 'full');
        document.body.classList.toggle('display-custom-mode', displayMode === 'custom');
        document.body.classList.toggle('lyrics-lt-mode', displayMode === 'lt');
        updateNameRoleOverlay(data.nameRoleOverlay);
        updateSocialEngagementOverlay(data.socialEngagementOverlay);
        setBackground(data);
        setModeAndLayout(data);
        if (String(data.mode || 'full') === 'full') {
          fullText.innerHTML = data.text || '';
        } else {
          ltText.innerHTML = data.text || '';
        }
      }

      function updateNameRoleOverlay(data) {
        const overlay = document.getElementById('name-role-overlay');
        if (!overlay) return;
        if (!data) {
          overlay.setAttribute('aria-hidden', 'true');
          overlay.classList.remove('is-visible');
          return;
        }
        const name = String(data && data.name || '').trim();
        const role = String(data && data.role || '').trim();
        const rawStyle = String(data && data.style || 'classic-rise');
        const legacyStyle = rawStyle.match(/^(classic|right|centered|band)-(rise|slide|sweep|zoom|shutter|spring|glide|blur|flip|wipe|float|glow|reveal|drop|curtain|pop|expand|bounce|elastic|iris|slice|swing|turn|cascade|typewriter|glitch|flicker)$/);
        const normalizedStyle = legacyStyle ? legacyStyle[1] + '-gms-' + legacyStyle[2] : rawStyle;
        const styleMatch = normalizedStyle.match(/^(classic|right|centered|band)-(gms|noir|broadcast|modern|news|spotlight|legacy|clean|glass|copper|editorial|neon|ribbon|aurora|sunrise|royal|minimal|pill|holo|frost|cinema|sharp|emerald|pulse|parchment|sapphire|crimson|forest|graphite|rose|ocean|amber|violet|outline|halo|chapel|duobar|duoblock|duorule|duoghost|duotag|duoslant|duoflag|duopill|custom)-(rise|slide|sweep|zoom|shutter|spring|glide|blur|flip|wipe|float|glow|reveal|drop|curtain|pop|expand|bounce|elastic|iris|slice|swing|turn|cascade|typewriter|glitch|flicker)$/);
        const layout = styleMatch ? styleMatch[1] : 'classic';
        const theme = styleMatch ? styleMatch[2] : 'gms';
        const animation = styleMatch ? styleMatch[3] : 'rise';
        const style = layout + '-' + theme + '-' + animation;
        const accentColor = /^#[0-9a-f]{6}$/i.test(data && data.accentColor || '') ? data.accentColor : '#90D5FF';
        const primaryDefaults = { legacy: '#90D5FF', gms: '#90D5FF', noir: '#90D5FF', broadcast: '#90D5FF', modern: '#90D5FF', news: '#90D5FF', spotlight: '#90D5FF', clean: '#90D5FF', glass: '#90D5FF', copper: '#90D5FF', editorial: '#90D5FF', neon: '#90D5FF', ribbon: '#90D5FF', aurora: '#90D5FF', sunrise: '#90D5FF', royal: '#90D5FF', minimal: '#90D5FF', pill: '#90D5FF', holo: '#90D5FF', frost: '#90D5FF', cinema: '#90D5FF', sharp: '#90D5FF', emerald: '#90D5FF', pulse: '#90D5FF', parchment: '#90D5FF', sapphire: '#90D5FF', crimson: '#90D5FF', forest: '#90D5FF', graphite: '#90D5FF', rose: '#90D5FF', ocean: '#90D5FF', amber: '#90D5FF', violet: '#90D5FF', outline: '#90D5FF', halo: '#90D5FF', chapel: '#90D5FF' };
        const primaryColor = /^#[0-9a-f]{6}$/i.test(data && data.primaryColor || '') ? data.primaryColor : (primaryDefaults[theme] || '#90D5FF');
        const primaryRgb = primaryColor.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
        const primaryLuminance = 0.2126 * primaryRgb[0] + 0.7152 * primaryRgb[1] + 0.0722 * primaryRgb[2];
        const lightBackground = primaryLuminance >= 0.72;
        const foregroundColor = lightBackground ? '#101216' : '#ffffff';
        const logo = typeof (data && data.logo) === 'string' && data.logo.startsWith('data:image/') ? data.logo : '';
        const logoColor = data && data.logoColor === 'black' ? 'black' : (data && data.logoColor === 'off' ? 'off' : 'white');
        const nameSize = Math.max(24, Math.min(160, Number(data && data.nameSize) || 56));
        const roleSize = Math.max(12, Math.min(72, Number(data && data.roleSize) || 24));
        const logoSize = Math.max(24, Math.min(320, Number(data && data.logoSize) || 128));
        const accRgb = accentColor.slice(1).match(/.{2}/g).map((p) => parseInt(p, 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        const accentForeground = (0.2126 * accRgb[0] + 0.7152 * accRgb[1] + 0.0722 * accRgb[2]) >= 0.4 ? '#0b0d10' : '#ffffff';
        const padL = Math.max(0, Math.min(400, Number(data && data.padL)||0)), padR = Math.max(0, Math.min(400, Number(data && data.padR)||0));
        const offsetX = Math.max(-40, Math.min(40, Number(data.offsetX) || 0));
        const offsetY = Math.max(-40, Math.min(40, Number(data.offsetY) || 0));
        const enabled = !!(data && data.enabled) && !!name;
        const nameEl = overlay.querySelector('.name-role-overlay-name');
        const roleEl = overlay.querySelector('.name-role-overlay-role');
        const logoEl = overlay.querySelector('.name-role-overlay-logo');
        const changed = overlay.dataset.name !== name || overlay.dataset.role !== role ||
          overlay.dataset.style !== style || overlay.dataset.accentColor !== accentColor || overlay.dataset.logo !== logo || overlay.dataset.logoColor !== logoColor;
        if (nameEl) { nameEl.textContent = name; nameEl.dataset.text = name; }
        if (roleEl) roleEl.textContent = role;
        if (logoEl) {
          if (logo) logoEl.src = logo;
          else logoEl.removeAttribute('src');
          logoEl.hidden = !logo;
        }
        overlay.classList.remove('style-classic', 'style-right', 'style-centered', 'style-band', 'theme-gms', 'theme-noir', 'theme-broadcast', 'theme-modern', 'theme-news', 'theme-spotlight', 'theme-legacy', 'theme-clean', 'theme-glass', 'theme-copper', 'theme-editorial', 'theme-neon', 'theme-ribbon', 'theme-aurora', 'theme-sunrise', 'theme-royal', 'theme-minimal', 'theme-pill', 'theme-holo', 'theme-frost', 'theme-cinema', 'theme-sharp', 'theme-emerald', 'theme-pulse', 'theme-parchment', 'theme-sapphire', 'theme-crimson', 'theme-forest', 'theme-graphite', 'theme-rose', 'theme-ocean', 'theme-amber', 'theme-violet', 'theme-outline', 'theme-halo', 'theme-chapel', 'theme-duobar', 'theme-duoblock', 'theme-duorule', 'theme-duoghost', 'theme-duotag', 'theme-duoslant', 'theme-duoflag', 'theme-duopill', 'theme-custom', 'motion-rise', 'motion-slide', 'motion-sweep', 'motion-zoom', 'motion-shutter', 'motion-spring', 'motion-glide', 'motion-blur', 'motion-flip', 'motion-wipe', 'motion-float', 'motion-glow', 'motion-reveal', 'motion-drop', 'motion-curtain', 'motion-pop', 'motion-expand', 'motion-bounce', 'motion-elastic', 'motion-iris', 'motion-slice', 'motion-swing', 'motion-turn', 'motion-cascade', 'motion-typewriter', 'motion-glitch', 'motion-flicker');
        overlay.classList.add('style-' + layout, 'theme-' + theme, 'motion-' + animation);
        overlay.classList.toggle('logo-black', logoColor === 'black');
        overlay.classList.toggle('logo-off', logoColor === 'off');
        overlay.classList.toggle('is-light-background', lightBackground);
        overlay.style.setProperty('--name-role-primary', primaryColor);
        overlay.style.setProperty('--name-role-accent', accentColor);
        overlay.style.setProperty('--name-role-foreground', foregroundColor);
        overlay.style.setProperty('--name-role-name-size', nameSize + 'px');
        overlay.style.setProperty('--name-role-role-size', roleSize + 'px');
        overlay.style.setProperty('--name-role-logo-size', logoSize + 'px');
        overlay.style.setProperty('--name-role-accent-fg', accentForeground);
        // A custom design arrives as ready-made style variables; any other design clears them
        for (let i = overlay.style.length - 1; i >= 0; i--) { const n = overlay.style[i]; if (n.startsWith('--cd-')) overlay.style.removeProperty(n); }
        if (theme === 'custom' && data && data.customVars) Object.keys(data.customVars).forEach((n) => overlay.style.setProperty(n, data.customVars[n]));
        overlay.style.setProperty('--name-role-pad-l', padL + 'px');
        overlay.style.setProperty('--name-role-pad-r', padR + 'px');
        overlay.classList.toggle('has-pad', padL > 0 || padR > 0);
        overlay.style.setProperty('--name-role-scale', String(Math.max(0.5, Math.min(2, (Number(data && data.scale) || 100) / 100))));
        overlay.style.setProperty('--name-role-offset-x', offsetX + 'vw');
        overlay.style.setProperty('--name-role-offset-y', offsetY + 'vh');
        overlay.dataset.name = name;
        overlay.dataset.role = role;
        overlay.dataset.style = style;
        overlay.dataset.theme = theme;
        overlay.dataset.accentColor = accentColor;
        overlay.dataset.logo = logo;
        overlay.dataset.logoColor = logoColor;
        overlay.setAttribute('aria-hidden', enabled ? 'false' : 'true');
        if (enabled && changed && overlay.classList.contains('is-visible')) {
          overlay.classList.remove('is-visible');
          void overlay.offsetWidth;
        }
        // Coming on: settle the card in the chosen animation's hidden pose first
        if (enabled && !overlay.classList.contains('is-visible')) {
          overlay.classList.add('is-resetting');
          void overlay.offsetWidth;
          overlay.classList.remove('is-resetting');
        }
        overlay.classList.toggle('is-visible', enabled);
      }

      function updateSocialEngagementOverlay(data) {
        if (window.SP_SOCIAL) window.SP_SOCIAL.update(document.getElementById('social-engagement-overlay'), data);
      }

      function clearOutput() {
        lowerThirdOnlyMode = false;
        lastNormalUpdate = null;
        document.body.classList.remove('lower-third-only-mode', 'lyrics-lt-mode', 'display-full-mode', 'display-custom-mode');
        fullText.innerHTML = '';
        ltText.innerHTML = '';
        setBackground({ bgEnabled: false });
        updateNameRoleOverlay(null);
        updateSocialEngagementOverlay(null);
      }

      if (channel) {
        channel.onmessage = function (event) {
          const data = event.data || {};
          const type = data.type;
          if (type === 'PING') {
            respondPong();
            return;
          }
          if (type === 'HELLO') {
            sendHello();
            return;
          }
          if (type === 'SYNC_STATE') {
            if (data.state && data.state.kind === 'update' && data.state.payload) applyUpdate(data.state.payload);
            if (data.state && data.state.kind === 'clear') {
              clearOutput();
            }
            return;
          }
          if (type === 'UPDATE') {
            applyUpdate(data);
            return;
          }
          if (type === 'CLEAR') {
            clearOutput();
          }
        };
      }

      window.addEventListener('message', function (event) {
        const data = event.data || {};
        if (data && data.type === 'REQUEST_FULLSCREEN') {
          document.documentElement.requestFullscreen().catch(function () {});
          return;
        }
        if (data && data.type === 'PREVIEW_UPDATE' && data.payload) {
          applyUpdate(data.payload);
          return;
        }
        if (data && data.type === 'PREVIEW_CLEAR') {
          clearOutput();
          return;
        }
      });

      window.addEventListener('beforeunload', function () {
        if (channel) {
          try { channel.close(); } catch (e) {}
        }
      });

      try {
        if (!IS_PREVIEW && window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'STANDALONE_READY' }, '*');
        }
      } catch (e) {}

      if (!IS_PREVIEW) {
        sendHello();
        setInterval(sendHello, 2000);
      }
    })();
  <\/script>
</body>
</html>`;
    }

    function getOutputBoundsFromSelection() {
      const select = document.getElementById('output-screen-select');
      const selected = String(select?.value || 'auto');
      const usable = Array.isArray(outputScreenList) ? outputScreenList : [];
      if (!usable.length) {
        return {
          left: window.screenX || 0,
          top: window.screenY || 0,
          width: window.screen.availWidth || window.screen.width || 1280,
          height: window.screen.availHeight || window.screen.height || 720
        };
      }
      if (selected && selected !== 'auto') {
        const matched = usable.find(s => s.id === selected);
        if (matched) return matched;
      }
      const preferred = usable.find(s => !s.isInternal && !s.isPrimary) ||
        usable.find(s => !s.isPrimary) ||
        usable.find(s => s.isPrimary) ||
        usable[0];
      return preferred;
    }

    function hasDesktopOutputBridge() {
      return !!(window.BSPDesktop && typeof window.BSPDesktop.openOutput === 'function');
    }

    function getStandaloneOutputSource() {
      return 'lyrics';
    }

    function getPreferredExternalScreen() {
      const usable = Array.isArray(outputScreenList) ? outputScreenList : [];
      return usable.find(s => !s.isInternal && !s.isPrimary) ||
        usable.find(s => !s.isInternal) ||
        null;
    }

    function setOutputLiveState(active) {
      outputLiveActive = !!active;
      const goBtns = document.querySelectorAll('#btn-output-go-live, #btn-output-go-live-panel');
      const endBtn = document.getElementById('btn-output-end-live');
      goBtns.forEach((btn) => btn.classList.toggle('live-active', outputLiveActive));
      if (endBtn) endBtn.classList.toggle('show', outputLiveActive);
      syncLyricsOutputTypeButtons();
      layoutProgramScaleControls();
      if (outputLiveWatcher) {
        clearInterval(outputLiveWatcher);
        outputLiveWatcher = null;
      }
      if (outputLiveActive) {
        outputLiveWatcher = setInterval(() => {
          if (hasDesktopOutputBridge()) {
            window.BSPDesktop.isOutputOpen().then((isOpen) => {
              if (!isOpen) setOutputLiveState(false);
            }).catch(() => {});
            return;
          }
          if (!standaloneDisplayWindow || standaloneDisplayWindow.closed) {
            setOutputLiveState(false);
          }
        }, 3000);
      }
    }

    function syncLyricsOutputTypeButtons() {
      const monitorBtn = document.getElementById('lyrics-output-monitor-btn');
      if (standaloneDisplayWindow && standaloneDisplayWindow.closed) lyricsMonitorOutputOpen = false;
      const monitorActive = lyricsMonitorOutputOpen || outputLiveActive;
      if (monitorBtn) {
        monitorBtn.classList.toggle('active', monitorActive);
        monitorBtn.setAttribute('aria-pressed', monitorActive ? 'true' : 'false');
      }
    }

    async function toggleLyricsMonitorOutput() {
      if (lyricsMonitorOutputOpen || outputLiveActive) {
        endOutputLive();
        return;
      }
      await openStandaloneOutputFromUi();
    }

    function getWindowFeaturesForOutput(bounds) {
      const parsedLeft = Number(bounds.left);
      const parsedTop = Number(bounds.top);
      const left = Number.isFinite(parsedLeft) ? Math.round(parsedLeft) : Math.round(Number(window.screenX || 0));
      const top = Number.isFinite(parsedTop) ? Math.round(parsedTop) : Math.round(Number(window.screenY || 0));
      const width = Math.max(640, Math.round(Number(bounds.width || 1280)));
      const height = Math.max(360, Math.round(Number(bounds.height || 720)));
      return `popup=yes,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no,left=${left},top=${top},width=${width},height=${height}`;
    }

    function tryMoveStandaloneOutputWindow(bounds) {
      if (!standaloneDisplayWindow || standaloneDisplayWindow.closed) return;
      const left = Math.round(Number(bounds.left || 0));
      const top = Math.round(Number(bounds.top || 0));
      const width = Math.max(640, Math.round(Number(bounds.width || 1280)));
      const height = Math.max(360, Math.round(Number(bounds.height || 720)));
      try { standaloneDisplayWindow.moveTo(left, top); } catch (e) {}
      try { standaloneDisplayWindow.resizeTo(width, height); } catch (e) {}
    }

    async function refreshOutputScreenList(opts = {}) {
      const select = document.getElementById('output-screen-select');
      const meta = document.getElementById('output-screen-meta');
      const prevValue = select?.value || 'auto';
      outputScreenList = [];
      if (hasDesktopOutputBridge()) {
        try {
          const screens = await window.BSPDesktop.getDisplays();
          outputScreenList = Array.isArray(screens) ? screens.map((screen, idx) => ({
            id: String(screen.id || `screen_${idx}`),
            label: screen.label || ((screen.isPrimary ? 'Primary Display' : `Display ${idx + 1}`)),
            left: Number(screen.left || 0),
            top: Number(screen.top || 0),
            width: Number(screen.width || 1280),
            height: Number(screen.height || 720),
            isPrimary: !!screen.isPrimary,
            isInternal: !!screen.isInternal
          })) : [];
          if (meta) {
            const externals = outputScreenList.filter(s => !s.isInternal).length;
            meta.textContent = `${outputScreenList.length} display(s) detected, ${externals} external`;
          }
        } catch (err) {
          if (meta) {
            meta.textContent = `Desktop display detection failed: ${err && err.message ? err.message : 'unknown error'}.`;
          }
        }
        if (!outputScreenList.length) {
          outputScreenList = [{
            id: 'current',
            label: 'Current Screen',
            left: Number(window.screenX || 0),
            top: Number(window.screenY || 0),
            width: Number(window.screen.availWidth || window.screen.width || 1280),
            height: Number(window.screen.availHeight || window.screen.height || 720),
            isPrimary: true,
            isInternal: true
          }];
        }
        if (select) {
          const options = ['<option value="auto">Auto (prefer external display)</option>'];
          outputScreenList.forEach((screen, idx) => {
            const kind = screen.isInternal ? 'Internal' : 'External';
            const primary = screen.isPrimary ? ' (Primary)' : '';
            options.push(`<option value="${screen.id}">${screen.label || ('Display ' + (idx + 1))} - ${kind}${primary} (${screen.width}x${screen.height})</option>`);
          });
          select.innerHTML = options.join('');
          select.value = outputScreenList.some(s => s.id === prevValue) ? prevValue : 'auto';
        }
        renderStreamFeedScreens();
        if (outputPopoverOpen) {
          renderOutputScreenPopover();
        }
        return;
      }
      try {
        if (typeof window.getScreenDetails === 'function') {
          outputScreenDetails = await window.getScreenDetails();
          if (outputScreenDetails && !outputScreenDetailsBound) {
            outputScreenDetailsBound = true;
            const update = () => refreshOutputScreenList();
            outputScreenDetails.addEventListener('screenschange', update);
            outputScreenDetails.addEventListener('currentscreenchange', update);
          }
          const screens = Array.isArray(outputScreenDetails.screens) ? outputScreenDetails.screens : [];
          outputScreenList = screens.map((screen, idx) => ({
            id: `screen_${idx}`,
            label: screen.label || ((screen.isPrimary ? 'Primary Display' : `Display ${idx + 1}`)),
            left: Number(screen.left || 0),
            top: Number(screen.top || 0),
            width: Number(screen.availWidth || screen.width || 1280),
            height: Number(screen.availHeight || screen.height || 720),
            isPrimary: !!screen.isPrimary,
            isInternal: !!screen.isInternal
          }));
          if (meta) {
            const externals = outputScreenList.filter(s => !s.isInternal).length;
            meta.textContent = `${outputScreenList.length} display(s) detected, ${externals} external`;
          }
        } else {
          outputScreenList = [{
            id: 'current',
            label: 'Current Screen',
            left: Number(window.screenX || 0),
            top: Number(window.screenY || 0),
            width: Number(window.screen.availWidth || window.screen.width || 1280),
            height: Number(window.screen.availHeight || window.screen.height || 720),
            isPrimary: true,
            isInternal: true
          }];
          if (meta) {
            meta.textContent = 'Advanced multi-screen detection not supported in this browser. Using current screen.';
          }
        }
      } catch (err) {
        if (meta) {
          meta.textContent = `Display detection blocked: ${err && err.message ? err.message : 'permission denied'}.`;
        }
        outputScreenList = [{
          id: 'current',
          label: 'Current Screen',
          left: Number(window.screenX || 0),
          top: Number(window.screenY || 0),
          width: Number(window.screen.availWidth || window.screen.width || 1280),
          height: Number(window.screen.availHeight || window.screen.height || 720),
          isPrimary: true,
          isInternal: true
        }];
      }

      if (select) {
        const options = ['<option value="auto">Auto (prefer external display)</option>'];
        outputScreenList.forEach((screen, idx) => {
          const kind = screen.isInternal ? 'Internal' : 'External';
          const primary = screen.isPrimary ? ' (Primary)' : '';
          options.push(`<option value="${screen.id}">${screen.label || ('Display ' + (idx + 1))} - ${kind}${primary} (${screen.width}x${screen.height})</option>`);
        });
        select.innerHTML = options.join('');
        select.value = options.some(opt => opt.includes(`value="${prevValue}"`)) ? prevValue : 'auto';
      }
      if (opts.forcePrompt && typeof window.getScreenDetails !== 'function') {
        showToast(t('output_browser_no_screen_details'));
      }
      if (outputPopoverOpen) {
        renderOutputScreenPopover();
      }
    }

    async function openStandaloneOutputWindow(opts = {}) {
      if (hasDesktopOutputBridge()) {
        const select = document.getElementById('output-screen-select');
        const selectedId = String(select?.value || 'auto');
        const source = getStandaloneOutputSource();
        const shouldFullscreen = !!opts.requestFullscreen || outputLiveActive;
        const result = await window.BSPDesktop.openOutput({
          displayId: selectedId,
          source,
          requestFullscreen: shouldFullscreen,
          reposition: !!opts.moveAfterOpen,
          activate: !!opts.requestFullscreen
        }).catch(() => null);
        if (!result || !result.ok) {
          showToast(t('output_open_failed'));
          return false;
        }
        lyricsMonitorOutputOpen = true;
        syncLyricsOutputTypeButtons();
        sendSyncState();
        queueStandaloneSyncBurst();
        return true;
      }
      const standaloneUrl = getStandaloneOutputUrl();
      const bounds = getOutputBoundsFromSelection();
      const features = getWindowFeaturesForOutput(bounds);
      standaloneDisplayWindow = window.open(standaloneUrl, 'bsp_standalone_output', features);
      if (!standaloneDisplayWindow) {
        showToast(t('output_popup_blocked'));
        return false;
      }
      lyricsMonitorOutputOpen = true;
      syncLyricsOutputTypeButtons();
      try { standaloneDisplayWindow.focus(); } catch (e) {}
      if (opts.moveAfterOpen !== false) {
        tryMoveStandaloneOutputWindow(bounds);
        setTimeout(() => tryMoveStandaloneOutputWindow(bounds), 120);
        setTimeout(() => tryMoveStandaloneOutputWindow(bounds), 350);
      }
      if (opts.requestFullscreen) {
        requestStandaloneOutputFullscreen();
      }
      sendSyncState();
      queueStandaloneSyncBurst();
      return true;
    }

    async function openStandaloneOutputFromUi() {
      await refreshOutputScreenList({ forcePrompt: true }).catch(() => {});
      const preferredExternal = getPreferredExternalScreen();
      const select = document.getElementById('output-screen-select');
      if (preferredExternal && select) {
        select.value = preferredExternal.id;
      }
      const opened = await openStandaloneOutputWindow({ requestFullscreen: true });
      if (!opened) return;
      if (isLive && livePointer) pushLiveUpdate();
      if (preferredExternal) {
        showToast(t('output_sent_to_display').replace('{display}', preferredExternal.label || 'external display'));
      } else {
        showToast(t('output_no_external_detected_opened_current'));
      }
    }

    async function startOutputLive() {
      const hasPreviewPayload = embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload;
      const hasCurrentSelection = !!currentItem && Number.isInteger(Number(currentIndex)) && Number(currentIndex) >= 0;
      if ((!isLive || !livePointer) && !hasPreviewPayload && hasCurrentSelection) {
        projectLive(true);
      }
      const hasLivePayload = (isLive && livePointer) ||
        (embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload);
      if (!hasLivePayload) {
        showToast('Select a verse or song before going live.');
        return;
      }
      if (!hasDesktopOutputBridge()) {
        // Browser fallback: open immediately in the click gesture so popup placement stays allowed.
        const preOpened = await openStandaloneOutputWindow({ moveAfterOpen: false });
        if (!preOpened) return;
      }
      await refreshOutputScreenList({ forcePrompt: true }).catch(() => {});
      const select = document.getElementById('output-screen-select');
      const preferredExternal = getPreferredExternalScreen();
      if (select && (!select.value || select.value === 'auto') && preferredExternal) {
        select.value = preferredExternal.id;
      }
      const opened = await openStandaloneOutputWindow({ moveAfterOpen: true, requestFullscreen: true });
      if (!opened) return;
      setOutputLiveState(true);
      if (isLive && livePointer) {
        pushLiveUpdate();
      } else if (embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload) {
        const viewport = getEmbeddedDisplayViewport();
        const base = {
          ...embeddedProgramDisplayState.payload,
          type: 'UPDATE',
          proto: 1,
          sender: 'control',
          ts: Date.now(),
          seq: nextSeq(),
          displayViewportWidth: viewport.width,
          displayViewportHeight: viewport.height
        };
        postMessageToStandaloneOutput(typeof forOutput === 'function' ? forOutput(base) : base, 'feed');
        postMessageToStandaloneOutput(typeof forMonitor === 'function' ? forMonitor(base) : base, 'output');
      } else {
        sendSyncState();
      }
      const chosenId = String(select?.value || '');
      const chosen = (Array.isArray(outputScreenList) ? outputScreenList : []).find(s => s.id === chosenId);
      showToast(chosen
        ? t('output_live_on_display').replace('{display}', chosen.label || 'selected display')
        : t('output_live_started'));
    }

    function endOutputLive() {
      if (hasDesktopOutputBridge()) {
        window.BSPDesktop.closeOutput().catch(() => {});
      }
      if (standaloneDisplayWindow && !standaloneDisplayWindow.closed) {
        try { standaloneDisplayWindow.close(); } catch (e) {}
      }
      standaloneDisplayWindow = null;
      lyricsMonitorOutputOpen = false;
      setOutputLiveState(false);
      showToast(t('output_live_ended'));
    }

    // Top bar Outputs button: bring the Outputs card into view.
    // Zoom for the Preview and Program monitors. Out makes them smaller; in widens the monitor column.
    // With no choice made the size follows the window height, so a small display gets smaller monitors.
    const MONITOR_ZOOM_KEY = 'scripturePod.monitorZoom.v1';
    let monitorZoomChoice = null;
    try { const v = parseInt(localStorage.getItem(MONITOR_ZOOM_KEY), 10); if (v >= 50 && v <= 150) monitorZoomChoice = v; } catch (e) { /* storage unavailable */ }
    function autoMonitorZoom() {
      const h = window.innerHeight;
      return h < 640 ? 60 : h < 720 ? 70 : h < 820 ? 80 : h < 920 ? 90 : 100;
    }
    function applyMonitorZoom() {
      const z = monitorZoomChoice == null ? autoMonitorZoom() : monitorZoomChoice;
      const root = document.documentElement;
      root.style.setProperty('--monitor-zoom', String(z / 100));
      root.style.setProperty('--monitor-rail-w', Math.round(400 * Math.max(1, z / 100)) + 'px');
      document.body.classList.toggle('monitor-zoom-wide', z > 100);
      const label = document.getElementById('monitor-zoom-value');
      if (label) label.textContent = z + '%' + (monitorZoomChoice == null ? ' auto' : '');
      document.getElementById('monitor-zoom-out')?.toggleAttribute('disabled', z <= 50);
      document.getElementById('monitor-zoom-in')?.toggleAttribute('disabled', z >= 150);
    }
    function setMonitorZoom(value) {
      monitorZoomChoice = value == null ? null : Math.max(50, Math.min(150, Math.round(value)));
      try {
        if (monitorZoomChoice == null) localStorage.removeItem(MONITOR_ZOOM_KEY);
        else localStorage.setItem(MONITOR_ZOOM_KEY, String(monitorZoomChoice));
      } catch (e) { /* storage unavailable */ }
      applyMonitorZoom();
    }
    function stepMonitorZoom(delta) {
      const current = monitorZoomChoice == null ? autoMonitorZoom() : monitorZoomChoice;
      setMonitorZoom(current + delta);
    }
    window.addEventListener('resize', () => { if (monitorZoomChoice == null) applyMonitorZoom(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyMonitorZoom); else applyMonitorZoom();

    // Outputs are global, so the card lives in a popover opened by clicking the top bar Outputs button
    function outputsCardEl() {
      const card = document.getElementById('outputs-card');
      if (card && card.parentElement !== document.body) document.body.appendChild(card);
      return card;
    }
    function setOutputsPopover(open) {
      const card = outputsCardEl();
      const btn = document.getElementById('btn-topbar-outputs');
      if (!card) return;
      if (open && btn) {
        const r = btn.getBoundingClientRect();
        card.style.top = Math.round(r.bottom + 8) + 'px';
        card.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
      }
      card.classList.toggle('is-open', !!open);
      btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn?.classList.toggle('is-active', !!open);
    }
    function showOutputsCard() {
      const card = outputsCardEl();
      if (!card) return;
      setOutputsPopover(!card.classList.contains('is-open'));
    }
    (function initOutputsPopover() {
      const setup = () => {
        outputsCardEl();
        document.getElementById('btn-topbar-outputs')?.setAttribute('aria-haspopup', 'true');
        document.addEventListener('mousedown', (e) => {
          const c = document.getElementById('outputs-card');
          if (!c || !c.classList.contains('is-open')) return;
          if (c.contains(e.target) || e.target.closest?.('#btn-topbar-outputs')) return;
          setOutputsPopover(false);
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') setOutputsPopover(false);
        });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
    })();

    // ── Stream feed (cable) ────────────────────────────────────────────────
    // A second output window on its own display, meant for an HDMI cable into
    // the streaming computer's capture card. Transparent areas are filled with
    // a key colour because a cable cannot carry transparency.
    const STREAM_FEED_STORAGE_KEY = 'scripturePod.streamFeed.v1';
    const STREAM_FEED_OBS_HINTS = {
      none: 'Empty areas stay transparent, as on the main output. A cable cannot carry transparency, so choose Black or Green if OBS needs to key it out.',
      black: 'In OBS, add the capture card as a Video Capture Device, then a Luma Key filter.',
      green: 'In OBS, add the capture card as a Video Capture Device, then a Chroma Key filter (green).'
    };
    let streamFeedOpen = false;
    let streamFeedSettings = { displayId: '', key: 'none' };

    function loadStreamFeedSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem(STREAM_FEED_STORAGE_KEY) || '{}');
        streamFeedSettings = {
          displayId: typeof saved.displayId === 'string' ? saved.displayId : '',
          key: ['black', 'green'].includes(saved.key) ? saved.key : 'none'
        };
      } catch (_) {}
    }

    function saveStreamFeedSettings() {
      try { localStorage.setItem(STREAM_FEED_STORAGE_KEY, JSON.stringify(streamFeedSettings)); } catch (_) {}
    }

    // Default to an external screen other than the one the main output uses.
    function getDefaultStreamFeedScreen() {
      const screens = Array.isArray(outputScreenList) ? outputScreenList : [];
      const mainChoice = String(document.getElementById('output-screen-select')?.value || 'auto');
      const mainId = mainChoice === 'auto' ? (getPreferredExternalScreen()?.id || '') : mainChoice;
      const externals = screens.filter(s => !s.isInternal);
      return externals.find(s => s.id !== mainId) || externals[0] || screens[0] || null;
    }

    function renderStreamFeedScreens() {
      const select = document.getElementById('stream-feed-display');
      if (!select) return;
      const screens = Array.isArray(outputScreenList) ? outputScreenList : [];
      select.replaceChildren(...screens.map((screen, idx) => {
        const option = document.createElement('option');
        option.value = screen.id;
        const kind = screen.isInternal ? 'Built-in' : 'External';
        option.textContent = `${screen.label || ('Display ' + (idx + 1))} · ${kind} · ${screen.width}×${screen.height}`;
        return option;
      }));
      const saved = screens.find(s => s.id === streamFeedSettings.displayId);
      const chosen = saved || getDefaultStreamFeedScreen();
      if (chosen) select.value = chosen.id;
    }

    function syncStreamFeedUi() {
      const available = hasDesktopOutputBridge() && typeof window.BSPDesktop.openFeed === 'function';
      const button = document.getElementById('btn-stream-feed');
      const state = document.getElementById('stream-feed-state');
      const hint = document.getElementById('stream-feed-obs-hint');
      const select = document.getElementById('stream-feed-display');
      document.getElementById('output-route-feed')?.classList.toggle('is-unavailable', !available);
      if (button) {
        button.disabled = !available;
        button.textContent = streamFeedOpen ? 'Stop feed' : 'Start feed';
        button.setAttribute('aria-pressed', streamFeedOpen ? 'true' : 'false');
        button.classList.toggle('active', streamFeedOpen);
      }
      if (select) select.disabled = !available;
      if (state) {
        state.textContent = streamFeedOpen ? 'On' : 'Off';
        state.classList.toggle('is-on', streamFeedOpen);
      }
      ['none', 'black', 'green'].forEach((key) => {
        const keyBtn = document.getElementById(`stream-feed-key-${key}`);
        if (!keyBtn) return;
        const active = streamFeedSettings.key === key;
        keyBtn.classList.toggle('active', active);
        keyBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (hint) {
        hint.textContent = available
          ? STREAM_FEED_OBS_HINTS[streamFeedSettings.key]
          : 'The stream feed needs the desktop app.';
      }
    }

    async function openStreamFeed() {
      const select = document.getElementById('stream-feed-display');
      const displayId = String(select?.value || streamFeedSettings.displayId || '');
      const result = await window.BSPDesktop.openFeed({
        displayId,
        keyBackground: streamFeedSettings.key
      }).catch(() => null);
      if (!result || !result.ok) {
        showToast('Could not open the stream feed');
        return false;
      }
      streamFeedOpen = true;
      syncStreamFeedUi();
      sendSyncState();
      queueStandaloneSyncBurst();
      return true;
    }

    async function toggleStreamFeed() {
      if (!hasDesktopOutputBridge() || typeof window.BSPDesktop.openFeed !== 'function') return;
      if (streamFeedOpen) {
        await window.BSPDesktop.closeFeed().catch(() => {});
        streamFeedOpen = false;
        syncStreamFeedUi();
        showToast('Stream feed stopped');
        return;
      }
      const select = document.getElementById('stream-feed-display');
      const chosen = (Array.isArray(outputScreenList) ? outputScreenList : []).find(s => s.id === select?.value);
      if (await openStreamFeed()) {
        showToast(`Stream feed on ${chosen ? chosen.label : 'the selected screen'}`);
      }
    }

    // Changing screen or key colour while the feed runs reopens it in place.
    function handleStreamFeedDisplayChange() {
      const select = document.getElementById('stream-feed-display');
      streamFeedSettings.displayId = String(select?.value || '');
      saveStreamFeedSettings();
      if (streamFeedOpen) openStreamFeed();
    }

    function setStreamFeedKey(key) {
      streamFeedSettings.key = ['black', 'green'].includes(key) ? key : 'none';
      saveStreamFeedSettings();
      syncStreamFeedUi();
      if (streamFeedOpen) openStreamFeed();
    }

    function initStreamFeedControls() {
      loadStreamFeedSettings();
      renderStreamFeedScreens();
      syncStreamFeedUi();
      if (hasDesktopOutputBridge() && typeof window.BSPDesktop.onFeedClosed === 'function') {
        window.BSPDesktop.onFeedClosed(() => {
          streamFeedOpen = false;
          syncStreamFeedUi();
        });
        window.BSPDesktop.isFeedOpen().then((isOpen) => {
          streamFeedOpen = !!isOpen;
          syncStreamFeedUi();
        }).catch(() => {});
      }
    }


    function requestStandaloneOutputFullscreen() {
      if (hasDesktopOutputBridge()) {
        window.BSPDesktop.requestOutputFullscreen().catch(() => {});
        return;
      }
      if (!standaloneDisplayWindow || standaloneDisplayWindow.closed) {
        showToast(t('output_open_first'));
        return;
      }
      try {
        standaloneDisplayWindow.focus();
        standaloneDisplayWindow.postMessage({ type: 'REQUEST_FULLSCREEN' }, '*');
      } catch (e) {}
    }



    function stopCameraPreview() {
      const videoEl = document.getElementById('camera-preview');
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
        cameraPreviewStream = null;
      }
      if (videoEl) videoEl.srcObject = null;
      const btn = document.getElementById('camera-toggle-btn');
      if (btn) {
        btn.textContent = 'Start Camera Preview';
        btn.style.background = '#1f2937';
      }
    }


    function initStandaloneTools() {
      initEmbeddedProgramDisplay();
      syncLyricsOutputTypeButtons();
      initStreamFeedControls();
      refreshOutputScreenList().catch(() => {});
      if (hasDesktopOutputBridge() && typeof window.BSPDesktop.onOutputClosed === 'function') {
        window.BSPDesktop.onOutputClosed(() => {
          lyricsMonitorOutputOpen = false;
          setOutputLiveState(false);
        });
      }
      window.addEventListener('message', (event) => {
        const data = event?.data || {};
        if (data.type === 'STANDALONE_READY') {
          queueStandaloneSyncBurst();
        }
      });
      window.addEventListener('beforeunload', () => {
        stopCameraPreview();
        if (outputLiveWatcher) {
          clearInterval(outputLiveWatcher);
          outputLiveWatcher = null;
        }
        if (standaloneDisplayWindow && !standaloneDisplayWindow.closed) {
          try { standaloneDisplayWindow.close(); } catch (e) {}
        }
        if (standaloneDisplayBlobUrl) {
          URL.revokeObjectURL(standaloneDisplayBlobUrl);
          standaloneDisplayBlobUrl = null;
        }
      }, { once: true });
    }
