    function setProgramDisplayAspect(aspect) {
      const shell = document.getElementById('program-display-shell');
      if (!shell) return;
      const normalized = (aspect === '9:16') ? '9:16' : '16:9';
      shell.dataset.aspect = normalized;
      document.getElementById('program-aspect-16x9')?.classList.toggle('active', normalized === '16:9');
      document.getElementById('program-aspect-9x16')?.classList.toggle('active', normalized === '9:16');
      lsSyncProjectionLayoutFromProgramDisplay();
      requestAnimationFrame(() => {
        updateEmbeddedProgramDisplayScale();
        updateLsProjectionPreviewScale();
        syncEmbeddedProgramDisplay();
        syncStandaloneOutputDirect();
        syncLsProjectionPreview();
      });
      // Ensure projection preview iframe receives the refreshed payload after layout settles.
      setTimeout(() => syncLsProjectionPreview(), 120);
      setTimeout(() => syncLsProjectionPreview(), 320);
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
      updateLsProjectionPreviewScale();
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
      const compositor = document.getElementById('source-compositor');
      const overlay = document.getElementById('transform-overlay');
      if (!shell || !frame || !compositor || !overlay) return;
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
      [compositor, overlay, frame].forEach((el) => {
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

    function sendProgramPreview(payload) {
      if (!payload) return false;
      const viewport = getEmbeddedDisplayViewport();
      const previewPayload = {
        ...payload,
        seq: nextSeq(),
        sceneLayers: getOutputSceneLayers(),
        displayViewportWidth: viewport.width,
        displayViewportHeight: viewport.height
      };
      embeddedProgramDisplayState = { kind: 'update', payload: previewPayload };
      if (!embeddedProgramDisplayReady) {
        pendingProgramPreviewPayload = previewPayload;
        return true;
      }
      postMessageToEmbeddedProgramDisplay({
        type: 'SET_STREAM_OUTPUT_MODE',
        enabled: !!_pgmStreamState.running
      });
      pendingProgramPreviewPayload = null;
      return postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_UPDATE', payload: previewPayload });
    }

    function clearProgramPreview() {
      pendingProgramPreviewPayload = null;
      embeddedProgramDisplayState = { kind: 'clear' };
      if (!postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_CLEAR' })) {
        showToast('Preview display is not ready');
        return false;
      }
      showToast('Preview cleared');
      return true;
    }

    function postMessageToStandaloneOutput(message) {
      if (window.BSPDesktop && typeof window.BSPDesktop.sendOutputMessage === 'function') {
        window.BSPDesktop.sendOutputMessage(message).catch(() => {});
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
      const sceneLayers = getOutputSceneLayers();
      const seq = burstSeq || nextSeq();
      if (currentProgramDisplaySource === 'lyrics' && embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload) {
        // Full content sync — includes text, background, mode, AND scene layers
        postMessageToStandaloneOutput({
          type: 'PREVIEW_UPDATE',
          payload: {
            ...embeddedProgramDisplayState.payload,
            mode: 'full',
            seq,
            sceneLayers,
            displayViewportWidth: viewport.width,
            displayViewportHeight: viewport.height
          }
        });
      } else {
        // Scene-only sync — update layers without touching text/background/mode
        postMessageToStandaloneOutput({
          type: 'SCENE_LAYERS_UPDATE',
          sceneLayers
        });
      }
    }

    function queueStandaloneSyncBurst() {
      standaloneSyncTimers.forEach(tid => clearTimeout(tid));
      standaloneSyncTimers = [];
      const burstSeq = nextSeq();
      // During active streaming, use fewer burst retries to reduce rendering
      // load — the offscreen capture window needs steady GPU/CPU time.
      const isStreaming = (typeof _lsState !== 'undefined') && _lsState.streaming;
      const delays = isStreaming ? [0, 300, 800] : [0, 120, 320, 700, 1200];
      delays.forEach((delay) => {
        const tid = setTimeout(() => syncStandaloneOutputDirect(burstSeq), delay);
        standaloneSyncTimers.push(tid);
      });
    }

    let _pgmMediaClockSyncLastTs = 0;
    function _postSceneLayersToLsProjectionPreview(sceneLayers) {
      // No-op — preview is now driven by backend capturePage thumbnails.
      // Scene layers are rendered by the actual Program Display window,
      // so the captured frames already include them.
    }

    function _pgmSyncMediaClockToOutputs(force = false) {
      const { src, vid } = _pgmGetPrimaryMediaVideo();
      if (!force) {
        if (!src || !vid || src.visible === false) return;
        if (_pgmMediaCtrlState.stopped || vid.paused || vid.ended) return;
      }
      const now = Date.now();
      // During streaming, widen the throttle window to reduce cross‐window
      // postMessage traffic that competes with the offscreen capture pipeline.
      const minInterval = (_lsState && _lsState.streaming) ? 400 : 220;
      if (!force && (now - _pgmMediaClockSyncLastTs) < minInterval) return;
      _pgmMediaClockSyncLastTs = now;
      const sceneLayersRaw = getOutputSceneLayers();
      const sceneLayers = Array.isArray(sceneLayersRaw) ? sceneLayersRaw : [];
      postMessageToStandaloneOutput({ type: 'SCENE_LAYERS_UPDATE', sceneLayers });
      if (currentProgramDisplaySource === 'lyrics') {
        postMessageToEmbeddedProgramDisplay({ type: 'SCENE_LAYERS_UPDATE', sceneLayers });
      }
      _postSceneLayersToLsProjectionPreview(sceneLayers);
    }

    function syncEmbeddedProgramDisplay() {
      if (currentProgramDisplaySource !== 'lyrics') return;
      if (!embeddedProgramDisplayReady) return;
      postMessageToEmbeddedProgramDisplay({
        type: 'SET_STREAM_OUTPUT_MODE',
        enabled: !!_pgmStreamState.running
      });
      const viewport = getEmbeddedDisplayViewport();
      const sceneLayers = getOutputSceneLayers();
      if (embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload) {
        postMessageToEmbeddedProgramDisplay({
          type: 'PREVIEW_UPDATE',
          payload: {
            ...embeddedProgramDisplayState.payload,
            sceneLayers,
            displayViewportWidth: viewport.width,
            displayViewportHeight: viewport.height
          }
        });
      } else {
        postMessageToEmbeddedProgramDisplay({
          type: 'PREVIEW_CLEAR',
          sceneLayers
        });
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
          postMessageToEmbeddedProgramDisplay({
            type: 'SET_STREAM_OUTPUT_MODE',
            enabled: !!_pgmStreamState.running
          });
          postMessageToEmbeddedProgramDisplay({ type: 'PREVIEW_UPDATE', payload: pendingProgramPreviewPayload });
          pendingProgramPreviewPayload = null;
        } else {
	        syncEmbeddedProgramDisplay();
        }
      });
      applyProgramDisplaySource('lyrics', { forceReload: true });
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

    function buildStandaloneDisplayHtml(opts = {}) {
      const channelLiteral = JSON.stringify(CHANNEL_NAME);
      const isPreviewLiteral = opts.preview ? 'true' : 'false';
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Scripture Pod - ${opts.preview ? 'Program Preview' : 'Standalone Output'}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: 'Segoe UI', system-ui, sans-serif; }
    body.display-full-mode, body.display-custom-mode { background: #000; }
    body.lower-third-only-mode, body.lyrics-lt-mode { background: transparent; }
    #bg { position: fixed; inset: 0; z-index: 2; background: #000 center / cover no-repeat; transition: filter 220ms ease, opacity 220ms ease; }
    #bg-video { position: fixed; inset: 0; z-index: 2; width: 100%; height: 100%; object-fit: cover; display: none; }
    #bg-page { position: fixed; inset: 0; z-index: 2; width: 100%; height: 100%; border: 0; display: none; pointer-events: none; }
    #scene-compositor { position: fixed; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
    #scene-compositor .src-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; }
    #scene-compositor .src-layer video { width: 100%; height: 100%; object-fit: contain; display: block; }
    #scene-compositor .src-layer.media-source-layer video { object-fit: contain; }
    #scene-compositor .src-layer img { width: 100%; height: 100%; object-fit: contain; display: block; }
    #scene-compositor .src-layer .src-text-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 3vw; padding: 2vw; text-align: center; text-shadow: 0 0 12px rgba(0,0,0,0.7); }
    #scene-compositor .src-layer .src-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.5); font-size: 12px; font-weight: 600; }
    #stage { position: fixed; inset: 0; z-index: 3; color: #fff; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; display: flex; pointer-events: none; }
    #text-layer { width: 100%; word-break: break-word; }
    #name-role-overlay { position: fixed; inset: 0; z-index: 8; display: flex; align-items: flex-end; justify-content: flex-start; padding: 0 7vw 8vh; transform: translate(var(--name-role-offset-x,0vw),var(--name-role-offset-y,0vh)); pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 700ms ease, visibility 0s linear 700ms; }
    #name-role-overlay.is-visible { opacity: 1; visibility: visible; transition-delay: 0s; }
    .style-centered#name-role-overlay { justify-content: center; padding-bottom: 8vh; }
    .style-band#name-role-overlay { justify-content: center; padding: 0 0 7vh; }
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
    #social-engagement-overlay { position: fixed; left: 50%; bottom: 17vh; z-index: 8; display: flex; justify-content: center; width: min(920px, 82vw); transform: translate(calc(-50% + var(--social-engagement-offset-x,0vw)),var(--social-engagement-offset-y,0vh)); pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 360ms ease, visibility 360ms ease; }
    #social-engagement-overlay.is-visible { opacity: 1; visibility: visible; }
    .social-engagement-overlay-card { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; max-width: 100%; opacity: 0; transform: translateY(24px) scale(0.96); transition: opacity 560ms ease, transform 700ms cubic-bezier(0.2,0.85,0.25,1); }
    #social-engagement-overlay.is-visible .social-engagement-overlay-card { opacity: 1; transform: translateY(0) scale(1); }
    .social-engagement-overlay-socials, .social-engagement-overlay-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; width: max-content; max-width: 100%; justify-content: center; padding: 7px 12px; border: 1px solid color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 42%,transparent); border-radius: 999px; background: color-mix(in srgb,var(--social-engagement-primary,#90D5FF) 68%,transparent); color: var(--social-engagement-foreground,#fff); }
    .social-engagement-overlay-actions { padding: 6px 10px 7px; }
    .social-engagement-overlay-socials[hidden], .social-engagement-overlay-actions[hidden] { display: none; }
    #social-engagement-overlay .name-role-action { opacity: 0; transform: translateY(9px) scale(0.96); border-color: color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 70%,transparent); font-size: var(--social-engagement-action-size,11px); }
    #social-engagement-overlay.is-visible .name-role-action:not([hidden]) { opacity: 1; transform: translateY(0) scale(1); }
    #social-engagement-overlay.is-visible .name-role-action-like { transition-delay: 100ms; }
    #social-engagement-overlay.is-visible .name-role-action-share { transition-delay: 190ms; }
    #social-engagement-overlay.is-visible .name-role-action-subscribe { transition-delay: 280ms; }
    .name-role-action { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border: 1px solid color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 70%,transparent); border-radius: 999px; background: rgba(7,12,16,0.32); color: currentColor; font-size: var(--social-engagement-action-size,11px); font-weight: 800; opacity: 0; transform: translateY(9px) scale(0.96); transition: opacity 360ms ease,transform 460ms cubic-bezier(0.2,0.85,0.25,1); }
    #social-engagement-overlay .name-role-social { font-size: var(--social-engagement-size,32px); }
    #social-engagement-overlay .name-role-action svg { width: 1em; height: 1em; flex: 0 0 1em; fill: none; stroke: var(--social-engagement-accent,#90D5FF); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transform: scale(0.55) rotate(-8deg); transition: opacity 300ms ease,transform 420ms cubic-bezier(0.2,0.85,0.25,1); }
    #social-engagement-overlay.is-visible .name-role-action svg { opacity: 1; transform: scale(1) rotate(0); }
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
    .jo-body { font-weight: 700; }
    .dual-primary-block { margin-bottom: 20px; }
    .dual-secondary-wrapper { margin-top: 12px; opacity: 0.96; }
    #hud { position: fixed; right: 10px; top: 10px; z-index: 9; font-size: 11px; color: rgba(255,255,255,0.65); background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.15); border-radius: 7px; padding: 4px 8px; }
  </style>
</head>
<body>
  <div id="bg"></div>
  <video id="bg-video" muted autoplay playsinline></video>
  <iframe id="bg-page" title="Background web page" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>
  <div id="scene-compositor"></div>
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
  <div id="social-engagement-overlay" aria-hidden="true">
    <div class="social-engagement-overlay-card">
      <div class="social-engagement-overlay-socials" hidden>
        <span class="name-role-social name-role-social-instagram"><b aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg></b><span></span></span>
        <span class="name-role-social name-role-social-facebook"><b aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 3h-2.6A4.4 4.4 0 0 0 8 7.4V10H5v3.5h3V21h3.6v-7.5h3l.5-3.5h-3.5V7.8c0-1 .3-1.5 1.6-1.5H15V3z"/></svg></b><span></span></span>
        <span class="name-role-social name-role-social-website"><b aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></b><span></span></span>
      </div>
      <div class="social-engagement-overlay-actions" hidden>
        <span class="name-role-action name-role-action-like"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 10l5-8c1.5 0 2.5 1.4 2 2.8L13 9h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18 20H7"/></svg><span>LIKE</span></span>
        <span class="name-role-action name-role-action-share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3M7 8l5-5 5 5M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg><span>SHARE</span></span>
        <span class="name-role-action name-role-action-subscribe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>SUBSCRIBE</span></span>
      </div>
    </div>
  </div>
  <div id="hud">${opts.preview ? 'Program Preview' : 'Standalone Output'}</div>
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
      const sceneCompositor = document.getElementById('scene-compositor');
      const stage = document.getElementById('stage');
      const ltWrap = document.getElementById('lt-wrap');
      const ltText = document.getElementById('text-layer');
      const fullText = document.getElementById('text-layer-full');
      const hud = document.getElementById('hud');
      let lastSeq = 0;
      let lowerThirdOnlyMode = false;
      let streamOutputActive = false;
      let lastNormalUpdate = null;
      const outputStreams = Object.create(null);
      if (IS_PREVIEW && hud) hud.style.display = 'none';

      function stopOutputStream(id) {
        const existing = outputStreams[id];
        if (existing && existing.stream) {
          try { existing.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        }
        delete outputStreams[id];
      }

      function stopMissingOutputStreams(visibleIds) {
        Object.keys(outputStreams).forEach(function (id) {
          if (!visibleIds.has(id)) stopOutputStream(id);
        });
      }

      function applyLayerTransform(el, tf) {
        const x = Number(tf && tf.x != null ? tf.x : 0);
        const y = Number(tf && tf.y != null ? tf.y : 0);
        const w = Number(tf && tf.w != null ? tf.w : 100);
        const h = Number(tf && tf.h != null ? tf.h : 100);
        const rotation = Number(tf && tf.rotation != null ? tf.rotation : 0);
        const cT = Number(tf && tf.cropTop != null ? tf.cropTop : 0);
        const cR = Number(tf && tf.cropRight != null ? tf.cropRight : 0);
        const cB = Number(tf && tf.cropBottom != null ? tf.cropBottom : 0);
        const cL = Number(tf && tf.cropLeft != null ? tf.cropLeft : 0);
        el.style.left = x + '%';
        el.style.top = y + '%';
        el.style.width = w + '%';
        el.style.height = h + '%';
        el.style.transformOrigin = '50% 50%';
        var transforms = [];
        if (rotation) transforms.push('rotate(' + rotation + 'deg)');
        var flipH = tf && tf.flipH ? -1 : 1;
        var flipV = tf && tf.flipV ? -1 : 1;
        if (flipH === -1 || flipV === -1) transforms.push('scale(' + flipH + ', ' + flipV + ')');
        el.style.transform = transforms.length ? transforms.join(' ') : '';
        el.style.clipPath = (cT || cR || cB || cL) ? ('inset(' + cT + '% ' + cR + '% ' + cB + '% ' + cL + '%)') : '';
      }

      function normalizeFitMode(mode, fallback) {
        var key = String(mode || '').trim().toLowerCase();
        if (key === 'contain' || key === 'cover' || key === 'stretch' || key === 'pixel-1:1') return key;
        if (key === 'fill') return 'stretch';
        if (key === 'none') return 'pixel-1:1';
        var fb = String(fallback || 'contain').trim().toLowerCase();
        if (fb === 'cover' || fb === 'stretch' || fb === 'pixel-1:1') return fb;
        return 'contain';
      }

      function applyVisualFitMode(el, mode, opts) {
        if (!el) return;
        var cfg = opts || {};
        var normalized = normalizeFitMode(mode, 'contain');
        var mirror = !!cfg.mirror;
        el.style.position = 'absolute';
        el.style.display = 'block';
        el.style.transformOrigin = '50% 50%';
        el.style.maxWidth = 'none';
        el.style.maxHeight = 'none';
        if (normalized === 'pixel-1:1') {
          el.style.left = '50%';
          el.style.top = '50%';
          el.style.right = '';
          el.style.bottom = '';
          el.style.width = 'auto';
          el.style.height = 'auto';
          el.style.objectFit = 'none';
          el.style.transform = mirror ? 'translate(-50%, -50%) scaleX(-1)' : 'translate(-50%, -50%)';
        } else {
          el.style.left = '0';
          el.style.top = '0';
          el.style.right = '';
          el.style.bottom = '';
          el.style.width = '100%';
          el.style.height = '100%';
          el.style.objectFit = normalized === 'stretch' ? 'fill' : normalized;
          el.style.transform = mirror ? 'scaleX(-1)' : '';
        }
      }

      function bindVisualFit(videoEl, mode, opts) {
        if (!videoEl) return;
        var apply = function () { applyVisualFitMode(videoEl, mode, opts); };
        apply();
        if (videoEl.dataset.fitBound === '1') return;
        videoEl.dataset.fitBound = '1';
        videoEl.addEventListener('loadedmetadata', apply);
        videoEl.addEventListener('resize', apply);
      }

      function attachCameraStream(layerId, videoEl, deviceId) {
        const wantedDevice = String(deviceId || '');
        const existing = outputStreams[layerId];
        if (existing && existing.stream && existing.deviceId === wantedDevice) {
          videoEl.srcObject = existing.stream;
          videoEl.play().catch(function () {});
          return;
        }
        stopOutputStream(layerId);
        const constraints = wantedDevice
          ? { video: { deviceId: { exact: wantedDevice } }, audio: false }
          : { video: true, audio: false };
        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
          outputStreams[layerId] = { stream: stream, deviceId: wantedDevice };
          videoEl.srcObject = stream;
          videoEl.play().catch(function () {});
        }).catch(function () {});
      }

      /* ---- media-source video caching & smooth sync ---- */
      var _sceneMediaEls = Object.create(null);   // layerId -> cached <video>
      var _lastSceneLayersSig = '';

      function _sceneLayersSig(layers) {
        if (!Array.isArray(layers)) return '';
        return layers.map(function (l) {
          if (!l) return '';
          var t = l.transform || {};
          var c = l.config || {};
          var dk = c.dataUrl ? String(c.dataUrl).slice(0, 64) : '';
          return [l.id||'', l.type||'', l.zIndex||0,
                  t.x||0, t.y||0, t.w||100, t.h||100, t.rotation||0,
                  t.cropTop||0, t.cropRight||0, t.cropBottom||0, t.cropLeft||0,
                  c.deviceId||'', c.text||'', dk, c.videoFilter||'', c.fitMode||'', c.fit||''].join('|');
        }).join('||');
      }

      function _syncMediaEl(vid, cfg) {
        if (!vid) return;
        var nextUrl = String(cfg.dataUrl || '');
        if (nextUrl && String(vid.dataset.mediaUrl || '') !== nextUrl) {
          vid.dataset.mediaUrl = nextUrl;
          vid.src = nextUrl;
        }
        vid.autoplay = true;
        vid.playsInline = true;
        vid.loop = cfg.mediaLoop !== false;
        var baseRate = Number(cfg.mediaPlaybackRate);
        var normalRate = (baseRate === baseRate && baseRate > 0) ? Math.max(0.25, Math.min(4, baseRate)) : 1;
        var vol = Number(cfg.mediaVolume);
        vid.volume = (vol === vol) ? Math.max(0, Math.min(1, vol)) : 1;
        vid.muted = !!cfg.mediaMuted;
        var target = Number(cfg.mediaCurrentTime);
        if (target === target && target >= 0) {
          vid.dataset.targetTime = String(target);
          var cur = Number(vid.currentTime || 0);
          var drift = cur - target;
          var absDrift = Math.abs(drift);
          if (absDrift > 1.0) {
            // Large drift (user seek / restart): hard seek
            try { vid.currentTime = Math.max(0, target); } catch (_) {}
            vid.playbackRate = normalRate;
          } else if (absDrift > 0.15) {
            // Medium drift: adjust playback rate to smoothly catch up / slow down
            vid.playbackRate = normalRate * (drift > 0 ? 0.95 : 1.05);
          } else {
            // Within tolerance: restore normal rate
            vid.playbackRate = normalRate;
          }
        } else {
          vid.playbackRate = normalRate;
        }
        var stopped = !!cfg.mediaStopped;
        var paused = cfg.mediaPaused === true;
        if (stopped || paused) {
          try { vid.pause(); } catch (_) {}
        } else {
          vid.play().catch(function () {});
        }
      }

      function _syncMediaStates(layers) {
        if (!Array.isArray(layers)) return;
        layers.forEach(function (ld) {
          if (!ld || ld.type !== 'media-source' || !ld.id) return;
          var lid = String(ld.id);
          var cfg = ld.config || {};
          var layerEl = sceneCompositor && sceneCompositor.querySelector('.src-layer[data-src-id="' + lid + '"]');
          if (layerEl) layerEl.style.visibility = cfg.mediaStopped ? 'hidden' : '';
          var vid = _sceneMediaEls[lid];
          if (vid) _syncMediaEl(vid, cfg);
        });
      }

      function _pruneMediaEls(visibleIds) {
        Object.keys(_sceneMediaEls).forEach(function (id) {
          if (visibleIds[id]) return;
          var v = _sceneMediaEls[id];
          try { v.pause(); } catch (_) {}
          try { v.removeAttribute('src'); v.load(); } catch (_) {}
          delete _sceneMediaEls[id];
        });
      }

      function renderSceneLayers(layers) {
        if (!sceneCompositor || !Array.isArray(layers)) return;

        /* Fast path: if only media state changed, sync without DOM rebuild */
        var sig = _sceneLayersSig(layers);
        if (sig && sig === _lastSceneLayersSig) {
          _syncMediaStates(layers);
          return;
        }
        _lastSceneLayersSig = sig;

        var visibleIds = new Set();
        sceneCompositor.innerHTML = '';
        layers.forEach(function (layerData) {
          if (!layerData || !layerData.id) return;
          var lid = String(layerData.id);
          visibleIds.add(lid);
          var layer = document.createElement('div');
          layer.className = 'src-layer';
          layer.dataset.srcId = lid;
          if (layerData.type === 'media-source') layer.classList.add('media-source-layer');
          layer.style.zIndex = String(Number(layerData.zIndex || 1));
          applyLayerTransform(layer, layerData.transform || {});
          var cfg = layerData.config || {};
          if (layerData.type === 'camera') {
            var vid = document.createElement('video');
            vid.autoplay = true;
            vid.muted = true;
            vid.playsInline = true;
            bindVisualFit(vid, cfg.fitMode || cfg.fit || 'contain', { mirror: !!cfg.mirror });
            layer.appendChild(vid);
            attachCameraStream(lid, vid, cfg.deviceId || '');
          } else if (layerData.type === 'ndi') {
            // NDI video feed via virtual camera device
            var ndiVid = document.createElement('video');
            ndiVid.autoplay = true;
            ndiVid.muted = true;
            ndiVid.playsInline = true;
            bindVisualFit(ndiVid, cfg.fitMode || cfg.fit || 'cover', { mirror: false });
            layer.appendChild(ndiVid);
            attachCameraStream(lid, ndiVid, cfg.cameraDeviceId || cfg.deviceId || '');
          } else if (layerData.type === 'image') {
            if (cfg.dataUrl) {
              var img = document.createElement('img');
              img.src = cfg.dataUrl;
              img.alt = layerData.name || '';
              applyVisualFitMode(img, cfg.fitMode || cfg.fit || 'contain', { mirror: false });
              if (cfg.opacity != null && cfg.opacity < 100) img.style.opacity = (cfg.opacity / 100).toFixed(2);
              layer.appendChild(img);
            }
          } else if (layerData.type === 'media-source') {
            var mvid = _sceneMediaEls[lid];
            if (!mvid) {
              mvid = document.createElement('video');
              applyVisualFitMode(mvid, cfg.fitMode || cfg.fit || 'contain', { mirror: false });
              mvid.addEventListener('loadedmetadata', function () {
                var t = Number(mvid.dataset.targetTime || '');
                if (t === t && t >= 0 && Math.abs((Number(mvid.currentTime)||0) - t) > 0.18) {
                  try { mvid.currentTime = Math.max(0, t); } catch (_) {}
                }
              });
              _sceneMediaEls[lid] = mvid;
            }
            if (cfg.dataUrl) {
              applyVisualFitMode(mvid, cfg.fitMode || cfg.fit || 'contain', { mirror: false });
              _syncMediaEl(mvid, cfg);
              layer.style.visibility = cfg.mediaStopped ? 'hidden' : '';
              layer.appendChild(mvid);
            }
          } else if (layerData.type === 'text') {
            var txt = document.createElement('div');
            txt.className = 'src-text-overlay';
            txt.textContent = cfg.text || layerData.name || '';
            if (cfg.fontFamily) txt.style.fontFamily = cfg.fontFamily;
            if (cfg.fontSize) txt.style.fontSize = cfg.fontSize + 'px';
            if (cfg.color) txt.style.color = cfg.color;
            if (cfg.align) txt.style.textAlign = cfg.align;
            if (cfg.wordWrap === false) txt.style.whiteSpace = 'nowrap';
            if (cfg.showBg) {
              txt.style.backgroundColor = cfg.bgColor || '#000';
              txt.style.padding = '0.2em 0.5em';
              txt.style.borderRadius = '6px';
            }
            layer.appendChild(txt);
          } else if (layerData.type === 'window-capture') {
            var wcPh = document.createElement('div');
            wcPh.className = 'src-placeholder';
            wcPh.textContent = cfg.windowName || 'Window Capture';
            layer.appendChild(wcPh);
          } else if (layerData.type === 'scene') {
            var scPh = document.createElement('div');
            scPh.className = 'src-placeholder';
            scPh.textContent = cfg.sceneName ? ('Scene: ' + cfg.sceneName) : 'Scene Source';
            layer.appendChild(scPh);
          }
          // Create SVG sharpen filters if needed (same DOM as control panel)
          if (cfg.sharpenDefs && cfg.sharpenDefs.length) {
            cfg.sharpenDefs.forEach(function(d) { _ensureSharpenFilter(d.filterId, d.amount, d.radius); });
          }
          // Apply pre-computed video FX CSS filter
          if (cfg.videoFilter) layer.style.filter = cfg.videoFilter;
          if (cfg.videoVignette) layer.style.boxShadow = cfg.videoVignette;
          sceneCompositor.appendChild(layer);
        });
        var visObj = {};
        visibleIds.forEach(function (id) { visObj[id] = true; });
        _pruneMediaEls(visObj);
        stopMissingOutputStreams(visibleIds);
      }

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
        const angle = Number(data.bgGradientAngle || 135);
        const shadow = data.bgGradientShadow || '#111111';
        const highlight = data.bgGradientHighlight || '#000000';
        if (mode === 'gradient') {
          bg.style.backgroundImage = 'linear-gradient(' + angle + 'deg, ' + shadow + ', ' + highlight + ')';
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
          const outputMode = IS_PREVIEW ? (streamOutputActive ? 'lt' : null) : 'full';
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
            renderSceneLayers([]);
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
            renderSceneLayers([]);
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
        renderSceneLayers(data.sceneLayers);
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
          overlay.style.removeProperty('--name-role-offset-x');
          overlay.style.removeProperty('--name-role-offset-y');
          return;
        }
        const name = String(data && data.name || '').trim();
        const role = String(data && data.role || '').trim();
        const rawStyle = String(data && data.style || 'classic-rise');
        const legacyStyle = rawStyle.match(/^(classic|centered|band)-(rise|slide|sweep|zoom|shutter|spring|glide|blur|flip|wipe|float|glow|reveal|drop|curtain|pop|expand)$/);
        const normalizedStyle = legacyStyle ? legacyStyle[1] + '-gms-' + legacyStyle[2] : rawStyle;
        const styleMatch = normalizedStyle.match(/^(classic|centered|band)-(gms|noir|broadcast|modern|news|spotlight|legacy|clean|glass|copper|editorial|neon|ribbon)-(rise|slide|sweep|zoom|shutter|spring|glide|blur|flip|wipe|float|glow|reveal|drop|curtain|pop|expand)$/);
        const layout = styleMatch ? styleMatch[1] : 'classic';
        const theme = styleMatch ? styleMatch[2] : 'gms';
        const animation = styleMatch ? styleMatch[3] : 'rise';
        const style = layout + '-' + theme + '-' + animation;
        const accentColor = /^#[0-9a-f]{6}$/i.test(data && data.accentColor || '') ? data.accentColor : '#90D5FF';
        const primaryDefaults = { legacy: '#90D5FF', gms: '#90D5FF', noir: '#90D5FF', broadcast: '#90D5FF', modern: '#90D5FF', news: '#90D5FF', spotlight: '#90D5FF', clean: '#90D5FF', glass: '#90D5FF', copper: '#90D5FF', editorial: '#90D5FF', neon: '#90D5FF', ribbon: '#90D5FF' };
        const primaryColor = /^#[0-9a-f]{6}$/i.test(data && data.primaryColor || '') ? data.primaryColor : (primaryDefaults[theme] || '#90D5FF');
        const primaryRgb = primaryColor.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
        const primaryLuminance = 0.2126 * primaryRgb[0] + 0.7152 * primaryRgb[1] + 0.0722 * primaryRgb[2];
        const lightBackground = primaryLuminance >= 0.72;
        const foregroundColor = lightBackground ? '#101216' : '#ffffff';
        const logo = typeof (data && data.logo) === 'string' && data.logo.startsWith('data:image/') ? data.logo : '';
        const logoColor = data && data.logoColor === 'black' ? 'black' : 'white';
        const nameSize = Math.max(24, Math.min(160, Number(data && data.nameSize) || 56));
        const roleSize = Math.max(12, Math.min(72, Number(data && data.roleSize) || 24));
        const logoSize = Math.max(24, Math.min(320, Number(data && data.logoSize) || 128));
        const offsetX = Math.max(-40, Math.min(40, Number(data.offsetX) || 0));
        const offsetY = Math.max(-40, Math.min(40, Number(data.offsetY) || 0));
        const enabled = !!(data && data.enabled) && !!name;
        const nameEl = overlay.querySelector('.name-role-overlay-name');
        const roleEl = overlay.querySelector('.name-role-overlay-role');
        const logoEl = overlay.querySelector('.name-role-overlay-logo');
        const changed = overlay.dataset.name !== name || overlay.dataset.role !== role ||
          overlay.dataset.style !== style || overlay.dataset.accentColor !== accentColor || overlay.dataset.logo !== logo || overlay.dataset.logoColor !== logoColor;
        if (nameEl) nameEl.textContent = name;
        if (roleEl) roleEl.textContent = role;
        if (logoEl) {
          if (logo) logoEl.src = logo;
          else logoEl.removeAttribute('src');
          logoEl.hidden = !logo;
        }
        overlay.classList.remove('style-classic', 'style-centered', 'style-band', 'theme-gms', 'theme-noir', 'theme-broadcast', 'theme-modern', 'theme-news', 'theme-spotlight', 'theme-legacy', 'theme-clean', 'theme-glass', 'theme-copper', 'theme-editorial', 'theme-neon', 'theme-ribbon', 'motion-rise', 'motion-slide', 'motion-sweep', 'motion-zoom', 'motion-shutter', 'motion-spring', 'motion-glide', 'motion-blur', 'motion-flip', 'motion-wipe', 'motion-float', 'motion-glow', 'motion-reveal', 'motion-drop', 'motion-curtain', 'motion-pop', 'motion-expand');
        overlay.classList.add('style-' + layout, 'theme-' + theme, 'motion-' + animation);
        overlay.classList.toggle('logo-black', logoColor === 'black');
        overlay.classList.toggle('is-light-background', lightBackground);
        overlay.style.setProperty('--name-role-primary', primaryColor);
        overlay.style.setProperty('--name-role-accent', accentColor);
        overlay.style.setProperty('--name-role-foreground', foregroundColor);
        overlay.style.setProperty('--name-role-name-size', nameSize + 'px');
        overlay.style.setProperty('--name-role-role-size', roleSize + 'px');
        overlay.style.setProperty('--name-role-logo-size', logoSize + 'px');
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
        overlay.classList.toggle('is-visible', enabled);
      }

      function updateSocialEngagementOverlay(data) {
        const overlay = document.getElementById('social-engagement-overlay');
        if (!overlay) return;
        const socials = data && data.socials || {};
        const actions = data && data.actions || {};
        const socialValues = {
          instagram: String(socials.instagram || '').trim(),
          facebook: String(socials.facebook || '').trim(),
          website: String(socials.website || '').trim()
        };
        const actionValues = {
          like: !!actions.like,
          share: !!actions.share,
          subscribe: !!actions.subscribe
        };
        const socialsEl = overlay.querySelector('.social-engagement-overlay-socials');
        const actionsEl = overlay.querySelector('.social-engagement-overlay-actions');
        const accentColor = /^#[0-9a-f]{6}$/i.test(data && data.accentColor || '') ? data.accentColor : '#90D5FF';
        const primaryColor = /^#[0-9a-f]{6}$/i.test(data && data.primaryColor || '') ? data.primaryColor : '#90D5FF';
        const primaryRgb = primaryColor.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
        const primaryLuminance = 0.2126 * primaryRgb[0] + 0.7152 * primaryRgb[1] + 0.0722 * primaryRgb[2];
        const foregroundColor = primaryLuminance >= 0.72 ? '#101216' : '#ffffff';
        const size = Math.max(10, Math.min(40, Number(data && data.size) || 32));
        const offsetX = Math.max(-40, Math.min(40, Number(data && data.offsetX) || 0));
        const offsetY = Math.max(-40, Math.min(40, Number(data && data.offsetY) || 0));
        Object.entries(socialValues).forEach(([key, value]) => {
          const item = socialsEl && socialsEl.querySelector('.name-role-social-' + key);
          if (!item) return;
          item.hidden = !value;
          const text = item.querySelector('span');
          if (text) text.textContent = value;
        });
        if (socialsEl) socialsEl.hidden = !Object.values(socialValues).some(Boolean);
        Object.entries(actionValues).forEach(([key, visible]) => {
          const item = actionsEl && actionsEl.querySelector('.name-role-action-' + key);
          if (item) item.hidden = !visible;
        });
        if (actionsEl) actionsEl.hidden = !Object.values(actionValues).some(Boolean);
        const enabled = !!(data && data.enabled) && (
          Object.values(socialValues).some(Boolean) || Object.values(actionValues).some(Boolean)
        );
        const signature = JSON.stringify({ socialValues, actionValues, accentColor: accentColor, primaryColor, size: size, offsetX, offsetY });
        const changed = overlay.dataset.signature !== signature;
        if (enabled && changed && overlay.classList.contains('is-visible')) {
          overlay.classList.remove('is-visible');
          void overlay.offsetWidth;
        }
        overlay.dataset.signature = signature;
        overlay.style.setProperty('--social-engagement-primary', primaryColor);
        overlay.style.setProperty('--social-engagement-foreground', foregroundColor);
        overlay.style.setProperty('--social-engagement-accent', accentColor);
        overlay.style.setProperty('--social-engagement-size', size + 'px');
        overlay.style.setProperty('--social-engagement-action-size', Math.max(10, Math.round(size * 0.75)) + 'px');
        overlay.style.setProperty('--social-engagement-icon-size', Math.round(size * 1.4) + 'px');
        overlay.style.setProperty('--social-engagement-offset-x', offsetX + 'vw');
        overlay.style.setProperty('--social-engagement-offset-y', offsetY + 'vh');
        overlay.setAttribute('aria-hidden', enabled ? 'false' : 'true');
        overlay.classList.toggle('is-visible', enabled);
      }

      function clearOutput() {
        lowerThirdOnlyMode = false;
        lastNormalUpdate = null;
        document.body.classList.remove('lower-third-only-mode', 'lyrics-lt-mode', 'display-full-mode', 'display-custom-mode');
        fullText.innerHTML = '';
        ltText.innerHTML = '';
        renderSceneLayers([]);
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
              if (Array.isArray(data.state.sceneLayers)) renderSceneLayers(data.state.sceneLayers);
              clearOutput();
            }
            return;
          }
          if (type === 'UPDATE') {
            applyUpdate(data);
            return;
          }
          if (type === 'CLEAR') {
            if (Array.isArray(data.sceneLayers)) renderSceneLayers(data.sceneLayers);
            clearOutput();
          }
          if (type === 'SCENE_LAYERS_UPDATE') {
            if (Array.isArray(data.sceneLayers)) renderSceneLayers(data.sceneLayers);
          }
        };
      }

      window.addEventListener('message', function (event) {
        const data = event.data || {};
        if (data && data.type === 'SET_STREAM_OUTPUT_MODE' && IS_PREVIEW) {
          const enabled = !!data.enabled;
          if (streamOutputActive !== enabled) {
            streamOutputActive = enabled;
            lastSeq = 0;
            if (lastNormalUpdate) applyUpdate(lastNormalUpdate);
          }
          return;
        }
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
        if (data && data.type === 'SCENE_LAYERS_UPDATE') {
          renderSceneLayers(data.sceneLayers);
          return;
        }
      });

      window.addEventListener('beforeunload', function () {
        stopMissingOutputStreams(new Set());
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
      const streamBtn = document.getElementById('lyrics-output-stream-btn');
      if (standaloneDisplayWindow && standaloneDisplayWindow.closed) lyricsMonitorOutputOpen = false;
      const monitorActive = lyricsMonitorOutputOpen || outputLiveActive;
      const streamActive = !!(_pgmStreamState && (_pgmStreamState.running || _pgmStreamState.starting));
      if (monitorBtn) {
        monitorBtn.classList.toggle('active', monitorActive);
        monitorBtn.setAttribute('aria-pressed', monitorActive ? 'true' : 'false');
      }
      if (streamBtn) {
        streamBtn.classList.toggle('active', streamActive);
        streamBtn.setAttribute('aria-pressed', streamActive ? 'true' : 'false');
        streamBtn.disabled = !!_pgmStreamState?.starting;
      }
    }

    async function toggleLyricsMonitorOutput() {
      if (lyricsMonitorOutputOpen || outputLiveActive) {
        endOutputLive();
        return;
      }
      await openStandaloneOutputFromUi();
    }

    function toggleLyricsStreamOutput() {
      pgmStreamToggle();
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
        postMessageToStandaloneOutput({
          ...embeddedProgramDisplayState.payload,
          type: 'UPDATE',
          proto: 1,
          sender: 'control',
          ts: Date.now(),
          seq: nextSeq(),
          sceneLayers: getOutputSceneLayers(),
          displayViewportWidth: viewport.width,
          displayViewportHeight: viewport.height
        });
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

    const _PGM_STREAM_CONFIG_KEY = 'projection_stream_config_v1';
    const _PGM_STREAM_PLATFORM_DEFAULTS = {
      youtube: {
        name: 'YouTube',
        url: 'rtmps://a.rtmp.youtube.com/live2',
        help: 'In YouTube Studio: Go Live -> Stream -> copy Stream URL and Stream Key.'
      },
      facebook: {
        name: 'Facebook',
        url: 'rtmps://live-api-s.facebook.com:443/rtmp/',
        help: 'In Facebook Live Producer: choose Stream key -> copy Server URL and Stream Key.'
      },
      twitch: {
        name: 'Twitch',
        url: 'rtmp://live.twitch.tv/app/',
        help: 'In Twitch Dashboard: Settings -> Stream -> copy your Primary Stream Key.'
      },
      kick: {
        name: 'Kick',
        url: 'rtmp://fa723fc1b171.global-contribute.live-video.net/app/',
        help: 'In Kick Dashboard: Settings -> Stream -> copy Stream URL and Stream Key.'
      },
      instagram: {
        name: 'Instagram',
        url: 'rtmps://live-upload.instagram.com:443/rtmp/',
        help: 'In Instagram Live (Streaming software): copy Stream URL and Stream Key.'
      },
      custom: {
        name: 'Custom RTMP',
        url: '',
        help: 'Use the exact ingest URL and stream key provided by your platform.'
      }
    };
    const _pgmStreamState = {
      running: false,
      status: 'idle',
      starting: false,
      lastError: '',
      encoderReady: false,
      encoderPath: '',
	      config: {
	        platform: 'youtube',
	        url: 'rtmps://a.rtmp.youtube.com/live2',
	        key: '',
	        canvasResolution: '1920x1080',
	        resolution: '1920x1080',
	        fps: 30,
	        bitrateKbps: 4500
	      }
	    };
	    let _pgmStreamAudioCtx = null;
	    let _pgmStreamAudioSource = null;
	    let _pgmStreamAudioProcessor = null;
	    let _pgmStreamAudioSink = null;
	    let _pgmStreamAudioNullDest = null;

    function pgmStreamInferProtocol(url, fallback = 'rtmps') {
      const raw = String(url || '').trim().toLowerCase();
      if (raw.startsWith('srt://')) return 'srt';
      if (raw.startsWith('rtmps://')) return 'rtmps';
      if (raw.startsWith('rtmp://')) return 'rtmp';
      if (raw.startsWith('https://') || raw.startsWith('http://')) return 'whip';
      return fallback;
    }

	    function pgmStreamNormalizeUrl(platform, rawUrl) {
	      const value = String(rawUrl || '').trim();
	      if (!value) return '';
	      if (platform === 'youtube' && /^rtmp:\/\/a\.rtmp\.youtube\.com\/live2\/?$/i.test(value)) {
	        return 'rtmps://a.rtmp.youtube.com/live2';
	      }
	      return value;
	    }

	    function _pgmStreamPackS16leStereo(left, right) {
	      const frames = Math.min(left.length, right.length);
	      const out = new Uint8Array(frames * 4);
	      let o = 0;
	      for (let i = 0; i < frames; i++) {
	        const l = Math.max(-1, Math.min(1, Number(left[i]) || 0));
	        const r = Math.max(-1, Math.min(1, Number(right[i]) || 0));
	        const li = l < 0 ? Math.round(l * 0x8000) : Math.round(l * 0x7fff);
	        const ri = r < 0 ? Math.round(r * 0x8000) : Math.round(r * 0x7fff);
	        out[o++] = li & 0xff;
	        out[o++] = (li >> 8) & 0xff;
	        out[o++] = ri & 0xff;
	        out[o++] = (ri >> 8) & 0xff;
	      }
	      return out;
	    }

	    async function pgmStreamStartAudioPump() {
	      if (!(window.BSPDesktop && typeof window.BSPDesktop.pushStreamAudioChunk === 'function')) return false;
	      if (_pgmStreamAudioCtx) return true;
	      _pgmEnsureGraph();
	      _pgmApplyMonitoringModeRouting();
	      _pgmSyncSources();
	      const pgmStream = getPgmOutputStream();
	      if (!(pgmStream && typeof pgmStream.getAudioTracks === 'function' && pgmStream.getAudioTracks().length)) {
	        _pgmStreamState.lastError = 'Program mix audio unavailable.';
	        pgmStreamRenderState();
	        return false;
	      }
	      const Ctor = window.AudioContext || window.webkitAudioContext;
	      if (!Ctor) return false;
	      try {
	        _pgmStreamAudioCtx = new Ctor({ latencyHint: 'interactive', sampleRate: 48000 });
	      } catch (_) {
	        _pgmStreamAudioCtx = new Ctor();
	      }
	      try {
	        if (_pgmStreamAudioCtx.state === 'suspended') await _pgmStreamAudioCtx.resume();
	      } catch (_) {}

	      _pgmStreamAudioSource = _pgmStreamAudioCtx.createMediaStreamSource(pgmStream);
	      // 2048-sample buffer (~42ms @ 48kHz) balances stream latency against
	      // main-thread callback pressure. Lower than 4096 for tighter A/V sync.
	      _pgmStreamAudioProcessor = _pgmStreamAudioCtx.createScriptProcessor(2048, 2, 2);
	      _pgmStreamAudioSink = _pgmStreamAudioCtx.createGain();
	      _pgmStreamAudioSink.gain.value = 0;
	      _pgmStreamAudioNullDest = _pgmStreamAudioCtx.createMediaStreamDestination();
	      _pgmStreamAudioProcessor.onaudioprocess = (evt) => {
	        if (!(_pgmStreamState.running || _pgmStreamState.starting)) return;
	        const input = evt.inputBuffer;
	        if (!input) return;
	        const left = input.numberOfChannels > 0 ? input.getChannelData(0) : null;
	        const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
	        if (!left || !right) return;
	        const pcm = _pgmStreamPackS16leStereo(left, right);
	        try { window.BSPDesktop.pushStreamAudioChunk(pcm); } catch (_) {}
	      };
	      _pgmStreamAudioSource.connect(_pgmStreamAudioProcessor);
	      _pgmStreamAudioProcessor.connect(_pgmStreamAudioSink);
	      // Keep the processor graph alive without routing to speakers.
	      _pgmStreamAudioSink.connect(_pgmStreamAudioNullDest);
	      return true;
	    }

	    function pgmStreamStopAudioPump() {
	      try {
	        if (window.BSPDesktop && typeof window.BSPDesktop.endStreamAudio === 'function') {
	          window.BSPDesktop.endStreamAudio();
	        }
	      } catch (_) {}
	      if (_pgmStreamAudioProcessor) {
	        try { _pgmStreamAudioProcessor.disconnect(); } catch (_) {}
	        _pgmStreamAudioProcessor.onaudioprocess = null;
	      }
	      if (_pgmStreamAudioSource) {
	        try { _pgmStreamAudioSource.disconnect(); } catch (_) {}
	      }
	      if (_pgmStreamAudioSink) {
	        try { _pgmStreamAudioSink.disconnect(); } catch (_) {}
	      }
	      if (_pgmStreamAudioNullDest) {
	        try { _pgmStreamAudioNullDest.disconnect(); } catch (_) {}
	      }
	      if (_pgmStreamAudioCtx) {
	        try { _pgmStreamAudioCtx.close(); } catch (_) {}
	      }
	      _pgmStreamAudioCtx = null;
	      _pgmStreamAudioSource = null;
	      _pgmStreamAudioProcessor = null;
	      _pgmStreamAudioSink = null;
	      _pgmStreamAudioNullDest = null;
	    }

    function pgmStreamPersistConfig() {
      try {
        localStorage.setItem(_PGM_STREAM_CONFIG_KEY, JSON.stringify(_pgmStreamState.config));
      } catch (e) {}
    }

    function pgmStreamLoadConfig() {
      try {
        const raw = localStorage.getItem(_PGM_STREAM_CONFIG_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        _pgmStreamState.config.platform = String(parsed.platform || _pgmStreamState.config.platform);
        _pgmStreamState.config.url = String(parsed.url || _pgmStreamState.config.url);
        _pgmStreamState.config.key = String(parsed.key || '');
	        _pgmStreamState.config.canvasResolution = String(parsed.canvasResolution || _pgmStreamState.config.canvasResolution);
	        _pgmStreamState.config.resolution = String(parsed.resolution || _pgmStreamState.config.resolution);
	        _pgmStreamState.config.fps = Math.max(15, Math.min(60, Number(parsed.fps) || _pgmStreamState.config.fps));
	        _pgmStreamState.config.bitrateKbps = Math.max(500, Math.min(20000, Number(parsed.bitrateKbps) || _pgmStreamState.config.bitrateKbps));
	      } catch (e) {}
      _pgmStreamState.config.url = pgmStreamNormalizeUrl(_pgmStreamState.config.platform, _pgmStreamState.config.url);
    }

    function pgmStreamRenderState() {
      const cfg = _pgmStreamState.config;
      const platform = _PGM_STREAM_PLATFORM_DEFAULTS[cfg.platform] || _PGM_STREAM_PLATFORM_DEFAULTS.custom;
      const pill = document.getElementById('pgm-stream-pill');
      const toggleBtn = document.getElementById('pgm-stream-toggle-btn');
      const settingsBtn = document.getElementById('pgm-stream-settings-btn');
      const platformEl = document.getElementById('pgm-stream-platform');
      const destinationEl = document.getElementById('pgm-stream-destination');
      const canvasInfoEl = document.getElementById('pgm-stream-canvas-info');
      const outputInfoEl = document.getElementById('pgm-stream-output-info');
      const audioInfoEl = document.getElementById('pgm-stream-audio-info');
      const encoderEl = document.getElementById('pgm-stream-encoder');
      const errEl = document.getElementById('pgm-stream-error');

      if (platformEl) platformEl.textContent = platform.name;
      if (destinationEl) destinationEl.textContent = cfg.url || 'No server URL';
	      if (canvasInfoEl) canvasInfoEl.textContent = (cfg.canvasResolution || '1920x1080').replace('x', '×');
	      if (outputInfoEl) outputInfoEl.textContent = (cfg.resolution || '1920x1080').replace('x', '×');
	      if (audioInfoEl) {
	        audioInfoEl.textContent = 'Program Mix';
	      }
      if (encoderEl) {
        if (_pgmStreamState.encoderReady) encoderEl.textContent = _pgmStreamState.encoderPath || 'Ready';
        else encoderEl.textContent = 'Unavailable';
      }
      if (errEl) errEl.textContent = _pgmStreamState.lastError || 'None';

      const live = _pgmStreamState.running;
      if (pill) {
        pill.classList.toggle('live', live);
        if (_pgmStreamState.starting) pill.textContent = 'STARTING';
        else pill.textContent = live ? 'LIVE' : 'OFFLINE';
      }
      if (toggleBtn) {
        toggleBtn.disabled = _pgmStreamState.starting || !_pgmStreamState.encoderReady;
        toggleBtn.classList.toggle('live', live);
        toggleBtn.textContent = _pgmStreamState.starting ? 'Starting...' : (live ? 'Stop Streaming' : 'Start Streaming');
      }
      if (settingsBtn) {
        settingsBtn.disabled = _pgmStreamState.starting || live;
      }
      syncLyricsOutputTypeButtons();
    }

    function pgmStreamHandlePlatformChange() {
      const platformSelect = document.getElementById('pgm-stream-platform-select');
      const urlInput = document.getElementById('pgm-stream-url-input');
      const help = document.getElementById('pgm-stream-help');
      const platform = String(platformSelect?.value || 'custom');
      const defaults = _PGM_STREAM_PLATFORM_DEFAULTS[platform] || _PGM_STREAM_PLATFORM_DEFAULTS.custom;
      if (help) help.textContent = defaults.help || '';
      if (urlInput && !String(urlInput.value || '').trim() && defaults.url) {
        urlInput.value = defaults.url;
      }
    }

    async function pgmStreamOpenSettings() {
      const overlay = document.getElementById('pgm-stream-settings-overlay');
      if (!overlay) return;

      const cfg = _pgmStreamState.config;
      const platformSelect = document.getElementById('pgm-stream-platform-select');
      const urlInput = document.getElementById('pgm-stream-url-input');
	      const keyInput = document.getElementById('pgm-stream-key-input');
	      const canvasSelect = document.getElementById('pgm-stream-canvas-select');
	      const resolutionSelect = document.getElementById('pgm-stream-resolution-select');
	      const fpsSelect = document.getElementById('pgm-stream-fps-select');
	      const bitrateInput = document.getElementById('pgm-stream-bitrate-input');

      if (platformSelect) platformSelect.value = cfg.platform || 'custom';
      if (urlInput) urlInput.value = cfg.url || '';
      if (keyInput) keyInput.value = cfg.key || '';
	      if (canvasSelect) canvasSelect.value = cfg.canvasResolution || '1920x1080';
	      if (resolutionSelect) resolutionSelect.value = cfg.resolution || '1920x1080';
	      if (fpsSelect) fpsSelect.value = String(cfg.fps || 30);
	      if (bitrateInput) bitrateInput.value = String(cfg.bitrateKbps || 4500);

      pgmStreamHandlePlatformChange();
      overlay.classList.add('open');
    }

    function pgmStreamCloseSettings() {
      const overlay = document.getElementById('pgm-stream-settings-overlay');
      if (overlay) overlay.classList.remove('open');
    }

    function pgmStreamSaveSettings() {
      const platformSelect = document.getElementById('pgm-stream-platform-select');
      const urlInput = document.getElementById('pgm-stream-url-input');
	      const keyInput = document.getElementById('pgm-stream-key-input');
	      const canvasSelect = document.getElementById('pgm-stream-canvas-select');
	      const resolutionSelect = document.getElementById('pgm-stream-resolution-select');
	      const fpsSelect = document.getElementById('pgm-stream-fps-select');
	      const bitrateInput = document.getElementById('pgm-stream-bitrate-input');
      const platform = String(platformSelect?.value || 'custom');
      const rawUrl = String(urlInput?.value || '').trim();
      const url = pgmStreamNormalizeUrl(platform, rawUrl);
      const key = String(keyInput?.value || '').trim();
      const protocol = pgmStreamInferProtocol(url, 'rtmps');
      if (!url) {
        showToast(t('stream_url_required'));
        return;
      }
      if (protocol !== 'srt' && !key) {
        showToast(t('stream_key_required'));
        return;
      }
      _pgmStreamState.config = {
        platform,
        url,
        key,
	        canvasResolution: String(canvasSelect?.value || '1920x1080'),
	        resolution: String(resolutionSelect?.value || '1920x1080'),
	        fps: Math.max(15, Math.min(60, Number(fpsSelect?.value || 30))),
	        bitrateKbps: Math.max(500, Math.min(20000, Number(bitrateInput?.value || 4500)))
	      };
      pgmStreamPersistConfig();
      pgmStreamRenderState();
      pgmStreamCloseSettings();
      showToast(t('stream_settings_saved'));
    }

    async function pgmStreamCheckReadiness() {
      if (!(window.BSPDesktop && typeof window.BSPDesktop.getStreamReadiness === 'function')) {
        _pgmStreamState.encoderReady = false;
        _pgmStreamState.encoderPath = '';
        pgmStreamRenderState();
        return false;
      }
      try {
        const ready = await window.BSPDesktop.getStreamReadiness();
        const ok = !!(ready && ready.ok !== false && ready.available !== false && ready.platformSupported !== false);
        _pgmStreamState.encoderReady = ok;
        _pgmStreamState.encoderPath = String(ready?.path || '');
        pgmStreamRenderState();
        return ok;
      } catch (e) {
        _pgmStreamState.encoderReady = false;
        _pgmStreamState.encoderPath = '';
        pgmStreamRenderState();
        return false;
      }
    }

    async function pgmStreamToggle() {
      if (_pgmStreamState.starting) return;
      if (!(window.BSPDesktop && typeof window.BSPDesktop.startStream === 'function')) {
        showToast(t('stream_backend_unavailable'));
        return;
      }

	      if (_pgmStreamState.running) {
	        _pgmStreamState.starting = true;
	        pgmStreamRenderState();
	        pgmStreamStopAudioPump();
	        await window.BSPDesktop.stopStream().catch(() => {});
	        _pgmStreamState.starting = false;
	        _pgmStreamState.running = false;
	        _pgmStreamState.status = 'idle';
          syncEmbeddedProgramDisplay();
	        pgmStreamRenderState();
        showToast(t('stream_projection_stopped'));
        return;
      }

      const ready = await pgmStreamCheckReadiness();
      if (!ready) {
        showToast(t('stream_encoder_not_ready'));
        return;
      }
      const cfg = _pgmStreamState.config;
      const url = pgmStreamNormalizeUrl(cfg.platform, cfg.url);
      const protocol = pgmStreamInferProtocol(url, 'rtmps');
      if (!url) {
        showToast(t('stream_configure_url'));
        return;
      }
      if (protocol !== 'srt' && !cfg.key) {
        showToast(t('stream_configure_key'));
        return;
      }
	      _pgmStreamState.starting = true;
	      _pgmStreamState.lastError = '';
	      pgmStreamRenderState();
	      const audioPumpOk = await pgmStreamStartAudioPump();
	      if (!audioPumpOk) {
	        _pgmStreamState.starting = false;
	        _pgmStreamState.running = false;
	        _pgmStreamState.status = 'error';
	        if (!_pgmStreamState.lastError) _pgmStreamState.lastError = 'Program mix audio not available.';
	        pgmStreamRenderState();
	        showToast(_pgmStreamState.lastError);
	        return;
	      }
	      try { syncStandaloneOutputDirect(); } catch (e) {}
	      try { queueStandaloneSyncBurst(); } catch (e) {}

      const payload = {
        sourceMode: 'projection',
        streamOwner: 'projection-extras',
        canvasResolution: cfg.canvasResolution || '1920x1080',
	        resolution: cfg.resolution || '1920x1080',
	        fps: Number(cfg.fps || 30),
	        bitrateKbps: Number(cfg.bitrateKbps || 4500),
	        audioFromRenderer: true,
	        streamProtocol: protocol,
	        targets: [{
          url,
          key: cfg.key || '',
          name: (_PGM_STREAM_PLATFORM_DEFAULTS[cfg.platform]?.name || 'Projection Stream'),
          protocol
        }]
      };

	      const resp = await window.BSPDesktop.startStream(payload).catch(() => ({ ok: false, error: 'Failed to start stream backend' }));
	      _pgmStreamState.starting = false;
	      if (!resp || !resp.ok) {
	        pgmStreamStopAudioPump();
	        _pgmStreamState.running = false;
	        _pgmStreamState.status = 'error';
	        _pgmStreamState.lastError = String(resp?.error || 'Failed to start stream');
        pgmStreamRenderState();
        showToast(`Streaming failed: ${_pgmStreamState.lastError}`);
        return;
      }
      _pgmStreamState.running = true;
      _pgmStreamState.status = 'starting';
      syncEmbeddedProgramDisplay();
      pgmStreamRenderState();
      showToast(t('stream_starting_projection'));
    }

    function pgmStreamHandleStatusEvent(status) {
      const st = status || {};
      const wasRunning = _pgmStreamState.running;
      _pgmStreamState.running = !!st.running && (st.status === 'starting' || st.status === 'live' || st.status === 'stopping');
      if (wasRunning !== _pgmStreamState.running) syncEmbeddedProgramDisplay();
      _pgmStreamState.status = String(st.status || (_pgmStreamState.running ? 'live' : 'idle'));
      if (st.ffmpegPath) {
        _pgmStreamState.encoderReady = true;
        _pgmStreamState.encoderPath = String(st.ffmpegPath || '');
      }
      if (st.ffmpegAvailable === false || st.platformSupported === false) {
        _pgmStreamState.encoderReady = false;
      }
      if (st.status === 'error' && st.lastError) {
        _pgmStreamState.lastError = String(st.lastError);
      } else if (st.status === 'idle') {
        _pgmStreamState.lastError = '';
      }
	      if (st.status !== 'starting') {
	        _pgmStreamState.starting = false;
	      }
	      if (!_pgmStreamState.running && st.status !== 'starting') {
	        pgmStreamStopAudioPump();
	      }
	      pgmStreamRenderState();
	    }

    async function initProjectionStreamingExtras() {
      pgmStreamLoadConfig();
      pgmStreamRenderState();
      await pgmStreamCheckReadiness();
      if (window.BSPDesktop && typeof window.BSPDesktop.onStreamStatus === 'function') {
        window.BSPDesktop.onStreamStatus((st) => {
          pgmStreamHandleStatusEvent(st);
        });
      }
      if (window.BSPDesktop && typeof window.BSPDesktop.getStreamStatus === 'function') {
        const st = await window.BSPDesktop.getStreamStatus().catch(() => null);
        if (st && st.ok) pgmStreamHandleStatusEvent(st);
      }
    }

    async function moveStandaloneOutputToSelectedScreen() {
      const opened = await openStandaloneOutputWindow({ moveAfterOpen: true });
      if (!opened) return;
      showToast(t('output_window_moved'));
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

    async function refreshCameraDevices() {
      const select = document.getElementById('camera-select');
      if (!select) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        if (!cameras.length) {
          select.innerHTML = '<option value="">No camera detected</option>';
          return;
        }
        const prev = select.value;
        select.innerHTML = cameras.map((cam, idx) =>
          `<option value="${cam.deviceId}">${esc(_sanitizeSourceDisplayLabel(cam.label, `Camera ${idx + 1}`))}</option>`
        ).join('');
        if (cameras.some(cam => cam.deviceId === prev)) select.value = prev;
      } catch (err) {
        select.innerHTML = '<option value="">Camera access unavailable</option>';
      }
    }

    async function startCameraPreview() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast(t('camera_preview_not_supported'));
        return;
      }
      const videoEl = document.getElementById('camera-preview');
      const select = document.getElementById('camera-select');
      const deviceId = select?.value || '';
      try {
        if (cameraPreviewStream) {
          cameraPreviewStream.getTracks().forEach(track => track.stop());
          cameraPreviewStream = null;
        }
        cameraPreviewStream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false
        });
        if (videoEl) {
          videoEl.srcObject = cameraPreviewStream;
          await videoEl.play().catch(() => {});
        }
        const btn = document.getElementById('camera-toggle-btn');
        if (btn) {
          btn.textContent = 'Stop Camera Preview';
          btn.style.background = 'var(--danger)';
        }
        await refreshCameraDevices();
      } catch (err) {
        showToast(t('camera_preview_failed').replace('{error}', err && err.message ? err.message : 'unknown error'));
      }
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

    async function toggleCameraPreview() {
      if (cameraPreviewStream) {
        stopCameraPreview();
        return;
      }
      await startCameraPreview();
    }

    function initStandaloneTools() {
      initEmbeddedProgramDisplay();
      initProjectionStreamingExtras().catch(() => {});
      syncLyricsOutputTypeButtons();
      refreshOutputScreenList().catch(() => {});
      refreshPgmOutputDevices().catch(() => {});
      if (hasDesktopOutputBridge() && typeof window.BSPDesktop.onOutputClosed === 'function') {
        window.BSPDesktop.onOutputClosed(() => {
          lyricsMonitorOutputOpen = false;
          setOutputLiveState(false);
        });
      }
      refreshCameraDevices().catch(() => {});
      if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', () => {
          refreshCameraDevices().catch(() => {});
          refreshPgmOutputDevices().catch(() => {});
          refreshOutputScreenList().catch(() => {});
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
