    // ── Media tab ───────────────────────────────────────────────────────────────
    // Videos and web pages (HTML files or links) for the live stream: the intro, prayer time and outro. An item plays
    // over the live display (the stream feed and any OBS browser source or display link), and can play on the
    // background wall as well. Files stay where they are on disk; the app remembers where.
    const STREAM_MEDIA_KEY = 'scripturePod.streamMedia.v1';
    const STREAM_MEDIA_SETTINGS_KEY = 'scripturePod.streamMediaSettings.v1';
    const MEDIA_TAGS = ['Intro', 'Prayer', 'Outro', 'Background', 'Other'];
    // The church's own stream pages: one click adds them to the list
    const ACI_MEDIA = [
      { name: 'ACI Intro', url: 'https://aci-stream.vercel.app/v2/intro', tag: 'Intro' },
      { name: 'ACI Prayer time', url: 'https://aci-stream.vercel.app/v2/prayer', tag: 'Prayer' },
      { name: 'ACI Outro', url: 'https://aci-stream.vercel.app/v2/outro', tag: 'Outro' },
      { name: 'ACI Background', url: 'https://aci-stream.vercel.app/v2/bg', tag: 'Background' }
    ];
    const ACI_BG_URL = 'https://aci-stream.vercel.app/v2/bg';
    const streamMedia = { sound: true, appSound: false, loop: false, fit: 'cover', playing: '', playingName: '', wall: '', urls: {}, missing: {}, timer: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem(STREAM_MEDIA_SETTINGS_KEY) || '{}');
      ['sound', 'appSound', 'loop', 'fit'].forEach((k) => { if (saved[k] != null) streamMedia[k] = saved[k]; });
    } catch (e) { /* defaults */ }
    function saveStreamMediaSettings() {
      try { localStorage.setItem(STREAM_MEDIA_SETTINGS_KEY, JSON.stringify({ sound: streamMedia.sound, appSound: streamMedia.appSound, loop: streamMedia.loop, fit: streamMedia.fit })); } catch (e) { /* storage unavailable */ }
    }
    // The control window never makes sound: the copies of pages in the thumbnails and the two monitors stay silent
    // whatever the page tries, and the sound only comes from the stream window or OBS
    function muteControlWindow() {
      try { if (window.BSPDesktop && window.BSPDesktop.setWindowMuted) window.BSPDesktop.setWindowMuted({ label: 'main', muted: true }).catch(() => {}); } catch (e) { /* older build */ }
    }
    muteControlWindow();
    setInterval(muteControlWindow, 5000);

    // Thumbnails are kept between redraws so a page does not reload every time the list is drawn
    const mediaThumbs = new Map();
    function loadStreamMediaList() { try { return JSON.parse(localStorage.getItem(STREAM_MEDIA_KEY) || '[]'); } catch (e) { return []; } }
    function saveStreamMediaList(list) { try { localStorage.setItem(STREAM_MEDIA_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }

    // What kind of thing an address is, and the address a browser can play: a YouTube link becomes its embed page
    function classifyMediaLink(raw) {
      let u;
      try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      const host = u.hostname.replace(/^www\./, '');
      let id = '';
      if (host === 'youtube.com' || host === 'm.youtube.com') id = u.searchParams.get('v') || (u.pathname.startsWith('/embed/') ? u.pathname.split('/')[2] : '');
      else if (host === 'youtu.be') id = u.pathname.slice(1);
      if (/^[\w-]{6,20}$/.test(id)) {
        return { kind: 'html', url: `https://www.youtube.com/embed/${id}?autoplay=1&controls=0&rel=0&playsinline=1`, name: 'YouTube video' };
      }
      const isVideo = /\.(mp4|m4v|mov|webm|ogv|m3u8)(\?|#|$)/i.test(u.pathname + u.search);
      let last = '';
      try { last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').slice(0, 30); } catch (e) { /* keep empty */ }
      return { kind: isVideo ? 'video' : 'html', url: u.href, name: last ? `${host} / ${last}` : host };
    }
    function importAciMedia() {
      const list = loadStreamMediaList();
      let added = 0;
      ACI_MEDIA.forEach((m) => {
        if (list.some((x) => x.url === m.url)) return;
        list.push({ id: 'sm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), source: 'link', url: m.url, name: m.name, kind: 'html', tag: m.tag });
        added++;
      });
      saveStreamMediaList(list);
      showToast(added ? 'ACI media added (' + added + ')' : 'ACI media is already in the list');
      renderMedia();
    }

    function guessMediaTag(name) {
      const n = String(name || '').toLowerCase();
      if (/intro|welcome|opening/.test(n)) return 'Intro';
      if (/prayer|pray/.test(n)) return 'Prayer';
      if (/outro|ending|closing|thank/.test(n)) return 'Outro';
      if (/\bbg\b|background/.test(n)) return 'Background';
      return 'Other';
    }

    async function streamMediaUrl(item) {
      if (item.source === 'link') return item.url;
      if (streamMedia.urls[item.id]) return streamMedia.urls[item.id];
      try {
        const r = await window.BSPDesktop.registerMediaFile({ path: item.path });
        if (r && r.url) { streamMedia.urls[item.id] = r.url; delete streamMedia.missing[item.id]; return r.url; }
        streamMedia.missing[item.id] = (r && r.error) || 'Missing';
      } catch (e) {
        streamMedia.missing[item.id] = (e && e.message) || 'Missing';
      }
      return '';
    }

    async function addMediaFiles() {
      if (!window.BSPDesktop || typeof window.BSPDesktop.pickMediaFiles !== 'function') { showToast('Adding files needs the desktop app'); return; }
      const r = await window.BSPDesktop.pickMediaFiles();
      const list = loadStreamMediaList();
      let added = 0;
      ((r && r.files) || []).forEach((f) => {
        if (list.some((x) => x.path === f.path)) return;
        const isPage = /\.html?$/i.test(f.path);
        list.push({ id: 'sm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), source: 'file', path: f.path, name: f.name || 'Media', kind: isPage ? 'html' : 'video', tag: guessMediaTag(f.name) });
        added++;
      });
      saveStreamMediaList(list);
      if (added) showToast(added === 1 ? 'Added' : added + ' added');
      renderMedia();
    }

    function addMediaLink() {
      const input = document.getElementById('media-link-input');
      const found = classifyMediaLink(input && input.value);
      if (!found) { showToast('Paste a web address that starts with https://'); return; }
      const list = loadStreamMediaList();
      if (list.some((x) => x.url === found.url)) { showToast('That link is already in the list'); return; }
      const nameInput = document.getElementById('media-link-name');
      const name = (nameInput && nameInput.value.trim()) || found.name;
      list.push({ id: 'sm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), source: 'link', url: found.url, name, kind: found.kind, tag: guessMediaTag(name) });
      saveStreamMediaList(list);
      if (input) input.value = '';
      if (nameInput) nameInput.value = '';
      renderMedia();
    }

    function removeMediaItem(id) {
      mediaThumbs.delete(id);
      if (streamMedia.playing === id) stopStreamMediaPlayback();
      saveStreamMediaList(loadStreamMediaList().filter((x) => x.id !== id));
      delete streamMedia.urls[id];
      renderMedia();
    }

    function setMediaTag(id, tag) {
      saveStreamMediaList(loadStreamMediaList().map((x) => (x.id === id ? { ...x, tag } : x)));
      renderMedia();
    }

    // The live display plays it: the stream feed window, and every OBS browser source or display link
    async function playMediaOnStream(id) {
      const item = loadStreamMediaList().find((x) => x.id === id);
      if (!item) return false;
      const url = await streamMediaUrl(item);
      if (!url) { showToast(streamMedia.missing[id] || 'That could not be played'); renderMedia(); return false; }
      const B = window.BSPDesktop;
      let reachable = false;
      try { reachable = !!(B && (await B.isFeedOpen())); } catch (e) { /* bridge unavailable */ }
      if (!reachable) { try { reachable = !!(B && (await B.relayClientCount()) > (typeof relaySocket !== 'undefined' && relaySocket && relaySocket.readyState === WebSocket.OPEN ? 1 : 0)); } catch (e) { /* bridge unavailable */ } }
      if (!reachable) showToast('No stream display is open. Open the Stream feed in Outputs, or an OBS browser source.');
      // The app's own stream window is silenced as a whole, so a page's own sound cannot get out of it
      try { if (B && B.setFeedMuted) await B.setFeedMuted({ muted: !streamMedia.appSound }); } catch (e) { /* older build */ }
      broadcastMessage({ type: 'MEDIA_PLAY', proto: 1, sender: 'control', ts: Date.now(), kind: item.kind, url, trusted: item.source === 'file', sound: !!streamMedia.sound, appSound: !!streamMedia.appSound, loop: !!streamMedia.loop, fit: streamMedia.fit });
      streamMedia.playing = id; streamMedia.playingName = item.name;
      streamMedia.playingKind = item.kind; streamMedia.playingUrl = url; streamMedia.playingTrusted = item.source === 'file';
      syncMediaMonitor();
      clearTimeout(streamMedia.timer);
      // A video that plays once clears the label when it ends
      if (item.kind === 'video' && !streamMedia.loop) {
        const probe = document.createElement('video');
        probe.preload = 'metadata'; probe.src = url;
        probe.onloadedmetadata = () => {
          if (probe.duration && isFinite(probe.duration)) {
            streamMedia.timer = setTimeout(() => { if (streamMedia.playing === id) { streamMedia.playing = ''; streamMedia.playingName = ''; syncMediaMonitor(); renderMedia(); } }, probe.duration * 1000 + 800);
          }
          probe.removeAttribute('src'); probe.load();
        };
      }
      renderMedia();
      return true;
    }

    // While media plays on the stream, the Program and Preview monitors play it too (silently)
    function mediaMirror(shellId) {
      const shell = document.getElementById(shellId);
      if (!shell) return null;
      let m = shell.querySelector('.sp-media-mirror');
      if (m) return m;
      m = document.createElement('div');
      m.className = 'sp-media-mirror';
      m.hidden = true;
      shell.appendChild(m);
      const fit = () => { const w = m.clientWidth; if (w) m.style.setProperty('--mirror-scale', String(w / 1920)); };
      if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(m);
      return m;
    }
    function hideMediaMirror(shellId) {
      const m = document.getElementById(shellId) && document.getElementById(shellId).querySelector('.sp-media-mirror');
      if (m) { m.textContent = ''; m.hidden = true; }
    }
    function paintMediaMirror(m, now) {
      m.textContent = '';
      m.hidden = !now;
      if (!now) return;
      const w0 = m.clientWidth; if (w0) m.style.setProperty('--mirror-scale', String(w0 / 1920));
      if (now.kind === 'video') {
        const v = document.createElement('video');
        v.muted = true; v.loop = !!now.loop; v.autoplay = true; v.playsInline = true; v.src = now.url;
        v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:' + (now.fit === 'contain' ? 'contain' : 'cover') + ';background:#000';
        m.appendChild(v);
        const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      } else {
        const f = document.createElement('iframe');
        f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); f.title = '';
        f.setAttribute('sandbox', now.trusted ? 'allow-scripts allow-same-origin' : 'allow-scripts');
        f.className = 'sp-media-mirror-page';
        // The small copies in the app never make sound
        f.setAttribute('allow', "autoplay 'none'");
        m.appendChild(f);
        // The same two-step load as on the stream, so the page starts the same way
        f.src = 'about:blank';
        setTimeout(() => { if (f.isConnected) f.src = now.url; }, 250);
      }
    }
    function syncMediaMonitor() {
      const on = !!streamMedia.playing;
      document.body.classList.toggle('sp-media-rendering', on);
      const now = on ? { kind: streamMedia.playingKind, url: streamMedia.playingUrl, trusted: streamMedia.playingTrusted, loop: streamMedia.loop, fit: streamMedia.fit } : null;
      ['preview-display-shell', 'program-display-shell'].forEach((id) => { const m = mediaMirror(id); if (m) paintMediaMirror(m, now); });
      if (typeof refreshDisplaysView === 'function') refreshDisplaysView();
      mediaThumbs.forEach((t) => { if (t.frame) t.frame.src = on ? 'about:blank' : (t.url || 'about:blank'); });
    }

    function stopStreamMediaPlayback() {
      clearTimeout(streamMedia.timer);
      streamMedia.playing = ''; streamMedia.playingName = '';
      syncMediaMonitor();
      try { broadcastMessage({ type: 'MEDIA_STOP', proto: 1, sender: 'control', ts: Date.now() }); } catch (e) { /* not ready */ }
      renderMedia();
    }

    // The background wall shows it too: a video loops, a web page is shown as it is
    async function playMediaOnWall(id) {
      const item = loadStreamMediaList().find((x) => x.id === id);
      if (!item) return false;
      const url = await streamMediaUrl(item);
      if (!url) { showToast(streamMedia.missing[id] || 'That could not be played'); renderMedia(); return false; }
      const B = window.BSPDesktop;
      // The wall belongs to this item now, not to the background playlist
      if (typeof bgWall !== 'undefined') { bgWall.desired = null; bgWall.playingIds = []; bgWall.playingId = ''; bgWall.url = ''; bgWall.blank = false; bgWall.playingName = 'Media: ' + item.name; bgWall.dropped = false; }
      if (await bgWallOpen()) {
        if (item.kind === 'html') await B.sendToWall({ type: 'WALL_HTML', url, trusted: item.source === 'file' });
        else await B.sendToWall({ type: 'WALL_SRC', urls: [url], fit: streamMedia.fit, fade: 0, once: false });
        await B.sendToWall({ type: 'BLANK_SCREEN', on: false });
      } else if (item.kind === 'html') {
        await B.openWall({ displayId: bgWall.screenId, kind: 'html', url: encodeURIComponent(url), trusted: item.source === 'file' });
      } else {
        await B.openWall({ displayId: bgWall.screenId, urls: [url], fit: streamMedia.fit, fade: 0 });
      }
      streamMedia.wall = id;
      renderMedia();
      if (typeof renderBackground === 'function') { const h = document.getElementById('background-view'); if (h) h.dataset.sig = ''; }
      return true;
    }

    async function playMediaOnBoth(id) {
      await playMediaOnStream(id);
      await playMediaOnWall(id);
    }

    async function stopMediaOnWall() {
      streamMedia.wall = '';
      await stopBgWall();
    }

    // A video shows a frame; a web page shows a small live copy of itself (it cannot make sound there)
    async function mediaThumbBody(item) {
      const url = await streamMediaUrl(item).catch(() => '');
      const have = mediaThumbs.get(item.id);
      if (have && have.url === url) return have.body;
      const body = document.createElement('div');
      body.className = 'md-thumb-body';
      const entry = { body, url, frame: null };
      if (!url) {
        body.appendChild(Object.assign(document.createElement('span'), { textContent: streamMedia.missing[item.id] || 'Not found', className: 'md-thumb-note' }));
        return body;
      }
      if (item.kind === 'video') {
        const v = document.createElement('video');
        v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = (item.source === 'link' ? url : url + '#t=1');
        body.appendChild(v);
      } else {
        const f = document.createElement('iframe');
        f.className = 'md-thumb-page';
        f.setAttribute('allow', "autoplay 'none'");
        f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); f.title = '';
        f.setAttribute('sandbox', item.source === 'file' ? 'allow-scripts allow-same-origin' : 'allow-scripts');
        body.appendChild(f);
        entry.frame = f;
        const fit = () => { const w = body.clientWidth; if (w) f.style.setProperty('--thumb-scale', String(w / 1920)); };
        if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(body);
        // Pages open one after another, and not at all while media is playing on the stream
        setTimeout(() => { if (!streamMedia.playing && mediaThumbs.get(item.id) === entry) f.src = url; }, 300 + mediaThumbs.size * 400);
      }
      mediaThumbs.set(item.id, entry);
      return body;
    }

    async function renderMedia() {
      const host = document.getElementById('media-view');
      if (!host) return;
      const list = loadStreamMediaList();
      let wallOpen = false;
      try { wallOpen = !!(window.BSPDesktop && (await window.BSPDesktop.isWallOpen())); } catch (e) { /* bridge unavailable */ }
      if (!wallOpen && streamMedia.wall) streamMedia.wall = '';
      const sig = JSON.stringify([list, streamMedia.playing, streamMedia.wall, streamMedia.sound, streamMedia.appSound, streamMedia.loop, streamMedia.fit, Object.keys(streamMedia.missing)]);
      if (host.dataset.sig === sig) return;
      if (host.contains(document.activeElement) && /^(SELECT|INPUT)$/.test(document.activeElement.tagName)) return;
      host.dataset.sig = sig;

      const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const btn = (label, title, fn, cls) => { const b = mk('button', 'md-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (title) b.title = title; b.onclick = fn; return b; };
      host.textContent = '';
      const head = mk('div', 'md-head');
      head.appendChild(mk('h1', '', 'Media'));
      head.appendChild(mk('p', '', 'Videos and web pages for the live stream: the intro, prayer time and outro. They play over the stream, and can play on the Wall/LED screen too.'));
      host.appendChild(head);

      // What is playing, and the settings
      const bar = mk('div', 'md-bar');
      const row1 = mk('div', 'md-now');
      const nowStream = mk('div', 'md-now-item');
      nowStream.appendChild(mk('span', 'md-pill' + (streamMedia.playing ? ' is-on' : ''), streamMedia.playing ? 'ON STREAM' : 'STREAM'));
      nowStream.appendChild(mk('strong', '', streamMedia.playing ? streamMedia.playingName : 'Nothing playing'));
      if (streamMedia.playing) nowStream.appendChild(btn('Stop', 'Take it off the stream', stopStreamMediaPlayback, 'is-stop'));
      row1.appendChild(nowStream);
      const nowWall = mk('div', 'md-now-item');
      const wallItem = list.find((x) => x.id === streamMedia.wall);
      nowWall.appendChild(mk('span', 'md-pill' + (wallItem ? ' is-on' : ''), wallItem ? 'ON WALL' : 'WALL'));
      nowWall.appendChild(mk('strong', '', wallItem ? wallItem.name : 'Nothing from here'));
      if (wallItem) nowWall.appendChild(btn('Stop', 'Close the background screen', stopMediaOnWall, 'is-stop'));
      row1.appendChild(nowWall);
      bar.appendChild(row1);
      const opts = mk('div', 'md-opts');
      const check = (label, on, fn) => { const l = mk('label', 'md-check'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!on; c.onchange = () => fn(c.checked); l.append(c, document.createTextNode(' ' + label)); return l; };
      opts.appendChild(check('Sound on the stream', streamMedia.sound, (v) => { streamMedia.sound = v; saveStreamMediaSettings(); }));
      opts.appendChild(check('Sound in this app', streamMedia.appSound, (v) => { streamMedia.appSound = v; saveStreamMediaSettings(); }));
      opts.appendChild(check('Loop videos on the stream', streamMedia.loop, (v) => { streamMedia.loop = v; saveStreamMediaSettings(); }));
      const fit = mk('select');
      fit.setAttribute('aria-label', 'How videos fill the screen');
      fit.appendChild(new Option('Fill the screen (crop edges)', 'cover'));
      fit.appendChild(new Option('Fit inside (black bars)', 'contain'));
      fit.value = streamMedia.fit;
      fit.onchange = () => { streamMedia.fit = fit.value; saveStreamMediaSettings(); };
      opts.appendChild(fit);
      bar.appendChild(opts);
      bar.appendChild(mk('div', 'md-hint', 'For sound in OBS, use the Media Link from Outputs as its own Browser Source and tick "Control audio via OBS". Untick "Sound in this app" to keep this app silent so nothing doubles up; it applies the next time you play something.'));
      host.appendChild(bar);

      // Adding
      const add = mk('div', 'md-add');
      add.appendChild(btn('Add videos or web pages', 'Choose mp4, mov, webm or HTML files from this computer', addMediaFiles, 'is-primary'));
      const nameIn = mk('input'); nameIn.id = 'media-link-name'; nameIn.type = 'text'; nameIn.placeholder = 'Name (optional)'; nameIn.setAttribute('aria-label', 'Name for the link');
      const linkIn = mk('input'); linkIn.id = 'media-link-input'; linkIn.type = 'text'; linkIn.placeholder = 'Or paste a link: https://…'; linkIn.setAttribute('aria-label', 'Link to a video or web page');
      linkIn.onkeydown = (e) => { if (e.key === 'Enter') addMediaLink(); };
      add.append(nameIn, linkIn, btn('Add link', 'Add this link to the list', addMediaLink), btn('Import ACI media', 'Add the church intro, prayer time, outro and background pages', importAciMedia));
      host.appendChild(add);

      // The library, grouped: Intro, Prayer, Outro, Other
      if (!list.length) host.appendChild(mk('div', 'md-empty', 'Nothing here yet. Add your intro, prayer time and outro files, or paste a link.'));
      // One grid for everything, in the order Intro, Prayer, Outro, Other
      const tagRank = (x) => { const i = MEDIA_TAGS.indexOf(x.tag); return i < 0 ? MEDIA_TAGS.length : i; };
      const ordered = list.map((x, i) => ({ x, i })).sort((p, q) => tagRank(p.x) - tagRank(q.x) || p.i - q.i).map((e) => e.x);
      const grid = mk('div', 'md-grid');
      for (const item of ordered) {
        const onStream = streamMedia.playing === item.id;
        const onWall = streamMedia.wall === item.id;
        const card = mk('div', 'md-card' + (onStream || onWall ? ' is-playing' : ''));
        const thumb = mk('div', 'md-thumb');
        thumb.appendChild(await mediaThumbBody(item));
        thumb.appendChild(mk('span', 'md-tag', MEDIA_TAGS.includes(item.tag) ? item.tag : 'Other'));
        card.appendChild(thumb);
        const nameRow = mk('div', 'md-name-row');
        nameRow.appendChild(mk('div', 'md-name', item.name));
        nameRow.appendChild(mk('span', 'md-kind', (item.source === 'link' ? 'Link · ' : '') + (item.kind === 'html' ? 'Web page' : 'Video')));
        card.appendChild(nameRow);
        const actions = mk('div', 'md-card-actions');
        actions.appendChild(btn(onStream ? 'On stream' : 'Play on stream', 'Play it over the live stream', () => playMediaOnStream(item.id), 'is-primary'));
        actions.appendChild(btn(onWall ? 'On wall' : 'Wall', 'Show it on the Wall/LED screen', () => playMediaOnWall(item.id)));
        actions.appendChild(btn('Both', 'Play on the stream and on the wall', () => playMediaOnBoth(item.id)));
        card.appendChild(actions);
        const foot = mk('div', 'md-card-foot');
        const sel = mk('select');
        sel.setAttribute('aria-label', 'Group');
        MEDIA_TAGS.forEach((t) => sel.appendChild(new Option(t, t)));
        sel.value = MEDIA_TAGS.includes(item.tag) ? item.tag : 'Other';
        sel.onchange = () => setMediaTag(item.id, sel.value);
        foot.append(sel, btn('Remove', 'Take it off this list (the file is kept)', () => removeMediaItem(item.id), 'is-tiny'));
        card.appendChild(foot);
        grid.appendChild(card);
      }
      if (ordered.length) host.appendChild(grid);
    }

    function openMediaWorkspace() {
      document.body.classList.remove('overlays-workspace-active', 'displays-workspace-active', 'background-workspace-active');
      document.body.classList.add('media-workspace-active');
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-media'));
      if (typeof updateBottomNavSidebarButtons === 'function') updateBottomNavSidebarButtons('media');
      const host = document.getElementById('media-view');
      if (host) host.dataset.sig = '';
      renderMedia();
    }
    setInterval(() => { if (document.body.classList.contains('media-workspace-active')) renderMedia(); }, 2000);
