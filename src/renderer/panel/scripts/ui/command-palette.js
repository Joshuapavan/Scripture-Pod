    // ⌘K / Ctrl+K: a Spotlight-style search over passages, songs, the setlist
    // and common actions. Enter opens the result (a passage is cued, not sent
    // live — Space does that); arrows move; Esc closes.
    let commandPaletteItems = [];
    let paletteKeywordCache = { key: '', hits: null };
    let commandPaletteIndex = 0;

    function isCommandPaletteOpen() {
      const palette = document.getElementById('command-palette');
      return !!palette && !palette.hidden;
    }

    function openCommandPalette() {
      const palette = document.getElementById('command-palette');
      const input = document.getElementById('command-palette-input');
      if (!palette || !input) return;
      palette.hidden = false;
      input.value = '';
      renderCommandPaletteResults();
      requestAnimationFrame(() => input.focus());
    }

    function closeCommandPalette() {
      const palette = document.getElementById('command-palette');
      if (palette) palette.hidden = true;
    }

    function toggleCommandPalette() {
      if (isCommandPaletteOpen()) closeCommandPalette();
      else openCommandPalette();
    }

    // Open a passage like the search box does, but cue the verse instead of
    // projecting it.
    function openPassageFromPalette(query) {
      if (sidebarTab !== 'bible') setSidebarTab('bible');
      if (!activeBibleVersion || !bibles[activeBibleVersion]) return;
      // The passage opens in its own book; leftover sidebar search text would
      // keep the library showing search results instead
      const sidebarSearch = document.getElementById('song-search');
      if (sidebarSearch && sidebarSearch.value) {
        sidebarSearch.value = '';
        const mirror = document.getElementById('nav-mirror-search');
        if (mirror) mirror.value = '';
        setSearchValueForTab('bible', '');
      }
      let q = normalizeSearchText(query).trim();
      const spaceVerse = q.match(/^([\p{L}1-3 ]+\s+\d+)\s+(\d+)$/u);
      if (spaceVerse) q = `${spaceVerse[1]}:${spaceVerse[2]}`;
      const parsed = parseBibleReferenceQuery(q);
      if (!parsed) return;
      const match = findBibleReferenceChapter(activeBibleVersion, parsed);
      if (!match) return;
      buttonContextTab = 'bible';
      selectItem(match.chapterIndex, { skipButtonView: true });
      if (parsed.versePrefix) {
        setBibleGroupAnchor(parsed.versePrefix, currentItem);
        const pages = getPagesFromItem(currentItem, true);
        const pageIdx = pages.findIndex(p => matchesVerseStart(p.raw, parsed.versePrefix));
        if (pageIdx !== -1) lineCursor = pageIdx;
      }
      updateButtonView({ skipAutoScroll: true });
      revealActiveVerse();
      const extracted = extractBookAndChapter(currentItem);
      addBibleRecentReference(buildBibleRefEntry(extracted.book, extracted.chap, parsed.versePrefix || '', null, activeBibleVersion));
    }

    function getCommandPaletteActions() {
      return [
        { label: 'Go live', hint: 'Space', run: () => projectLive(true) },
        { label: 'Preview selection', hint: 'Alt+Space', run: () => previewCurrentSelection() },
        { label: 'Clear output', hint: 'Esc', run: () => clearOutput() },
        { label: 'Clear preview', hint: 'Alt+Esc', run: () => clearProgramPreview() },
        { label: 'Clear everything', hint: 'Shift+Esc', run: () => clearAllOutputs() },
        { label: 'Preview only on / off', run: () => togglePreviewOnlyMode() },
        { label: 'Open Bible', run: () => setSidebarTab('bible') },
        { label: 'Open Lyrics', run: () => setSidebarTab('songs') },
        { label: 'Open Setlist', run: () => setSidebarTab('schedule') },
        { label: 'Open Overlays', run: () => openOverlaysWorkspace() },
        { label: 'Reader view', run: () => { setSidebarTab('bible'); setBibleReaderView(true); } },
        { label: 'Verses view', run: () => { setSidebarTab('bible'); setBibleReaderView(false); } },
        { label: 'Outputs', run: () => showOutputsCard() },
        { label: 'Keyboard shortcuts', run: () => openShortcutsWindow() },
        { label: 'Settings', run: () => openModal('settingsModal') },
        { label: 'New song', run: () => openModal('newSongModal') },
        { label: 'Search lyrics online', run: () => openLyricsWebSearch('', 'any') }
      ];
    }

    // Passage hits for the typed words. With the SQLite index they arrive a
    // moment later and the list is redrawn; otherwise they are found at once.
    function getPaletteKeywordHits(q, raw) {
      const key = `${activeBibleVersion}\n${q}`;
      if (!bibleSearchDbAvailable() || !bibleSearchDbReady.has(activeBibleVersion)) {
        return scanBibleSearchIndex(activeBibleVersion, searchText => searchText.includes(q), 6);
      }
      if (paletteKeywordCache.key === key && paletteKeywordCache.hits) return paletteKeywordCache.hits;
      paletteKeywordCache = { key, hits: null };
      findBibleKeywordMatchesInDb(q, { versionId: activeBibleVersion, maxResults: 6 }).then((hits) => {
        const input = document.getElementById('command-palette-input');
        if (!input || normalizeSearchText(input.value).trim() !== q || paletteKeywordCache.key !== key) return;
        paletteKeywordCache = { key, hits: hits || scanBibleSearchIndex(activeBibleVersion, searchText => searchText.includes(q), 6) };
        renderCommandPaletteResults();
      });
      return [];
    }

    function buildCommandPaletteGroups(raw) {
      const q = normalizeSearchText(raw).trim();
      const versionCode = activeBibleVersion ? getVersionCode(activeBibleVersion) : '';
      const groups = [];

      if (!q) {
        const seen = new Set();
        const recent = [...biblePinnedRefs, ...bibleRecentRefs].filter((ref) => {
          const key = normalizeBibleRefKey(ref.query);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 5).map((ref) => ({
          label: ref.title || ref.query,
          meta: ref.versionId ? getVersionCode(ref.versionId) : '',
          run: () => applyBibleReferenceEntry(ref)
        }));
        if (recent.length) groups.push({ title: 'Pinned & recent', items: recent });
        groups.push({ title: 'Actions', items: getCommandPaletteActions().slice(0, 6) });
        return groups;
      }

      const passages = [];
      if (activeBibleVersion && parseBibleReferenceQuery(q.replace(/^([\p{L}1-3 ]+\s+\d+)\s+(\d+)$/u, '$1:$2'))) {
        passages.push({ label: `Go to ${raw.trim()}`, meta: versionCode, run: () => openPassageFromPalette(raw) });
      }
      if (activeBibleVersion && q.length >= 3) {
        getPaletteKeywordHits(q, raw)
          .forEach((entry) => {
            const ref = `${entry.book} ${entry.chapter}:${entry.verse}`;
            passages.push({ label: ref, detail: entry.text, meta: versionCode, run: () => openPassageFromPalette(ref) });
          });
      }
      if (passages.length) groups.push({ title: 'Passages', items: passages });

      const songHits = songs
        .map((song, index) => ({ song, index }))
        .filter(({ song }) => normalizeSearchText(song.title || '').includes(q))
        .slice(0, 5)
        .map(({ song, index }) => ({
          label: song.title || 'Untitled song',
          meta: 'Song',
          run: () => { setSidebarTab('songs'); buttonContextTab = 'songs'; selectItem(index); }
        }));
      if (songHits.length) groups.push({ title: 'Songs', items: songHits });

      const setlistHits = (Array.isArray(schedule) ? schedule : [])
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => normalizeSearchText(entry.title || '').includes(q))
        .slice(0, 4)
        .map(({ entry, index }) => ({
          label: entry.title || `Item ${index + 1}`,
          meta: `Setlist ${String(index + 1).padStart(2, '0')}`,
          run: () => { setSidebarTab('schedule'); handleFocusedSchedulePanelAction('select', index); }
        }));
      if (setlistHits.length) groups.push({ title: 'Setlist', items: setlistHits });

      // Anything typed can also be searched for on the web (English, Kannada or Tamil songs)
      const webQuery = raw.trim();
      if (webQuery.length >= 2) {
        groups.push({
          title: 'Search the web',
          items: [
            { label: `Search lyrics online for “${webQuery}”`, meta: 'Any language', run: () => openLyricsWebSearch(webQuery, 'any') },
            { label: `…in English`, meta: 'Lyrics', run: () => openLyricsWebSearch(webQuery, 'english') },
            { label: `…in Kannada`, meta: 'Saved as typed English', run: () => openLyricsWebSearch(webQuery, 'kannada') },
            { label: `…in Tamil`, meta: 'Saved as typed English', run: () => openLyricsWebSearch(webQuery, 'tamil') }
          ]
        });
      }

      const actions = getCommandPaletteActions().filter(action => normalizeSearchText(action.label).includes(q));
      if (actions.length) {
        // "clear", "go live"… read as commands: list actions first
        const looksLikeCommand = actions.some(action => normalizeSearchText(action.label).startsWith(q)) && !passages.some(p => p.label.startsWith('Go to'));
        const group = { title: 'Actions', items: actions };
        if (looksLikeCommand) groups.unshift(group);
        else groups.push(group);
      }
      return groups;
    }

    function renderCommandPaletteResults() {
      const host = document.getElementById('command-palette-results');
      const input = document.getElementById('command-palette-input');
      if (!host || !input) return;
      const groups = buildCommandPaletteGroups(input.value);
      commandPaletteItems = groups.flatMap(group => group.items);
      commandPaletteIndex = 0;
      host.replaceChildren();
      if (!commandPaletteItems.length) {
        const empty = document.createElement('div');
        empty.className = 'command-palette-empty';
        empty.textContent = 'No matches. Try a reference like “John 3:16”, words from a verse, or a song title.';
        host.appendChild(empty);
        return;
      }
      let flatIndex = 0;
      groups.forEach((group) => {
        const heading = document.createElement('div');
        heading.className = 'command-palette-group';
        heading.textContent = group.title;
        host.appendChild(heading);
        group.items.forEach((item) => {
          const index = flatIndex++;
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'command-palette-item';
          row.setAttribute('role', 'option');
          row.dataset.index = String(index);
          const label = document.createElement('span');
          label.className = 'command-palette-label';
          label.textContent = item.label;
          row.appendChild(label);
          if (item.detail) {
            const detail = document.createElement('span');
            detail.className = 'command-palette-detail';
            detail.textContent = item.detail;
            row.appendChild(detail);
          }
          if (item.meta || item.hint) {
            const meta = document.createElement(item.hint ? 'kbd' : 'span');
            meta.className = 'command-palette-meta';
            meta.textContent = item.hint || item.meta;
            row.appendChild(meta);
          }
          row.onmouseenter = () => setCommandPaletteIndex(index);
          row.onclick = () => runCommandPaletteItem(index);
          host.appendChild(row);
        });
      });
      setCommandPaletteIndex(0);
    }

    function setCommandPaletteIndex(index) {
      if (!commandPaletteItems.length) return;
      commandPaletteIndex = (index + commandPaletteItems.length) % commandPaletteItems.length;
      document.querySelectorAll('#command-palette-results .command-palette-item').forEach((row) => {
        const active = Number(row.dataset.index) === commandPaletteIndex;
        row.classList.toggle('is-active', active);
        row.setAttribute('aria-selected', active ? 'true' : 'false');
        if (active) row.scrollIntoView({ block: 'nearest' });
      });
    }

    function runCommandPaletteItem(index) {
      const item = commandPaletteItems[index];
      if (!item) return;
      closeCommandPalette();
      item.run();
    }

    function setupCommandPalette() {
      const input = document.getElementById('command-palette-input');
      if (!input || input.dataset.bound) return;
      input.dataset.bound = '1';
      input.addEventListener('input', renderCommandPaletteResults);
      // "psalms 23" + Space becomes "psalms 23:", as in the library search
      input.addEventListener('keydown', e => handleBibleSpaceToColon(e, renderCommandPaletteResults, true));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCommandPaletteIndex(commandPaletteIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCommandPaletteIndex(commandPaletteIndex - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); runCommandPaletteItem(commandPaletteIndex); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCommandPalette(); }
      });
      // ⌘K / Ctrl+K works everywhere, including while typing in another field
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 'k') {
          e.preventDefault();
          toggleCommandPalette();
        }
      }, true);
    }
