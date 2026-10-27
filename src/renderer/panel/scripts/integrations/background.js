    // ── Background tab ──────────────────────────────────────────────────────────
    // A silent video that loops on a screen of its own, for an LED wall behind the stage. The videos stay where
    // they are on disk (the app remembers where) and the wall window plays them through the local server.
    const BG_VIDEOS_KEY = 'scripturePod.bgVideos.v1';
    const BG_WALL_KEY = 'scripturePod.bgWall.v1';
    const bgWall = { playingId: '', url: '', blank: false, fit: 'cover', screenId: '', urls: {}, missing: {} };

    function loadBgVideos() { try { return JSON.parse(localStorage.getItem(BG_VIDEOS_KEY) || '[]'); } catch (e) { return []; } }
    function saveBgVideos(list) { try { localStorage.setItem(BG_VIDEOS_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
    try { Object.assign(bgWall, JSON.parse(localStorage.getItem(BG_WALL_KEY) || '{}'), { playingId: '', url: '', blank: false, urls: {}, missing: {} }); } catch (e) { /* defaults */ }
    function saveBgWallSettings() { try { localStorage.setItem(BG_WALL_KEY, JSON.stringify({ fit: bgWall.fit, screenId: bgWall.screenId })); } catch (e) { /* storage unavailable */ } }

    async function bgWallOpen() {
      try { return !!(window.BSPDesktop && await window.BSPDesktop.isWallOpen()); } catch (e) { return false; }
    }

    async function bgVideoUrl(item) {
      if (bgWall.urls[item.id]) return bgWall.urls[item.id];
      // The bridge throws the app's message when the file is gone or is not a video
      try {
        const r = await window.BSPDesktop.registerMediaFile({ path: item.path });
        if (r && r.url) { bgWall.urls[item.id] = r.url; delete bgWall.missing[item.id]; return r.url; }
        bgWall.missing[item.id] = (r && r.error) || 'Missing';
      } catch (e) {
        bgWall.missing[item.id] = (e && e.message) || 'Missing';
      }
      return '';
    }

    async function addBgVideos() {
      if (!window.BSPDesktop || typeof window.BSPDesktop.pickVideoFiles !== 'function') { showToast('Adding videos needs the desktop app'); return; }
      const r = await window.BSPDesktop.pickVideoFiles();
      const list = loadBgVideos();
      let added = 0;
      ((r && r.files) || []).forEach((f) => {
        if (list.some((x) => x.path === f.path)) return;
        list.push({ id: 'bg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), path: f.path, name: f.name || 'Video' });
        added++;
      });
      saveBgVideos(list);
      if (added) showToast(added === 1 ? 'Video added' : added + ' videos added');
      renderBackground();
    }

    function removeBgVideo(id) {
      if (bgWall.playingId === id) stopBgWall();
      saveBgVideos(loadBgVideos().filter((x) => x.id !== id));
      delete bgWall.urls[id];
      renderBackground();
    }

    async function playBgVideo(id) {
      const item = loadBgVideos().find((x) => x.id === id);
      if (!item) return;
      const url = await bgVideoUrl(item);
      if (!url) { showToast(bgWall.missing[id] || 'That video could not be played'); renderBackground(); return; }
      const B = window.BSPDesktop;
      bgWall.playingId = id; bgWall.url = url; bgWall.blank = false;
      if (await bgWallOpen()) await B.sendToWall({ type: 'WALL_SRC', url, fit: bgWall.fit });
      else await B.openWall({ displayId: bgWall.screenId, url, fit: bgWall.fit });
      renderBackground();
    }

    async function stopBgWall() {
      bgWall.playingId = ''; bgWall.url = ''; bgWall.blank = false;
      try { await window.BSPDesktop.closeWall(); } catch (e) { /* already closed */ }
      renderBackground();
    }

    async function setBgWallScreen(id) {
      bgWall.screenId = id; saveBgWallSettings();
      // Playing: move the wall to the new screen
      if (bgWall.url && await bgWallOpen()) await window.BSPDesktop.openWall({ displayId: id, url: bgWall.url, fit: bgWall.fit });
    }

    async function setBgWallFit(fit) {
      bgWall.fit = fit === 'contain' ? 'contain' : 'cover'; saveBgWallSettings();
      if (await bgWallOpen()) window.BSPDesktop.sendToWall({ type: 'WALL_FIT', fit: bgWall.fit });
    }

    async function toggleBgWallBlank() {
      bgWall.blank = !bgWall.blank;
      if (await bgWallOpen()) window.BSPDesktop.sendToWall({ type: 'BLANK_SCREEN', on: bgWall.blank });
      renderBackground();
    }

    async function renderBackground() {
      const host = document.getElementById('background-view');
      if (!host) return;
      const B = window.BSPDesktop;
      const open = await bgWallOpen();
      if (!open && bgWall.playingId) { bgWall.playingId = ''; bgWall.url = ''; }
      let screens = [];
      try { screens = (B && B.getDisplays ? await B.getDisplays() : []) || []; } catch (e) { /* no screens */ }
      const list = loadBgVideos();
      const sig = JSON.stringify([open, bgWall.playingId, bgWall.blank, bgWall.fit, bgWall.screenId, screens.map((s) => s.id + s.label), list.map((x) => x.id), Object.keys(bgWall.missing)]);
      if (host.dataset.sig === sig) return;
      if (host.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
      host.dataset.sig = sig;

      const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const btn = (label, title, fn, cls) => { const b = mk('button', 'bg-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (title) b.title = title; b.onclick = fn; return b; };
      host.textContent = '';
      const head = mk('div', 'bg-head');
      head.appendChild(mk('h1', '', 'Background'));
      head.appendChild(mk('p', '', 'A video that plays on a screen of its own, looping and without sound. Use it for an LED wall behind the stage.'));
      host.appendChild(head);

      // Wall controls
      const wall = mk('div', 'bg-wall');
      const top = mk('div', 'bg-wall-top');
      const playing = list.find((x) => x.id === bgWall.playingId);
      top.appendChild(mk('span', 'bg-pill' + (open && !bgWall.blank ? ' is-on' : ''), open ? (bgWall.blank ? 'BLANK' : 'PLAYING') : 'STOPPED'));
      top.appendChild(mk('strong', '', playing ? playing.name : 'No video playing'));
      wall.appendChild(top);
      const controls = mk('div', 'bg-controls');
      const scr = mk('select');
      scr.setAttribute('aria-label', 'Screen for the background');
      scr.appendChild(new Option('Screen: automatic', ''));
      screens.forEach((s, i) => scr.appendChild(new Option(`${s.label || 'Screen ' + (i + 1)} · ${s.width}×${s.height}`, String(s.id))));
      scr.value = bgWall.screenId;
      scr.onchange = () => setBgWallScreen(scr.value);
      controls.appendChild(scr);
      const fit = mk('select');
      fit.setAttribute('aria-label', 'How the video fills the screen');
      fit.appendChild(new Option('Fill the screen (crop edges)', 'cover'));
      fit.appendChild(new Option('Fit inside (black bars)', 'contain'));
      fit.value = bgWall.fit;
      fit.onchange = () => setBgWallFit(fit.value);
      controls.appendChild(fit);
      if (open) {
        controls.appendChild(btn(bgWall.blank ? 'Show' : 'Blank', 'Black out the wall without stopping the video', toggleBgWallBlank));
        controls.appendChild(btn('Stop', 'Close the background screen', stopBgWall, 'is-stop'));
      }
      controls.appendChild(btn('Identify screens', 'Show a number on every screen', () => B && B.identifyScreens && B.identifyScreens()));
      wall.appendChild(controls);
      host.appendChild(wall);

      // Library
      const libHead = mk('div', 'bg-lib-head');
      libHead.appendChild(mk('h2', '', 'Videos'));
      libHead.appendChild(btn('Add videos', 'Choose video files from this computer', addBgVideos, 'is-primary'));
      host.appendChild(libHead);
      const grid = mk('div', 'bg-grid');
      if (!list.length) grid.appendChild(mk('div', 'bg-empty', 'No videos yet. Add an mp4, mov or webm file; it stays where it is and is not copied.'));
      for (const item of list) {
        const card = mk('div', 'bg-card' + (item.id === bgWall.playingId ? ' is-playing' : ''));
        const thumb = mk('div', 'bg-thumb');
        const url = await bgVideoUrl(item).catch(() => '');
        if (url) {
          const v = document.createElement('video');
          v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = url + '#t=1';
          thumb.appendChild(v);
        } else thumb.appendChild(mk('span', '', bgWall.missing[item.id] || 'Missing'));
        card.appendChild(thumb);
        card.appendChild(mk('div', 'bg-name', item.name));
        const row = mk('div', 'bg-card-actions');
        row.appendChild(btn(item.id === bgWall.playingId ? 'Playing' : 'Play on wall', '', () => playBgVideo(item.id), 'is-primary'));
        row.appendChild(btn('Remove', 'Take it off this list (the file is kept)', () => removeBgVideo(item.id)));
        card.appendChild(row);
        grid.appendChild(card);
      }
      host.appendChild(grid);
    }

    function openBackgroundWorkspace() {
      document.body.classList.remove('overlays-workspace-active', 'displays-workspace-active');
      document.body.classList.add('background-workspace-active');
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-background'));
      if (typeof updateBottomNavSidebarButtons === 'function') updateBottomNavSidebarButtons('background');
      const host = document.getElementById('background-view');
      if (host) host.dataset.sig = '';
      renderBackground();
    }
    setInterval(() => { if (document.body.classList.contains('background-workspace-active')) renderBackground(); }, 2000);
