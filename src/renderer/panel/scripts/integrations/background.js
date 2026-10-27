    // ── Background tab ──────────────────────────────────────────────────────────
    // Silent videos that loop on a screen of their own, for an LED wall behind the stage: one video, or a playlist
    // that fades from one video into the next. The videos stay where they are on disk (the app remembers where) and
    // the wall window plays them through the local server. If the wall's screen is unplugged the window closes and
    // comes back when the screen does.
    const BG_VIDEOS_KEY = 'scripturePod.bgVideos.v1';
    const BG_WALL_KEY = 'scripturePod.bgWall.v1';
    const bgWall = {
      fit: 'cover', fade: 2, screenId: '', playlist: [], last: [], autostart: false,
      // runtime
      desired: null, playingIds: [], playingId: '', playingName: '', url: '', blank: false, dropped: false, urls: {}, missing: {}
    };

    function loadBgVideos() { try { return JSON.parse(localStorage.getItem(BG_VIDEOS_KEY) || '[]'); } catch (e) { return []; } }
    function saveBgVideos(list) { try { localStorage.setItem(BG_VIDEOS_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
    try {
      const saved = JSON.parse(localStorage.getItem(BG_WALL_KEY) || '{}');
      ['fit', 'fade', 'screenId', 'playlist', 'last', 'autostart'].forEach((k) => { if (saved[k] != null) bgWall[k] = saved[k]; });
    } catch (e) { /* defaults */ }
    function saveBgWallSettings() {
      try {
        localStorage.setItem(BG_WALL_KEY, JSON.stringify({ fit: bgWall.fit, fade: bgWall.fade, screenId: bgWall.screenId, playlist: bgWall.playlist, last: bgWall.last, autostart: bgWall.autostart }));
      } catch (e) { /* storage unavailable */ }
    }

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
      if (bgWall.playingIds.includes(id)) stopBgWall();
      saveBgVideos(loadBgVideos().filter((x) => x.id !== id));
      bgWall.playlist = bgWall.playlist.filter((x) => x !== id);
      bgWall.last = bgWall.last.filter((x) => x !== id);
      delete bgWall.urls[id];
      saveBgWallSettings();
      renderBackground();
    }

    function toggleBgPlaylist(id) {
      bgWall.playlist = bgWall.playlist.includes(id) ? bgWall.playlist.filter((x) => x !== id) : [...bgWall.playlist, id];
      saveBgWallSettings();
      renderBackground();
    }

    function moveBgPlaylist(id, step) {
      const list = bgWall.playlist.slice();
      const at = list.indexOf(id);
      const to = at + step;
      if (at < 0 || to < 0 || to >= list.length) return;
      [list[at], list[to]] = [list[to], list[at]];
      bgWall.playlist = list;
      saveBgWallSettings();
      renderBackground();
    }

    // Play these videos in order, looping; two or more fade into each other
    async function startBgWall(ids, opts = {}) {
      const items = ids.map((id) => loadBgVideos().find((x) => x.id === id)).filter(Boolean);
      const urls = [];
      const used = [];
      for (const item of items) {
        const url = await bgVideoUrl(item);
        if (url) { urls.push(url); used.push(item); }
      }
      if (!urls.length) { if (!opts.quiet) showToast(items.length ? 'Those videos could not be played' : 'Choose a video first'); renderBackground(); return false; }
      const B = window.BSPDesktop;
      bgWall.desired = used.map((x) => x.id);
      bgWall.playingIds = bgWall.desired.slice();
      bgWall.playingId = used[0].id;
      bgWall.playingName = used.length > 1 ? `Playlist: ${used.map((x) => x.name).join(' → ')}` : used[0].name;
      bgWall.url = urls[0];
      bgWall.blank = false;
      bgWall.dropped = false;
      bgWall.last = bgWall.desired.slice();
      saveBgWallSettings();
      if (await bgWallOpen()) await B.sendToWall({ type: 'WALL_SRC', urls, fit: bgWall.fit, fade: bgWall.fade });
      else await B.openWall({ displayId: bgWall.screenId, urls, fit: bgWall.fit, fade: bgWall.fade });
      renderBackground();
      return true;
    }

    const playBgVideo = (id) => startBgWall([id]);
    const playBgPlaylist = () => startBgWall(bgWall.playlist);
    const resumeBgWall = () => startBgWall(bgWall.last);

    async function stopBgWall() {
      bgWall.desired = null; bgWall.playingIds = []; bgWall.playingId = ''; bgWall.playingName = ''; bgWall.url = ''; bgWall.blank = false; bgWall.dropped = false;
      bgWall.stopping = true;
      try { await window.BSPDesktop.closeWall(); } catch (e) { /* already closed */ }
      bgWall.stopping = false;
      renderBackground();
    }

    async function setBgWallScreen(id) {
      bgWall.screenId = id; saveBgWallSettings();
      // Playing: move the wall to the new screen
      if (bgWall.desired) await startBgWall(bgWall.desired, { quiet: true });
    }

    async function setBgWallFit(fit) {
      bgWall.fit = fit === 'contain' ? 'contain' : 'cover'; saveBgWallSettings();
      if (await bgWallOpen()) window.BSPDesktop.sendToWall({ type: 'WALL_FIT', fit: bgWall.fit });
    }

    async function setBgWallFade(sec) {
      bgWall.fade = Number(sec) || 0; saveBgWallSettings();
      // The fade is read when the list starts, so a playing list restarts with the new fade
      if (bgWall.desired && bgWall.desired.length > 1) await startBgWall(bgWall.desired, { quiet: true });
    }

    function setBgWallAutostart(on) { bgWall.autostart = !!on; saveBgWallSettings(); }

    async function toggleBgWallBlank() {
      bgWall.blank = !bgWall.blank;
      if (await bgWallOpen()) window.BSPDesktop.sendToWall({ type: 'BLANK_SCREEN', on: bgWall.blank });
      renderBackground();
    }

    // Watches the wall: when its screen is unplugged the window closes (so the video never lands on the wrong screen)
    // and the same videos start again on that screen when it returns
    async function watchBgWall() {
      const B = window.BSPDesktop;
      if (!B || !bgWall.desired || bgWall.stopping || bgWall.recovering) return;
      bgWall.recovering = true;
      try {
        const screens = (await B.getDisplays()) || [];
        const present = !bgWall.screenId || screens.some((s) => String(s.id) === String(bgWall.screenId));
        const open = await bgWallOpen();
        if (open && !present) {
          await B.closeWall();
          bgWall.dropped = true;
          showToast('Background screen disconnected. It starts again when the screen is back.');
        } else if (!open && present) {
          const wasDropped = bgWall.dropped;
          await startBgWall(bgWall.desired, { quiet: true });
          if (wasDropped) showToast('Background screen is back, playing again.');
        }
      } catch (e) { /* the app bridge is not ready */ }
      bgWall.recovering = false;
    }
    setInterval(watchBgWall, 3000);
    // Start by itself when the app opens, if that is switched on
    setTimeout(() => { if (bgWall.autostart && bgWall.last.length && !bgWall.desired) startBgWall(bgWall.last, { quiet: true }); }, 7000);

    async function renderBackground() {
      const host = document.getElementById('background-view');
      if (!host) return;
      const B = window.BSPDesktop;
      const open = await bgWallOpen();
      let screens = [];
      try { screens = (B && B.getDisplays ? await B.getDisplays() : []) || []; } catch (e) { /* no screens */ }
      const list = loadBgVideos();
      const sig = JSON.stringify([open, bgWall.playingIds, bgWall.blank, bgWall.fit, bgWall.fade, bgWall.screenId, bgWall.playlist, bgWall.autostart, bgWall.dropped, screens.map((s) => s.id + s.label), list.map((x) => x.id), Object.keys(bgWall.missing)]);
      if (host.dataset.sig === sig) return;
      if (host.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
      host.dataset.sig = sig;

      const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const btn = (label, title, fn, cls) => { const b = mk('button', 'bg-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (title) b.title = title; b.onclick = fn; return b; };
      host.textContent = '';
      const head = mk('div', 'bg-head');
      head.appendChild(mk('h1', '', 'Background'));
      head.appendChild(mk('p', '', 'Videos that play on a screen of their own, looping and without sound. Use them for an LED wall behind the stage.'));
      host.appendChild(head);

      // Wall controls
      const wall = mk('div', 'bg-wall');
      const top = mk('div', 'bg-wall-top');
      const state = bgWall.dropped ? 'WAITING FOR SCREEN' : (open ? (bgWall.blank ? 'BLANK' : 'PLAYING') : 'STOPPED');
      top.appendChild(mk('span', 'bg-pill' + (open && !bgWall.blank ? ' is-on' : ''), state));
      top.appendChild(mk('strong', '', bgWall.playingName || (bgWall.dropped ? 'The background screen is not connected' : 'No video playing')));
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
      } else if (bgWall.last.length && !bgWall.dropped) {
        controls.appendChild(btn('Play last again', 'Start what played last time', resumeBgWall, 'is-primary'));
      }
      controls.appendChild(btn('Identify screens', 'Show a number on every screen', () => B && B.identifyScreens && B.identifyScreens()));
      wall.appendChild(controls);
      const auto = mk('label', 'bg-auto');
      const autoBox = document.createElement('input');
      autoBox.type = 'checkbox'; autoBox.checked = !!bgWall.autostart;
      autoBox.onchange = () => setBgWallAutostart(autoBox.checked);
      auto.append(autoBox, document.createTextNode(' Start the last video when the app opens'));
      wall.appendChild(auto);
      host.appendChild(wall);

      // Playlist
      const names = Object.fromEntries(list.map((x) => [x.id, x.name]));
      const plist = mk('div', 'bg-wall');
      const ptop = mk('div', 'bg-wall-top');
      ptop.appendChild(mk('strong', '', 'Playlist'));
      ptop.appendChild(mk('span', 'bg-note', bgWall.playlist.length ? `${bgWall.playlist.length} video${bgWall.playlist.length === 1 ? '' : 's'}, played in this order and repeated` : 'Add videos below with "+ Playlist"'));
      plist.appendChild(ptop);
      if (bgWall.playlist.length) {
        const chips = mk('div', 'bg-chips');
        bgWall.playlist.forEach((id, n) => {
          const chip = mk('span', 'bg-chip');
          chip.appendChild(mk('i', '', String(n + 1)));
          chip.appendChild(document.createTextNode(names[id] || 'Missing'));
          const l = btn('◀', 'Earlier', () => moveBgPlaylist(id, -1), 'is-tiny');
          const r = btn('▶', 'Later', () => moveBgPlaylist(id, 1), 'is-tiny');
          const x = btn('×', 'Take it out of the playlist', () => toggleBgPlaylist(id), 'is-tiny');
          chip.append(l, r, x);
          chips.appendChild(chip);
        });
        plist.appendChild(chips);
        const prow = mk('div', 'bg-controls');
        prow.appendChild(btn('Play playlist', 'Play these videos in order', playBgPlaylist, 'is-primary'));
        if (bgWall.playlist.length > 1) {
          const fade = mk('select');
          fade.setAttribute('aria-label', 'Fade between videos');
          [['0', 'Cut (no fade)'], ['1', 'Fade 1 second'], ['2', 'Fade 2 seconds'], ['3', 'Fade 3 seconds'], ['5', 'Fade 5 seconds']].forEach(([v, l]) => fade.appendChild(new Option(l, v)));
          fade.value = String(bgWall.fade);
          fade.onchange = () => setBgWallFade(fade.value);
          prow.appendChild(fade);
        }
        plist.appendChild(prow);
      }
      host.appendChild(plist);

      // Library
      const libHead = mk('div', 'bg-lib-head');
      libHead.appendChild(mk('h2', '', 'Videos'));
      libHead.appendChild(btn('Add videos', 'Choose video files from this computer', addBgVideos, 'is-primary'));
      host.appendChild(libHead);
      const grid = mk('div', 'bg-grid');
      if (!list.length) grid.appendChild(mk('div', 'bg-empty', 'No videos yet. Add an mp4, mov or webm file; it stays where it is and is not copied.'));
      for (const item of list) {
        const isPlaying = bgWall.playingIds.includes(item.id);
        const card = mk('div', 'bg-card' + (isPlaying ? ' is-playing' : ''));
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
        row.appendChild(btn(isPlaying && bgWall.playingIds.length === 1 ? 'Playing' : 'Play on wall', '', () => playBgVideo(item.id), 'is-primary'));
        row.appendChild(btn(bgWall.playlist.includes(item.id) ? '✓ Playlist' : '+ Playlist', 'Add to or take out of the playlist', () => toggleBgPlaylist(item.id)));
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
