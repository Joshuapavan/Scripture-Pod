    // ── Song version history ──────────────────────────────────────────────────────
    // Earlier versions of a song's text are kept on this computer, so a bad paste or an unwanted tidy can be
    // undone: History (in the lyrics editor) lists them and restores one. The newest ten are kept per song.
    const SONG_HISTORY_KEY = 'scripturePod.songHistory.v1';
    const SONG_HISTORY_PER_SONG = 10;
    const SONG_HISTORY_MIN_GAP_MS = 120000;
    const SONG_HISTORY_MAX_CHARS = 1500000;
    let songSnapshotForceNext = false;

    function loadSongHistory() {
      try { const v = JSON.parse(localStorage.getItem(SONG_HISTORY_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
    }
    function saveSongHistory(all) {
      // keep the total small: drop the oldest entries first
      let json = JSON.stringify(all);
      if (json.length > SONG_HISTORY_MAX_CHARS) {
        const flat = [];
        Object.keys(all).forEach((id) => all[id].forEach((v, i) => flat.push({ id, i, t: v.t })));
        flat.sort((a, b) => a.t - b.t);
        while (json.length > SONG_HISTORY_MAX_CHARS && flat.length) {
          const old = flat.shift();
          all[old.id] = (all[old.id] || []).filter((v) => v.t !== old.t);
          if (!all[old.id].length) delete all[old.id];
          json = JSON.stringify(all);
        }
      }
      try { localStorage.setItem(SONG_HISTORY_KEY, json); } catch (e) { /* storage unavailable */ }
    }

    // The next recorded change is kept even if the last one was seconds ago (before Tidy, Clear tags, a paste)
    function forceSongSnapshot() { songSnapshotForceNext = true; }

    // Keeps the text a song had before an edit
    function recordSongVersion(songId, previousText, opts = {}) {
      const text = String(previousText || '');
      if (!songId || !text.trim()) return;
      const force = !!opts.force || songSnapshotForceNext;
      songSnapshotForceNext = false;
      const all = loadSongHistory();
      const list = all[songId] || [];
      if (list.length && list[0].content === text) return;
      if (!force && list.length && Date.now() - list[0].t < SONG_HISTORY_MIN_GAP_MS) return;
      list.unshift({ t: Date.now(), content: text });
      all[songId] = list.slice(0, SONG_HISTORY_PER_SONG);
      saveSongHistory(all);
    }

    function describeSongVersionAge(t) {
      const s = Math.max(0, Math.round((Date.now() - t) / 1000));
      if (s < 60) return 'Just now';
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      return new Date(t).toLocaleDateString() + ' ' + new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    let songHistorySelected = -1;
    function ensureSongHistoryModal() {
      let modal = document.getElementById('songHistoryModal');
      if (modal) return modal;
      modal = document.createElement('div');
      modal.id = 'songHistoryModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `<div class="modal-content song-history" role="dialog" aria-modal="true" aria-labelledby="song-history-title">
        <div class="song-history-head"><h3 id="song-history-title">Earlier versions</h3><button type="button" class="btn" id="song-history-close">Close</button></div>
        <p class="output-route-hint" id="song-history-note"></p>
        <div class="song-history-body"><div class="song-history-list" id="song-history-list"></div><pre class="song-history-preview" id="song-history-preview"></pre></div>
        <div class="song-history-foot"><button type="button" class="btn song-history-restore" id="song-history-restore" disabled>Restore this version</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('#song-history-close').onclick = () => closeModal('songHistoryModal');
      modal.querySelector('#song-history-restore').onclick = restoreSongVersion;
      return modal;
    }

    function renderSongHistoryList() {
      const list = document.getElementById('song-history-list');
      const preview = document.getElementById('song-history-preview');
      const restore = document.getElementById('song-history-restore');
      const versions = currentItem ? (loadSongHistory()[currentItem.id] || []) : [];
      list.replaceChildren();
      document.getElementById('song-history-note').textContent = versions.length ? `“${currentItem.title || 'This song'}”: pick a version to look at it, then restore it. Your current text is kept as a version too.` : 'No earlier versions yet. They appear here after you edit this song.';
      versions.forEach((v, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'song-history-row' + (i === songHistorySelected ? ' is-selected' : '');
        const rows = v.content.split('\\n').filter((l) => l.trim());
        row.innerHTML = `<strong>${esc(describeSongVersionAge(v.t))}</strong><span>${rows.length} line${rows.length === 1 ? '' : 's'} · ${esc((rows[0] || '').slice(0, 40))}</span>`;
        row.onclick = () => { songHistorySelected = i; renderSongHistoryList(); };
        list.appendChild(row);
      });
      preview.textContent = songHistorySelected >= 0 && versions[songHistorySelected] ? versions[songHistorySelected].content : '';
      restore.disabled = songHistorySelected < 0 || !versions[songHistorySelected];
    }

    function openSongHistory() {
      if (!currentItem || getIsBibleItem(currentItem)) { showToast('Open a song first'); return; }
      ensureSongHistoryModal();
      songHistorySelected = -1;
      renderSongHistoryList();
      openModal('songHistoryModal');
    }

    function restoreSongVersion() {
      const versions = currentItem ? (loadSongHistory()[currentItem.id] || []) : [];
      const v = versions[songHistorySelected];
      const ed = document.getElementById('lyric-editor');
      if (!v || !ed) return;
      recordSongVersion(currentItem.id, ed.value, { force: true });   // the text being replaced is kept
      forceSongSnapshot();
      ed.value = v.content;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      closeModal('songHistoryModal');
      showToast('Restored the earlier version');
    }
