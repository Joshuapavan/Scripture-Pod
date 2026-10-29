    // ── Phone remote ──────────────────────────────────────────────────────────────
    // A page served by this app (/remote.html) lets a phone on the same network press Next, Previous,
    // Go live and Clear. The commands wait in the app, and this panel picks them up and runs them.
    // The phone also sees what is on screen now and what comes next.
    let phoneRemoteTimer = null;
    let phoneRemoteLastState = '';

    // What the phone shows: the section it is in, a small picture of what is on air (or cued), the slides
    // of the open song or chapter, and what comes next
    let phoneRemoteRefResult = '';
    // The displays and the background wall as the phone sees them, refreshed every second or so
    let phoneDisplaysCache = [];
    let phoneDisplaysAt = 0;
    function refreshPhoneDisplays() {
      if (typeof buildDisplaysSnapshot !== 'function' || Date.now() - phoneDisplaysAt < 1500) return;
      phoneDisplaysAt = Date.now();
      buildDisplaysSnapshot().then((snap) => {
        const onAir = !!(snap.onAir && snap.onAir.live);
        phoneDisplaysCache = (snap.displays || []).map((d) => ({
          key: d.key, name: d.name, open: !!d.open, blank: !!d.blank, canBlank: !!d.canBlank && d.kind !== 'wall', live: onAir && d.kind !== 'wall' && d.kind !== 'preview'
        }));
        phoneDisplaysCache.wallOpen = (snap.displays || []).some((d) => d.kind === 'wall' && d.open);
      }).catch(() => {});
    }
    function remoteWallState() {
      if (typeof bgWall === 'undefined' || typeof loadBgVideos !== 'function') return null;
      return {
        open: !!phoneDisplaysCache.wallOpen, name: bgWall.playingName || '', blank: !!bgWall.blank,
        videos: loadBgVideos().slice(0, 30).map((v) => ({ id: v.id, name: String(v.name || 'Video').slice(0, 40) })),
        playingIds: bgWall.playingIds || [], hasPlaylist: (bgWall.playlist || []).length > 0, canResume: (bgWall.last || []).length > 0
      };
    }
    function remoteFeedFrom(p, isBible) {
      if (!p) return null;
      const plain = (html) => { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n'); return (d.textContent || '').replace(/[ \t]+\n/g, '\n').trim(); };
      return {
        mode: p.mode === 'lt' || p.forceLt ? 'lt' : 'full',
        text: plain(p.text).slice(0, 400), ref: isBible ? String(p.bibleRef || '') : '',
        bg: p.bgEnabled === false ? '#000' : (p.bgColor || '#000'), color: p.textColor || '#fff', font: p.fontFamily || ''
      };
    }

    function remoteStateNow() {
      try {
        const p = lastLiveState && lastLiveState.kind === 'update' ? lastLiveState.payload : null;
        const st = p && p.stage ? p.stage : null;
        const liveNow = !!(isLive && p);
        const liveIsBible = !!(livePointer && livePointer.kind === 'bible');
        const section = ['bible', 'songs', 'schedule'].includes(sidebarTab) ? sidebarTab : 'other';
        const cuedPayload = (typeof previewMonitorState !== 'undefined' && previewMonitorState.kind === 'update') ? previewMonitorState.payload : null;
        const isBibleItem = currentItem && typeof getIsBibleItem === 'function' ? getIsBibleItem(currentItem) : section === 'bible';
        let slides = [];
        if (currentItem) {
          slides = (getPagesFromItem(currentItem, isBibleItem) || []).slice(0, 80).map((pg) => ({
            t: String(pg.raw || pg.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90),
            tag: pg.tag && !isBibleItem ? String(pg.tag).slice(0, 10) : ''
          }));
        }
        // The open song or chapter is the one on air when the live pointer is on the same list entry
        const liveSame = liveNow && livePointer && currentItem && livePointer.index === currentIndex && liveIsBible === isBibleItem;
        return {
          live: liveNow, section,
          title: liveNow && st ? [st.title, st.ref].filter(Boolean).join(' · ') : (currentItem ? (currentItem.title || '') : ''),
          itemTitle: currentItem ? (currentItem.title || '') : '',
          current: liveNow && st ? st.current || '' : '', next: liveNow && st ? st.next || '' : '',
          feed: liveNow ? remoteFeedFrom(p, liveIsBible) : null,
          cued: cuedPayload ? remoteFeedFrom(cuedPayload, !!(cuedPayload.bibleRef)) : null,
          slides, cursor: lineCursor, liveIndex: liveSame ? liveLineCursor : -1,
          refResult: phoneRemoteRefResult,
          displays: phoneDisplaysCache.map((d) => ({ ...d })), wall: remoteWallState(),
          locked: typeof serviceLockOn === 'function' && serviceLockOn()
        };
      } catch (e) { return { live: false, section: 'other', title: '', current: '', next: '', slides: [] }; }
    }

    // A command with a value: jump to a slide, open a section, look up a spoken or typed reference
    function runPhoneRemoteValueAction(entry) {
      const [kind, ...rest] = entry.split(':');
      const value = rest.join(':');
      if (kind === 'goto') {
        const i = Number(value);
        if (!currentItem || !Number.isFinite(i)) return;
        const pages = getPagesFromItem(currentItem, typeof getIsBibleItem === 'function' ? getIsBibleItem(currentItem) : sidebarTab === 'bible') || [];
        if (i < 0 || i >= pages.length) return;
        lineCursor = i;
        if (isLive && livePointer) liveLineCursor = i;
        updateButtonView();
        if (isLive && livePointer) { if (!pushLiveUpdate()) projectLive(true); }
        saveToStorageDebounced();
      } else if (kind === 'tab') {
        if (['bible', 'songs', 'schedule'].includes(value)) setSidebarTab(value);
      } else if (kind === 'blank') {
        // Blank or show one display from the phone
        const d = phoneDisplaysCache.find((x) => x.key === value);
        if (d && typeof window.__spDisplaysAction === 'function') window.__spDisplaysAction({ action: 'blank', key: value, on: !d.blank });
      } else if (kind === 'wall') {
        if (value === 'stop') stopBgWall();
        else if (value === 'blank') toggleBgWallBlank();
        else if (value === 'playlist') playBgPlaylist();
        else if (value === 'resume') resumeBgWall();
        else if (value.startsWith('play:')) playBgVideo(value.slice(5));
      } else if (kind === 'ref') {
        const ref = window.SP_SPOKEN_REF ? window.SP_SPOKEN_REF.spokenToReference(value) : null;
        if (!ref) { phoneRemoteRefResult = 'Did not understand: ' + value; return; }
        const parsed = parseBibleReferenceQuery(ref);
        if (!parsed || !activeBibleVersion || !findBibleReferenceChapter(activeBibleVersion, parsed)) { phoneRemoteRefResult = 'Not found: ' + ref; return; }
        openPassageFromPalette(ref);
        phoneRemoteRefResult = 'Opened ' + ref + ' (press Go live)';
        setTimeout(() => { phoneRemoteRefResult = ''; }, 6000);
      }
    }

    async function runPhoneRemoteTick() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.pollRemote !== 'function') return;
      refreshPhoneDisplays();
      const actions = await bridge.pollRemote().catch(() => []);
      (actions || []).forEach((id) => {
        try {
          if (id.includes(':')) runPhoneRemoteValueAction(id);
          else if (typeof runShortcutAction === 'function') runShortcutAction(id);
        } catch (e) { console.error('Remote action failed', id, e); }
      });
      const state = JSON.stringify(remoteStateNow());
      if (state !== phoneRemoteLastState) { phoneRemoteLastState = state; bridge.setRemoteState(JSON.parse(state)).catch(() => {}); }
    }

    function updatePhoneRemoteQr(url) {
      const img = document.getElementById('phone-remote-qr');
      if (!img) return;
      const encoder = window.qrcode;
      if (typeof encoder !== 'function' || !url) { img.removeAttribute('src'); return; }
      try { const qr = encoder(0, 'M'); qr.addData(url); qr.make(); img.src = qr.createDataURL(5, 0); } catch (e) { img.removeAttribute('src'); }
    }

    async function refreshPhoneRemoteUi() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.getRemote !== 'function') return;
      const r = await bridge.getRemote().catch(() => null);
      if (!r) return;
      const toggle = document.getElementById('phone-remote-toggle'); if (toggle) toggle.checked = !!r.enabled;
      const details = document.getElementById('phone-remote-details'); if (details) details.hidden = !r.enabled;
      const chosen = (typeof localServerInfo !== 'undefined' && localServerInfo && localServerInfo.preferredHost) || '';
      const url = (r.urls || []).find((u) => chosen && u.includes('//' + chosen + ':')) || (r.urls || [])[0] || '';
      const input = document.getElementById('phone-remote-url'); if (input) input.value = url;
      if (r.enabled) updatePhoneRemoteQr(url);
      if (r.enabled && !phoneRemoteTimer) phoneRemoteTimer = setInterval(runPhoneRemoteTick, 400);
      if (!r.enabled && phoneRemoteTimer) { clearInterval(phoneRemoteTimer); phoneRemoteTimer = null; }
    }
    async function setPhoneRemoteEnabled(on) {
      await window.BSPDesktop.setRemoteEnabled({ enabled: !!on });
      phoneRemoteLastState = '';
      refreshPhoneRemoteUi();
    }
    async function copyPhoneRemoteUrl() {
      const url = document.getElementById('phone-remote-url')?.value || '';
      if (!url) return;
      try { await window.BSPDesktop.copyText(url); showToast('Link copied'); } catch (e) { showToast('Could not copy'); }
    }
    (function initPhoneRemote() {
      const start = () => { refreshPhoneRemoteUi(); setInterval(() => { if (document.getElementById('outputs-card')?.classList.contains('is-open')) refreshPhoneRemoteUi(); }, 3000); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
