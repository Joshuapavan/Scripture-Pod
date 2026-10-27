    // ── Displays workspace ──────────────────────────────────────────────────────
    // Every display that is being output, how it is projected and whether it is live. It fills the Displays tab
    // and can be popped out into its own window for another monitor (both drawn by src/shared/displays-view.js).
    let displaysPopoutOpen = false;
    let displaysTimer = 0;

    function htmlToPlain(html) {
      const box = document.createElement('div');
      box.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, ' ');
      return (box.textContent || '').replace(/\s+/g, ' ').trim();
    }

    async function buildDisplaysSnapshot() {
      const B = window.BSPDesktop;
      let screens = [];
      try { screens = (B && B.getDisplays ? await B.getDisplays() : []) || []; } catch (e) { /* no screens */ }
      const labelOf = (id) => { const s = screens.find((x) => String(x.id) === String(id)); return s ? `${s.label || 'Screen'} · ${s.width}×${s.height}` : ''; };
      let payload = null;
      try { payload = typeof getOnAirPayload === 'function' ? getOnAirPayload() : null; } catch (e) { /* nothing live */ }
      const isBible = !!(typeof livePointer !== 'undefined' && livePointer && livePointer.kind === 'bible');
      const onAir = {
        live: !!payload,
        kind: payload ? (isBible ? 'bible' : 'lyrics') : '',
        ref: payload ? (payload.bibleRef || (typeof liveItem !== 'undefined' && liveItem && liveItem.title) || '') : '',
        text: payload ? htmlToPlain(payload.text) : ''
      };
      if (onAir.live && !onAir.ref) onAir.ref = onAir.text;
      const displays = [];
      // The two monitors inside the app: Program (what is on air) and Preview (what is cued)
      let cued = false, cuedText = '';
      try {
        cued = typeof previewMonitorState !== 'undefined' && previewMonitorState.kind === 'update' && !!previewMonitorState.payload;
        if (cued) { const pp = previewMonitorState.payload; cuedText = pp.bibleRef || htmlToPlain(pp.text); }
      } catch (e) { /* no preview */ }
      displays.push({ key: 'p:program', kind: 'program', thumb: 'program', role: 'live', name: 'Program monitor', where: 'In this app', open: true });
      displays.push({ key: 'p:preview', kind: 'preview', thumb: 'preview', role: 'monitor', name: 'Preview monitor', where: 'In this app', open: true, cued, showing: cuedText });
      const rows = await collectConnectedDisplays();
      const roleOf = { output: 'monitor', feed: 'live', stage: 'stage' };
      for (const slot of OUTPUT_SLOTS) {
        const row = rows.find((r) => r.key === 'w:' + slot.label);
        const screenId = slotScreenId(slot);
        displays.push({ key: 'w:' + slot.label, kind: slot.label === 'output' ? 'main' : slot.label, thumb: { output: 'monitor', feed: 'live', stage: 'stage' }[slot.label], role: roleOf[slot.label], name: slot.name, where: 'This computer',
          open: !!row, screenId, screenLabel: row ? labelOf(screenId) : '', blank: blankedDisplays.has('w:' + slot.label),
          canBlank: true, canClose: true, canMove: true });
      }
      rows.filter((r) => !String(r.key || '').startsWith('w:')).forEach((r) => {
        displays.push({ key: r.key || ('o:' + r.name), kind: r.kind || 'other', thumb: r.key ? ({ monitor: 'monitor', stage: 'stage' }[r.role] || 'live') : '', role: r.role || 'live', name: r.name, where: r.meta, open: true,
          blank: blankedDisplays.has(r.key), canBlank: !!r.key, canClose: typeof r.close === 'function', closeLabel: r.closeLabel });
      });
      return { onAir, previewOnly: typeof isPreviewOnlyMode === 'function' && isPreviewOnlyMode(), screens, displays };
    }

    // What each kind of display is projecting right now, as the payload its page would receive
    const displayFeedIds = new WeakMap();
    let displayFeedCounter = 0;
    const feedId = (o) => { if (!o || typeof o !== 'object') return 0; if (!displayFeedIds.has(o)) displayFeedIds.set(o, ++displayFeedCounter); return displayFeedIds.get(o); };
    function buildDisplayFeeds() {
      let raw = null;
      try { raw = typeof getOnAirPayload === 'function' ? getOnAirPayload() : null; } catch (e) { /* nothing live */ }
      let cued = null;
      try { cued = (typeof previewMonitorState !== 'undefined' && previewMonitorState.kind === 'update') ? previewMonitorState.payload : null; } catch (e) { /* no preview */ }
      const key = [feedId(raw), feedId(cued), typeof bgOpacityLT !== 'undefined' ? bgOpacityLT : '', typeof bgOpacityFull !== 'undefined' ? bgOpacityFull : ''].join('|');
      return { key, feeds: {
        program: raw, preview: cued,
        live: raw ? forOutput(raw) : null, monitor: raw ? forMonitor(raw) : null,
        stage: raw ? { stage: raw.stage || null } : null
      } };
    }
    // Large pictures and fonts stay out of the message to the pop-out window
    function lightFeeds(feeds) {
      const out = {};
      Object.keys(feeds).forEach((k) => {
        const p = feeds[k];
        if (!p || typeof p !== 'object') { out[k] = p; return; }
        const copy = { ...p };
        Object.keys(copy).forEach((f) => { if (typeof copy[f] === 'string' && copy[f].length > 200000) copy[f] = null; });
        if (copy.customFonts) copy.customFonts = null;
        out[k] = copy;
      });
      return out;
    }
    let displaysThumbHtml = '';
    const thumbPage = () => (displaysThumbHtml = displaysThumbHtml || buildStandaloneDisplayHtml({ preview: true }));
    let lastDisplayFeedKey = '';
    let lastPopoutFeedKey = '';
    let popoutThumbSent = false;

    async function refreshDisplaysView() {
      const workspaceOn = document.body.classList.contains('displays-workspace-active');
      if (!workspaceOn && !displaysPopoutOpen) return;
      const snap = await buildDisplaysSnapshot();
      const { key: feedKey, feeds } = buildDisplayFeeds();
      if (workspaceOn) {
        const host = document.getElementById('displays-view');
        if (host && window.SP_DISPLAYS_VIEW) {
          window.SP_DISPLAYS_VIEW.render(host, snap, { act: window.__spDisplaysAction, canPopOut: !displaysPopoutOpen, thumbHtml: thumbPage() });
          if (feedKey !== lastDisplayFeedKey) { lastDisplayFeedKey = feedKey; window.SP_DISPLAYS_VIEW.setFeeds(host, feeds); }
        }
      }
      if (displaysPopoutOpen && window.BSPDesktop && window.BSPDesktop.sendToDisplays) {
        const B = window.BSPDesktop;
        if (!popoutThumbSent) {
          const sent = await B.sendToDisplays({ type: 'DISPLAYS_THUMBHTML', html: thumbPage() }).catch(() => null);
          popoutThumbSent = !!(sent && sent.ok);
        }
        const ok = await B.sendToDisplays({ type: 'DISPLAYS_SNAPSHOT', snapshot: snap }).catch(() => null);
        if (ok && ok.ok === false) { displaysPopoutOpen = false; popoutThumbSent = false; }
        else if (feedKey !== lastPopoutFeedKey) {
          lastPopoutFeedKey = feedKey;
          B.sendToDisplays({ type: 'DISPLAYS_FEEDS', feeds: lightFeeds(feeds) }).catch(() => {});
        }
      }
    }

    async function openDisplaysWindow() {
      const B = window.BSPDesktop;
      if (!B || typeof B.openDisplays !== 'function') { showToast('The pop-out window needs the desktop app'); return; }
      // Another monitor when there is one, so the window lands away from the panel
      let displayId = '';
      try { const s = (await B.getDisplays()) || []; const other = s.find((x) => !x.isPrimary); if (other) displayId = String(other.id); } catch (e) { /* default */ }
      await B.openDisplays(displayId ? { displayId } : {});
      displaysPopoutOpen = true;
      refreshDisplaysView();
    }

    function openDisplaysWorkspace() {
      document.body.classList.add('displays-workspace-active');
      document.body.classList.remove('overlays-workspace-active');
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-displays'));
      if (typeof updateBottomNavSidebarButtons === 'function') updateBottomNavSidebarButtons('displays');
      refreshDisplaysView();
    }

    // Actions from the view, whether it is in the panel or in the pop-out window
    window.__spDisplaysAction = async function (a) {
      try {
        if (!a || !a.action) return;
        if (a.action === 'ready') { displaysPopoutOpen = true; popoutThumbSent = false; lastPopoutFeedKey = ''; await refreshDisplaysView(); return; }
        if (a.action === 'identify') { if (window.BSPDesktop.identifyScreens) window.BSPDesktop.identifyScreens(); return; }
        if (a.action === 'popout') { await openDisplaysWindow(); return; }
        const rows = await collectConnectedDisplays();
        const row = rows.find((r) => r.key === a.key);
        const slot = OUTPUT_SLOTS.find((x) => 'w:' + x.label === a.key);
        if (a.action === 'blank') {
          const target = row || (slot ? { key: a.key, label: slot.label } : null);
          if (target) setDisplayBlank(target, !!a.on);
        } else if (a.action === 'close' && row && typeof row.close === 'function') {
          await row.close();
          blankedDisplays.delete(a.key);
        } else if (a.action === 'move' && slot) {
          await moveOutputToScreen(slot, String(a.screenId));
        }
        setTimeout(refreshDisplaysView, 300);
      } catch (e) { console.error('Displays action failed', e); }
    };

    displaysTimer = setInterval(() => {
      if (displaysPopoutOpen && window.BSPDesktop && window.BSPDesktop.isDisplaysOpen) {
        window.BSPDesktop.isDisplaysOpen().then((open) => { if (!open) displaysPopoutOpen = false; }).catch(() => {});
      }
      refreshDisplaysView();
    }, 1500);
