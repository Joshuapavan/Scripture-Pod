    // ── Lyrics list: drag to re-arrange, and file songs under services ─────────────────
    // Logic is in src/shared/song-services.js. A song's place in the list is song.order and its services are
    // song.services; both are saved with the song. The list of services is kept in localStorage.
    let songServiceState = window.SP_SONG_SERVICES.load(localStorage);
    let draggedSongId = null;

    function saveSongServiceState() { window.SP_SONG_SERVICES.save(localStorage, songServiceState); }

    // Saves songs without sending them to the cloud library: only their order or services changed
    function persistSongRecords(list) {
      if (!list.length) return;
      dbPutMany(STORE_SONGS, list.map((s) => buildSongRecord(s, { isNew: false }))).catch(() => {});
    }

    function setActiveSongService(id) {
      songServiceState.active = id;
      saveSongServiceState();
      renderSongs();
    }

    function createSongService() {
      showConfirm('New service', 'Name of the service, e.g. Sunday morning', (name) => {
        const svc = window.SP_SONG_SERVICES.addService(songServiceState, name);
        if (!svc) { showToast('Enter a name for the service'); return; }
        songServiceState.active = svc.id;
        saveSongServiceState();
        renderSongs();
      }, true, '');
    }

    function renameActiveSongService() {
      const svc = songServiceState.services.find((x) => x.id === songServiceState.active);
      if (!svc) return;
      showConfirm('Rename service', 'New name', (name) => {
        if (!window.SP_SONG_SERVICES.renameService(songServiceState, svc.id, name)) { showToast('That name is empty or already used'); return; }
        saveSongServiceState();
        renderSongs();
      }, true, svc.name);
    }

    function deleteActiveSongService() {
      const svc = songServiceState.services.find((x) => x.id === songServiceState.active);
      if (!svc) return;
      showConfirm('Delete service', `Delete "${svc.name}"? The songs stay in your list; they are only taken out of this service.`, () => {
        persistSongRecords(window.SP_SONG_SERVICES.removeService(songServiceState, songs, svc.id));
        saveSongServiceState();
        renderSongs();
        showToast('Service deleted');
      });
    }

    function toggleSongInService(song, serviceId) {
      if (!song) return;
      const now = window.SP_SONG_SERVICES.toggleService(song, serviceId);
      const svc = songServiceState.services.find((x) => x.id === serviceId);
      persistSongRecords([song]);
      renderSongs();
      showToast(`${now ? 'Added to' : 'Removed from'} ${svc ? svc.name : 'service'}`);
    }

    function renderSongServicesBar() {
      const bar = document.getElementById('song-services-bar');
      if (!bar) return;
      bar.replaceChildren();
      if (sidebarTab !== 'songs') return;
      const chip = (id, label, count) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'song-service-chip' + (songServiceState.active === id ? ' active' : '');
        b.textContent = label;
        if (count != null) { const n = document.createElement('span'); n.className = 'song-service-count'; n.textContent = String(count); b.appendChild(n); }
        b.onclick = () => setActiveSongService(id);
        return b;
      };
      bar.appendChild(chip('all', 'All songs', songs.length));
      songServiceState.services.forEach((svc) => {
        const b = chip(svc.id, svc.name, songs.filter((s) => window.SP_SONG_SERVICES.inService(s, svc.id)).length);
        b.title = 'Drop a song here to add it to this service';
        b.addEventListener('dragover', (e) => { if (draggedSongId) { e.preventDefault(); b.classList.add('drop-target'); } });
        b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
        b.addEventListener('drop', (e) => {
          e.preventDefault();
          b.classList.remove('drop-target');
          const song = songs.find((s) => s.id === draggedSongId);
          if (song && !window.SP_SONG_SERVICES.inService(song, svc.id)) toggleSongInService(song, svc.id);
        });
        bar.appendChild(b);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'song-service-chip song-service-add';
      add.textContent = '+ Service';
      add.title = 'Create a service, e.g. Sunday morning';
      add.onclick = createSongService;
      bar.appendChild(add);
      if (songServiceState.active !== 'all') {
        const tools = document.createElement('span');
        tools.className = 'song-service-tools';
        [['Rename', renameActiveSongService], ['Delete', deleteActiveSongService]].forEach(([label, fn]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'song-service-link';
          b.textContent = label;
          b.onclick = fn;
          tools.appendChild(b);
        });
        bar.appendChild(tools);
      }
    }

    function buildSongsEmptyNote() {
      const note = document.createElement('div');
      note.className = 'song-services-empty';
      note.textContent = 'No songs in this service yet. Right-click a song and pick this service, or drag a song onto the service above.';
      return note;
    }

    // Drag a row to move it; drop it on another row to take that row's place
    function attachSongDrag(row, song, right) {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '☰';
      handle.title = 'Drag to re-arrange';
      right.appendChild(handle);
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        draggedSongId = song.id;
        row.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', song.title || ''); } catch (_) { /* some webviews block it */ }
      });
      row.addEventListener('dragend', () => {
        draggedSongId = null;
        row.classList.remove('dragging');
        document.querySelectorAll('#song-list .drop-target, #song-services-bar .drop-target').forEach((el) => el.classList.remove('drop-target'));
      });
      row.addEventListener('dragover', (e) => { if (draggedSongId && draggedSongId !== song.id) { e.preventDefault(); row.classList.add('drop-target'); } });
      row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drop-target');
        if (draggedSongId) moveSongInList(draggedSongId, song.id);
      });
    }

    function moveSongInList(fromId, toId) {
      // Row numbers shift when the list is re-ordered: follow the selected and the live song by identity
      const liveSong = (typeof livePointer !== 'undefined' && livePointer && livePointer.kind === 'songs') ? songs[livePointer.index] : null;
      const changed = window.SP_SONG_SERVICES.moveSong(songs, fromId, toId);
      if (!changed.length) return;
      if (buttonContextTab === 'songs' && currentItem) currentIndex = songs.indexOf(currentItem);
      if (liveSong) livePointer = { ...livePointer, index: songs.indexOf(liveSong) };
      persistSongRecords(changed);
      saveState();
      saveToStorageDebounced();
      renderSongs();
    }
