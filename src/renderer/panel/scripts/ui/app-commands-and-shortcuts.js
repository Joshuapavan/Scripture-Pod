    function clearOutput(opts = {}) {
      isLive = false;
      liveKind = null;
      livePointer = null;
      liveLineCursor = 0;
      liveLinesPerPage = linesPerPage;
      liveBackgroundState = null;
      liveRatio = activeRatio;
      liveTextTransformState = null;
      applyProgramDisplaySource('lyrics');
      postClear({
        fade: opts.fade !== false,
        transitionDuration: opts.transitionDuration != null ? opts.transitionDuration : getCurrentTransitionDuration()
      });
      saveToStorageDebounced();
      updateButtonView();
      setLtFontInputValue(getEffectiveLtFont());
      handleSongFullFontState();
    }


    function resetLTPosition() {
      const textXEl = document.getElementById('text-x');
      const textYEl = document.getElementById('text-y');
      const ltOffsetYEl = document.getElementById('lt-offset-y');
      const ltOffsetXEl = document.getElementById('lt-offset-x');
      if (textXEl) textXEl.value = 0;
      if (textYEl) textYEl.value = 860;
      if (ltOffsetYEl) ltOffsetYEl.value = 0;
      if (ltOffsetXEl) ltOffsetXEl.value = 0;
      const padLrFullEl = document.getElementById('pad-lr-full');
      const padLrLtEl = document.getElementById('pad-lr-lt');
      const padBEl = document.getElementById('pad-b');
      if (padLrFullEl) padLrFullEl.value = 5;
      if (padLrLtEl) padLrLtEl.value = 5;
      if (padBEl) padBEl.value = 10;
      initializeAllSliders();
      onAnyControlChange();
      showToast(t('settings_position_reset_default'));
    }

    function confirmReset() {
      showConfirm(t('settings_reset_plugin'), t('settings_reset_plugin_confirm'), () => {
        resetAppData();
      });
    }

    async function resetAppData() {
      stateReady = false;
      isRestoringBackup = true;
      try {
        try { localStorage.clear(); } catch (_) {}
        try { sessionStorage.clear(); } catch (_) {}

        await openDb();
        await Promise.all([
          dbClearStore(STORE_SONGS),
          dbClearStore(STORE_BIBLES),
          dbClearStore(STORE_STATE)
        ]);
        showToast(t('settings_plugin_reset_complete'));
        setTimeout(() => {
          try {
            window.location.reload();
          } catch (_) {
            window.location.href = window.location.href;
          }
        }, 120);
      } catch (e) {
        isRestoringBackup = false;
        stateReady = true;
        console.error('Reset failed', e);
        showToast(t('common_reset_failed'));
      }
    }

    function showConfirm(title, message, callback, showInput = false, initialInput = '') {
      document.getElementById('confirm-title').innerText = title;
      document.getElementById('confirm-message').innerText = message;
      const input = document.getElementById('confirm-input');
      input.style.display = showInput ? 'block' : 'none';
      input.value = showInput ? String(initialInput || '') : '';
      const btn = document.getElementById('confirm-btn');
      btn.onclick = () => {
        closeModal('confirmModal');
        callback(showInput ? input.value : true);
      };
      openModal('confirmModal');
      if (showInput) {
        setTimeout(() => {
          try {
            input.focus();
            input.setSelectionRange(0, input.value.length);
          } catch (_) {}
        }, 10);
      }
    }

    // Ctrl or Cmd + Enter in the lyrics box creates the song and shows it live
    function handleNewSongLyricsKey(event) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        createNewItem({ live: true });
      }
    }

    // A song needs a name and lyrics; the lyrics can be pasted from the web.
    // opts.live also shows the first slide on the live output.
    // ── Tag lyrics sections (Verse, Chorus, Bridge …) while typing or pasting ──
    const SECTION_TAG_KINDS = [
      { kind: 'Verse', numbered: true }, { kind: 'Chorus' }, { kind: 'Pre-Chorus' },
      { kind: 'Bridge' }, { kind: 'Tag' }, { kind: 'Intro' }, { kind: 'Outro' }, { kind: 'Interlude' }
    ];
    const SECTION_HEADER_RE = /^\s*\[[^\]\n]{1,40}\]\s*$/;

    function buildSectionTagBars() {
      document.querySelectorAll('.section-tag-bar').forEach((bar) => {
        if (bar.dataset.ready) return;
        bar.dataset.ready = 'true';
        const target = bar.dataset.target;
        const targetEl = document.getElementById(target);
        if (target === 'lyric-editor' && targetEl) bar.style.display = getComputedStyle(targetEl).display === 'none' ? 'none' : 'flex';
        bar.innerHTML = '<span class="section-tag-label">Tag selection as</span>' +
          SECTION_TAG_KINDS.map((k) => `<button type="button" class="section-tag-chip" data-kind="${k.kind}">${k.kind}</button>`).join('') +
          '<button type="button" class="section-tag-chip is-clear" data-kind="">Remove tag</button>' +
          '<button type="button" class="section-tag-chip is-tidy" data-tidy="1" title="Remove verse numbers and repeat marks (1., x2, (x4), xn, -2) from these lyrics">Tidy lyrics</button>';
        bar.addEventListener('mousedown', (e) => { if (e.target.closest('.section-tag-chip')) e.preventDefault(); }); // keep the text selection
        bar.addEventListener('click', (e) => {
          const chip = e.target.closest('.section-tag-chip');
          if (!chip) return;
          if (chip.dataset.tidy) { tidyLyricsInTextarea(target); return; }
          tagLyricsSection(target, chip.dataset.kind);
        });
      });
    }

    // Removes verse numbers and repeat marks from the whole text of a lyrics box (the saved song follows)
    function tidyLyricsInTextarea(textareaId) {
      const ta = document.getElementById(textareaId);
      if (!ta || !window.SP_LYRICS_CLEAN) return;
      const cleaned = window.SP_LYRICS_CLEAN.cleanPastedLyrics(ta.value);
      if (cleaned === ta.value.trim()) { showToast('Nothing to tidy: no verse numbers or repeat marks found'); return; }
      ta.value = cleaned;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('Tidied the lyrics: verse numbers and repeat marks removed');
    }

    // Puts a [Kind] header above the selected lines (or the block under the cursor); verses count up by themselves
    function tagLyricsSection(textareaId, kind) {
      const ta = document.getElementById(textareaId);
      if (!ta) return;
      const text = ta.value;
      let start = ta.selectionStart || 0;
      const end = ta.selectionEnd || start;
      const lineStart = (i) => text.lastIndexOf('\n', Math.max(0, i) - 1) + 1;
      // No selection: the tag goes above the block (run of lines) the cursor is in
      let from = lineStart(start);
      if (start !== end) { const prev = text.slice(lineStart(from - 1), Math.max(0, from - 1)); if (from > 0 && SECTION_HEADER_RE.test(prev)) from = lineStart(from - 1); }
      if (start === end) {
        const lines = text.split('\n');
        let pos = 0, idx = 0;
        for (; idx < lines.length; idx++) { if (start <= pos + lines[idx].length) break; pos += lines[idx].length + 1; }
        let b = idx;
        while (b > 0 && lines[b - 1].trim() && !SECTION_HEADER_RE.test(lines[b - 1])) b--;
        if (b > 0 && SECTION_HEADER_RE.test(lines[b - 1])) b--; // the block's own tag, to be replaced
        from = lines.slice(0, b).join('\n').length + (b > 0 ? 1 : 0);

      }
      let before = text.slice(0, from);
      let after = text.slice(from);
      // An existing header right at the start of the block is replaced
      const firstLineEnd = after.indexOf('\n') === -1 ? after.length : after.indexOf('\n');
      let removedHeader = false;
      if (SECTION_HEADER_RE.test(after.slice(0, firstLineEnd))) {
        after = after.slice(firstLineEnd + 1);
        removedHeader = true;
      }
      let header = '';
      if (kind) {
        const meta = SECTION_TAG_KINDS.find((k) => k.kind === kind);
        let label = kind;
        if (meta && meta.numbered) {
          const used = (before.match(new RegExp('^\\s*\\[' + kind + '\\s*\\d*\\]', 'gim')) || []).length;
          label = `${kind} ${used + 1}`;
        }
        header = `[${label}]\n`;
        if (before && !before.endsWith('\n\n')) before = before.replace(/\n?$/, '\n\n');
      }
      ta.value = before + header + after;
      const caret = (before + header).length;
      ta.focus();
      ta.setSelectionRange(caret, caret);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof showToast === 'function') showToast(kind ? `Tagged as ${kind}` : (removedHeader ? 'Tag removed' : 'No tag here'));
    }
    document.addEventListener('DOMContentLoaded', buildSectionTagBars);
    if (document.readyState !== 'loading') buildSectionTagBars();

    function createNewItem(opts = {}) {
      const input = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const lyricsInput = document.getElementById('new-song-lyrics');
      const artist = (artistInput?.value || '').trim();
      // Kannada and Tamil script is stored as typed English
      const toTyped = (text) => (window.SP_TRANSLIT && window.SP_TRANSLIT.detectScript(text) !== 'latin') ? window.SP_TRANSLIT.toTypedEnglish(text) : text;
      const tidy = (text) => (window.SP_LYRICS_CLEAN ? window.SP_LYRICS_CLEAN.cleanPastedLyrics(text) : text);
      const pastedLyrics = tidy(toTyped((lyricsInput?.value || '').trim()));
      let title = toTyped((input.value || '').trim());
      const lookupKey = getNewSongLookupKey(title, artist);
      const fetchedLyrics = (lookupKey === newSongFetchedLookupKey) ? tidy(newSongFetchedLyrics) : '';
      // Pasted lyrics are sliced into sections the same way fetched ones are
      const initialContent = pastedLyrics ? inferSectionedLyricsFromText(pastedLyrics) : (fetchedLyrics || '');
      if (!title && initialContent) {
        // No name typed: the first line of the lyrics names the song
        const firstLine = initialContent.split('\n').map(line => line.trim()).find(line => line && !/^\[[^\]]*\]$/.test(line)) || '';
        title = firstLine.replace(/[,;:.!?\s]+$/, '').slice(0, 48);
      }
      if (!title) { showToast('Enter a song name and its lyrics'); input.focus(); return; }
      const newSong = {
        id: createId('song', title),
        title,
        content: initialContent,
        text: initialContent,
        searchableText: normalizeSearchText(`${title}\n${initialContent}`),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      songs.push(newSong);
      idbPut(STORE_SONGS, buildSongRecord(newSong, { isNew: true })).catch(() => {});
      setSidebarTab('songs');
      const searchInput = document.getElementById('song-search');
      if (searchInput) searchInput.value = '';
      setSearchValueForTab('songs', '');
      buttonContextTab = 'songs';
      selectItem(songs.length - 1);
      // With lyrics the song opens as slides, ready to project; without, as text to type into
      if (initialContent) {
        setEditorMode('btn');
        if (opts.live) projectLive(true);
      } else {
        setEditorMode('text');
        document.getElementById('lyric-editor').focus();
      }
      requestAnimationFrame(() => {
        focusActiveSongInSidebar();
      });
      input.value = "";
      if (artistInput) artistInput.value = "";
      if (lyricsInput) lyricsInput.value = "";
      resetNewSongLookupState({ keepInputs: true });
      closeModal('newSongModal');
      saveState();
      saveToStorageDebounced();
      showToast(opts.live && initialContent ? 'Song created and live' : (fetchedLyrics && !pastedLyrics ? t('song_created_with_fetched_lyrics') : t('song_created')));
    }

    // Something Escape should close first: a dialog, popover, picker or menu.
    function isTransientUiOpen() {
      const shown = (el) => {
        if (!el || el.hidden) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
      };
      if (typeof isCommandPaletteOpen === 'function' && isCommandPaletteOpen()) return true;
      if (typeof presetPopoverOpen !== 'undefined' && presetPopoverOpen) return true;
      if (typeof outputPopoverOpen !== 'undefined' && outputPopoverOpen) return true;
      if (document.querySelector('#imports-popover:not([hidden]), .sl-context-menu[aria-hidden="false"]')) return true;
      return [
        ...document.querySelectorAll('.modal-overlay, .sp-overlay, #first-run-setup'),
        document.getElementById('search-autocomplete'),
        document.getElementById('bible-ref-picker')
      ].some(shown);
    }

    // Clear everything on screen: output, Preview monitor and any lower thirds.
    function clearAllOutputs() {
      clearOutput();
      if (document.getElementById('name-role-overlay-show-btn')?.getAttribute('aria-pressed') === 'true') toggleNameRoleOverlay();
      if (document.getElementById('social-engagement-overlay-show-btn')?.getAttribute('aria-pressed') === 'true') toggleSocialEngagementOverlay();
      // After the clears above have queued their Preview refresh, empty Preview too
      setTimeout(() => {
        clearPreviewMonitor();
        setPreviewMonitorCaption('Cleared');
        setPreviewMonitorRef('');
      }, 0);
      showToast('Cleared everything');
    }

    // Live keys: Space go live · Alt/Ctrl+Space preview · Esc clear ·
    // Alt/Cmd/Ctrl+Esc clear preview · Shift+Esc clear all.
    // (Cmd+Space on macOS is Spotlight's and never reaches the app.)
    function handleLiveShortcut(e) {
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      const isEscape = e.key === 'Escape' || e.key === 'Esc';
      if (!isSpace && !isEscape) return false;
      if (e.repeat) { e.preventDefault(); return true; }
      if (isSpace) {
        e.preventDefault();
        if (e.altKey || e.ctrlKey || e.metaKey) previewCurrentSelection();
        else projectLive(true);
        return true;
      }
      if (isTransientUiOpen()) return false;
      e.preventDefault();
      if (e.shiftKey) clearAllOutputs();
      else if (e.altKey || e.metaKey || e.ctrlKey) clearProgramPreview();
      else clearOutput();
      return true;
    }

    // The shortcuts window: opened by "?", the command palette, and once after the first-run setup is finished
    function openShortcutsWindow() {
      openModal('shortcutsModal');
      try { localStorage.setItem('scripturePod.shortcutsSeen.v1', '1'); } catch (_) {}
    }
    function maybeShowShortcutsAfterSetup() {
      let seen = false;
      try { seen = localStorage.getItem('scripturePod.shortcutsSeen.v1') === '1'; } catch (_) {}
      if (seen) return;
      setTimeout(() => { if (![...document.querySelectorAll('.modal-overlay')].some((m) => m.style.display === 'flex')) openShortcutsWindow(); }, 500);
    }

    // Lyrics pasted from the web lose their verse numbers and repeat marks (1., x2, (x4), xn …) as they are pasted
    function setupLyricPasteCleaning() {
      ['new-song-lyrics', 'lyric-editor'].forEach((id) => {
        const ta = document.getElementById(id);
        if (!ta || ta.dataset.pasteClean) return;
        ta.dataset.pasteClean = '1';
        ta.addEventListener('paste', (e) => {
          const text = e.clipboardData && e.clipboardData.getData('text');
          if (!text || !window.SP_LYRICS_CLEAN) return;
          const cleaned = window.SP_LYRICS_CLEAN.cleanPastedLyrics(text);
          if (cleaned === text) return;
          e.preventDefault();
          const start = ta.selectionStart || 0, end = ta.selectionEnd || start;
          ta.value = ta.value.slice(0, start) + cleaned + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + cleaned.length;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof showToast === 'function') showToast('Tidied the pasted lyrics: verse numbers and repeat marks removed');
        });
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLyricPasteCleaning); else setupLyricPasteCleaning();

    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        const target = e.target;
        const tag = (target && target.tagName) ? target.tagName.toLowerCase() : '';
        const isTypingTarget = !!(target && (
          target.isContentEditable ||
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          (typeof target.closest === 'function' && target.closest('[contenteditable="true"]'))
        ));

        const isMod = e.ctrlKey || e.metaKey;
        const keyLower = (e.key || '').toLowerCase();
        if (isMod && (keyLower === 'a' || keyLower === 'c' || keyLower === 'v')) {
          const editor = document.getElementById('lyric-editor');
          if (!editor) return;

          // keep URL quick‑paste inputs working without hijack
          if (keyLower === 'v') {
            const bgType = document.getElementById('bg-type')?.value;
            const bgInput = (bgType === 'video') ? document.getElementById('bg-video-url') :
                            (bgType === 'image') ? document.getElementById('bg-image-url') : null;
            if (bgInput && bgInput.offsetParent !== null) return;
          }

          // We always want these three modifiers to operate on the lyric editor
          // regardless of where focus currently is, so do *not* bail out simply
          // because the user happens to be typing somewhere else.  (The
          // exception is when a background-URL field is active, handled above.)
          e.preventDefault();
          if (editorMode !== 'text') setEditorMode('text');
          editor.focus();

          if (keyLower === 'a') {
            editor.select();
            return;
          }

          if (keyLower === 'c') {
            const selected = editor.value.slice(editor.selectionStart || 0, editor.selectionEnd || 0);
            const textToCopy = selected || editor.value || '';
            if (navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(textToCopy).catch(() => {});
            } else {
              // fallback for environments without the async clipboard API
              try {
                const ta = document.createElement('textarea');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                ta.value = textToCopy;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              } catch (err) {}
            }
            return;
          }

          // keyLower === 'v'
          if (navigator.clipboard?.readText) {
            navigator.clipboard.readText().then((text) => {
              if (typeof text !== 'string' || !text.length) return;
              if (window.SP_LYRICS_CLEAN) text = window.SP_LYRICS_CLEAN.cleanPastedLyrics(text);
              const start = editor.selectionStart || 0;
              const end = editor.selectionEnd || 0;
              editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
              const nextPos = start + text.length;
              editor.selectionStart = nextPos;
              editor.selectionEnd = nextPos;
              saveCurrentItem();
            }).catch(() => {});
          } else {
            // allow default paste behaviour as last resort
            try { document.execCommand('paste'); } catch (_) {}
          }
          return;
        }

        if (isMod && keyLower === 'b' && !e.altKey) {
          e.preventDefault();
          toggleSidebar();
          return;
        }
        if (isTypingTarget) return;
        if (e.key === '?' && !isMod && !e.altKey) { e.preventDefault(); openShortcutsWindow(); return; }
        if (handleLiveShortcut(e)) return;
        if (!isMod && !e.altKey && !e.shiftKey && keyLower === 's') {
          e.preventDefault();
          toggleSidebar();
          return;
        }
        if (!isMod && !e.altKey && !e.shiftKey && keyLower === 'i') {
          e.preventDefault();
          if (typeof toggleImportsPopover === 'function') toggleImportsPopover();
          return;
        }
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const footerTabs = ['bible', 'songs', 'schedule'];
          const idx = Math.max(0, footerTabs.indexOf(sidebarTab));
          const direction = e.shiftKey ? -1 : 1;
          const next = footerTabs[(idx + direction + footerTabs.length) % footerTabs.length];
          switchBottomNavSidebarTab(next);
          return;
        }
        // Bible and lyrics use the same keys: up and down move through the verses or slides,
        // left and right through the chapters or songs
        if (e.key === 'ArrowDown') { e.preventDefault(); nextSlide(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); prevSlide(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); navigateSidebar(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigateSidebar(-1); }
        if (e.key === 'Enter') { e.preventDefault(); projectLive(true); }
        // Number keys 1-6: set lines in main panel
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 6 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const max = getMaxLinesForCurrentTab(sidebarTab);
          if (num <= max) {
            e.preventDefault();
            setLines(num);
          }
        }
      });
    }

    function setupUrlPasteShortcuts() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        const key = (e.key || '').toLowerCase();
        if (key !== 'v' || !(e.ctrlKey || e.metaKey)) return;
        const bgType = document.getElementById('bg-type')?.value;
        const input = (bgType === 'video') ? document.getElementById('bg-video-url') :
                      (bgType === 'image') ? document.getElementById('bg-image-url') : null;
        if (!input || input.offsetParent === null) return;
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (typeof text !== 'string') return;
          input.value = text.trim();
          input.focus();
          onAnyControlChange();
        }).catch(() => {});
      });
    }

