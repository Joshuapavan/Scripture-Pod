    function selectAbLanguage(code) {
      closeAbSettingsPopup();
      const sel = document.getElementById('language-select');
      if (sel) { sel.value = code; handleLanguageChange(); }
    }
    function buildAbLangSubmenu() {
      const host = document.getElementById('ab-lang-submenu');
      const src = document.getElementById('language-select');
      if (!host || !src) return;
      host.innerHTML = '';
      // Search bar
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ab-sub-search';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = t('settings_search_language');
      searchInput.onclick = e => e.stopPropagation();
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        host.querySelectorAll('.ab-popup-item').forEach(item => {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      };
      searchWrap.appendChild(searchInput);
      host.appendChild(searchWrap);
      // Language items
      Array.from(src.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'ab-popup-item';
        item.textContent = opt.textContent;
        item.onclick = () => selectAbLanguage(opt.value);
        host.appendChild(item);
      });
    }


    function saveWorkspaceTabPreference(tabId) {
      try { localStorage.setItem('activeWorkspaceTab', String(tabId || 'bible')); } catch (e) {}
    }

    function restoreWorkspaceTabPreference() {
      let saved = '';
      try { saved = String(localStorage.getItem('activeWorkspaceTab') || '').toLowerCase(); } catch (e) {}
      if (!saved) return;
      if (saved === 'song' || saved === 'songs') { setDockSceneTab('song'); return; }
      if (saved === 'bible') { setDockSceneTab('bible'); return; }
      if (saved === 'schedule') { setSidebarTab('schedule'); return; }
      setDockSceneTab('bible');
    }

    function getDisplayFileForTab(tabId, mode = 'embedded') {
      if (isWebSocketMode() && localServerInfo && localServerInfo.displayUrl) {
        return localServerInfo.displayUrl;
      }
      const params = new URLSearchParams();
      params.set(mode === 'standalone' ? 'standalone' : 'embedded', '1');
      params.set('hostMode', getHostMode());
      if (isWebSocketMode()) {
        const relayHost = resolveRelayHost() || '127.0.0.1';
        const relayPort = getRelayPort();
        params.set('relayPort', relayPort);
        params.set('relay', `ws://${relayHost}:${relayPort}`);
        const relayToken = String(localServerInfo?.relayToken || new URLSearchParams(window.location.search).get('relayToken') || '');
        if (relayToken) params.set('relayToken', relayToken);
      }
      return `../display/display.html?${params.toString()}`;
    }

    function shouldSkipPunctuationLine(line) {
      const t = (line || "").trim();
      if (!t) return true;
      return /^[\.,;:!?\-—_'""()\[\]{}…]+$/.test(t);
    }

    function shouldShowSongSolfaNotes() {
      return !!document.getElementById('show-song-solfa-notes')?.checked;
    }

    function getWorkspaceLabelText(tab = sidebarTab) {
      if (tab === 'songs') return 'Song';
      if (tab === 'schedule') return 'Setlist';
      return 'Bible';
    }

    function updateWorkspaceStateLabels(tab = sidebarTab) {
      const text = getWorkspaceLabelText(tab);
      const animationLabel = document.getElementById('animation-workspace-label');
      const annotateLabel = document.getElementById('annotate-workspace-label');
      if (animationLabel) animationLabel.textContent = text;
      if (annotateLabel) annotateLabel.textContent = text;
    }

    function shouldShowSongCategoryName() {
      return !!document.getElementById('show-song-category-name')?.checked;
    }

    function shouldDisplaySongsBySection() {
      return !!document.getElementById('display-song-sections')?.checked;
    }

    const SIDEBAR_QUICK_ACTION_GROUPS = [
      {
        titleKey: 'settings_song_options',
        items: [
          { id: 'show-song-category-name', labelKey: 'settings_show_category_name' },
          { id: 'display-song-sections', labelKey: 'settings_display_songs_by_sections' },
          {
            id: 'full-text-transform',
            labelKey: 'settings_song_text_transform',
            type: 'select',
            badgeKey: 'mode_full',
            options: [
              { value: 'none', labelKey: 'common_none' },
              { value: 'uppercase', labelKey: 'common_uppercase' },
              { value: 'lowercase', labelKey: 'common_lowercase' },
              { value: 'capitalize', labelKey: 'common_capitalize' }
            ]
          },
          {
            id: 'lt-text-transform',
            labelKey: 'settings_song_text_transform',
            type: 'select',
            badgeKey: 'mode_lt',
            options: [
              { value: 'uppercase', labelKey: 'common_uppercase' },
              { value: 'none', labelKey: 'common_none' },
              { value: 'lowercase', labelKey: 'common_lowercase' },
              { value: 'capitalize', labelKey: 'common_capitalize' }
            ]
          },
          {
            labelKey: 'settings_lower_third_mode',
            type: 'select',
            badgeKey: 'mode_lt',
            getValue: () => ltAnchorMode,
            onChange: (nextValue) => setLtAnchorMode(nextValue),
            options: [
              { value: 'bottom', labelKey: 'common_bottom' },
              { value: 'top', labelKey: 'common_top' }
            ]
          }
        ]
      },
      {
        titleKey: 'settings_bible_options',
        items: [
          { id: 'shorten-bible-versions', labelKey: 'settings_shorten_bible_versions' },
          { id: 'shorten-bible-books', labelKey: 'settings_shorten_bible_books' },
          { id: 'version-switch-updates-live', labelKey: 'settings_version_switch_updates_output' }
        ]
      }
    ];

    function parseSongCategoryName(line) {
      const match = String(line || '').trim().match(/^category\s*:\s*(.+)$/i);
      return match ? match[1].trim() : '';
    }

    function isLikelySolfaLine(line) {
      const t = String(line || '').trim();
      if (!t) return false;
      const semicolons = (t.match(/;/g) || []).length;
      if (semicolons < 3) return false;
      if (/^(category|verse|chorus|refrain)\b/i.test(t)) return false;
      if (t.length > 180) return false;
      return /^[a-z0-9;\s\-\]\[\(\)\.']+$/i.test(t);
    }

    function saveCurrentItem() {
      if (sidebarTab === 'bible' || !currentItem) return;
      const nextText = document.getElementById('lyric-editor').value;
      const prevText = currentItem.content || currentItem.text || '';
      if (nextText !== prevText && typeof recordSongVersion === 'function') recordSongVersion(currentItem.id, prevText);
      currentItem.content = nextText;
      currentItem.text = nextText;
      currentItem.updatedAt = Date.now();
      currentItem.searchableText = normalizeSearchText(`${currentItem.title || ''}\n${nextText}`);
      scheduleSongPersist(currentItem);
      saveState();
      saveToStorageDebounced();
      updateButtonView();
      if (document.activeElement !== document.getElementById('song-edit-title')) setSongEditStatus('Saved');
      if (isLive && livePointer && livePointer.kind === 'songs' && livePointer.index === currentIndex) scheduleLiveUpdate();
    }

    // Title and lyrics editing: lyrics autosave as you type; the title and the Save button commit
    function setSongEditStatus(text, dirty = false) {
      const el = document.getElementById('song-edit-status');
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('is-dirty', dirty);
    }

    function markSongEdited() { setSongEditStatus('Unsaved changes', true); }

    function syncSongEditBar() {
      const input = document.getElementById('song-edit-title');
      if (!input || document.activeElement === input) return;
      const song = currentItem && !getIsBibleItem(currentItem) ? currentItem : null;
      input.value = song ? (song.title || '') : '';
      input.disabled = !song;
      setSongEditStatus('Saved');
    }

    function saveSongEdits() {
      if (sidebarTab === 'bible' || !currentItem || getIsBibleItem(currentItem)) return;
      const input = document.getElementById('song-edit-title');
      const title = String(input ? input.value : currentItem.title || '').trim();
      if (!title) { showToast('Song title cannot be empty'); return; }
      if (title !== (currentItem.title || '')) {
        const idx = songs.indexOf(currentItem);
        if (idx < 0 || !renameSongTitle(idx, title)) return;
      }
      saveCurrentItem();
      if (typeof updateFocusedEditorBanner === 'function') updateFocusedEditorBanner();
      setSongEditStatus('Saved');
      showToast('Song saved');
      // Saved: straight back to the slides
      setEditorMode('btn');
      updateButtonView();
    }

    // Clicking the title opens the editor on the title field
    function editSongFromHeader() {
      if (sidebarTab !== 'songs' || !currentItem || getIsBibleItem(currentItem)) return;
      setEditorMode('text');
      const input = document.getElementById('song-edit-title');
      if (input) { input.focus(); input.select(); }
    }

    function captureSingleLineFontBaseline() {
      if (singleLineFontSizeSnapshot != null) return;
      if (linesPerPage !== 1) return;
      const fontInput = document.getElementById('font-size-val');
      if (!fontInput) return;
      singleLineFontSizeSnapshot = Number(fontInput.value || DEFAULT_BIBLE_FULL_FONT);
    }

    function createDefaultFocusedWorkspaceControlState(tab) {
      return {
        linesPerPage: (tab === 'bible') ? 1 : Math.min(2, getMaxLinesForCurrentTab(tab)),
        activeRatio: 'full',
        bgToggle: true,
        bgMode: 'solid',
        bgType: 'color',
        songTransitionType: 'fade',
        songTransitionDuration: '0.8',
        animateBgTransitions: false,
        presetPopoverOpen: false,
        annotateOpen: false,
        annotateColor: null,
        annotatePickerColor: ''
      };
    }

    function createDefaultFocusedWorkspaceControls() {
      const next = {};
      FOCUSED_WORKSPACE_TABS.forEach((tab) => {
        next[tab] = createDefaultFocusedWorkspaceControlState(tab);
      });
      return next;
    }

    function normalizeFocusedWorkspaceControlState(raw, tab) {
      const base = createDefaultFocusedWorkspaceControlState(tab);
      const next = (raw && typeof raw === 'object') ? raw : {};
      const maxLines = getMaxLinesForCurrentTab(tab);
      const rawLines = Number.parseInt(next.linesPerPage, 10);
      const rawRatio = next.activeRatio === '16-9' ? '16-9' : 'full';
      return {
        linesPerPage: Math.max(1, Math.min(maxLines, Number.isFinite(rawLines) ? rawLines : base.linesPerPage)),
        activeRatio: rawRatio,
        bgToggle: next.bgToggle == null ? base.bgToggle : !!next.bgToggle,
        bgMode: next.bgMode === 'gradient' ? 'gradient' : 'solid',
        bgType: next.bgType === 'image' || next.bgType === 'video' ? next.bgType : 'color',
        songTransitionType: String(next.songTransitionType || base.songTransitionType || 'fade'),
        songTransitionDuration: String(next.songTransitionDuration || base.songTransitionDuration || '0.8'),
        animateBgTransitions: next.animateBgTransitions == null ? base.animateBgTransitions : !!next.animateBgTransitions,
        presetPopoverOpen: !!next.presetPopoverOpen,
        annotateOpen: !!next.annotateOpen,
        annotateColor: next.annotateColor || null,
        annotatePickerColor: next.annotatePickerColor || ''
      };
    }

    function ensureFocusedWorkspaceControlsState() {
      if (!focusedWorkspaceControlsByTab || typeof focusedWorkspaceControlsByTab !== 'object') {
        focusedWorkspaceControlsByTab = createDefaultFocusedWorkspaceControls();
        return focusedWorkspaceControlsByTab;
      }
      FOCUSED_WORKSPACE_TABS.forEach((tab) => {
        focusedWorkspaceControlsByTab[tab] = normalizeFocusedWorkspaceControlState(focusedWorkspaceControlsByTab[tab], tab);
      });
      return focusedWorkspaceControlsByTab;
    }

    function captureFocusedWorkspaceControlState(tab = sidebarTab) {
      const bgToggle = document.getElementById('bg-toggle');
      const bgType = document.getElementById('bg-type');
      return normalizeFocusedWorkspaceControlState({
        linesPerPage,
        activeRatio,
        bgToggle: bgToggle ? !!bgToggle.checked : true,
        bgMode,
        bgType: bgType ? bgType.value : 'color',
        songTransitionType: document.getElementById('song-transition-type')?.value || 'fade',
        songTransitionDuration: document.getElementById('song-transition-duration')?.value || '0.8',
        animateBgTransitions: document.getElementById('animate-bg-transitions')?.checked !== false,
        presetPopoverOpen: typeof presetPopoverOpen !== 'undefined' ? !!presetPopoverOpen : false,
        ...(typeof getAnnotateWorkspaceState === 'function' ? getAnnotateWorkspaceState() : {})
      }, tab);
    }

    function saveFocusedWorkspaceControlsForTab(tab = sidebarTab) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return;
      const controls = ensureFocusedWorkspaceControlsState();
      controls[tab] = captureFocusedWorkspaceControlState(tab);
    }

    function loadFocusedWorkspaceControlsFromUi(ui) {
      const defaults = createDefaultFocusedWorkspaceControls();
      const source = (ui && ui.focusedWorkspaceControls && typeof ui.focusedWorkspaceControls === 'object')
        ? ui.focusedWorkspaceControls
        : {};
      focusedWorkspaceControlsByTab = {};
      FOCUSED_WORKSPACE_TABS.forEach((tab) => {
        focusedWorkspaceControlsByTab[tab] = normalizeFocusedWorkspaceControlState(source[tab] || defaults[tab], tab);
      });
      return focusedWorkspaceControlsByTab;
    }

    function applyFocusedWorkspaceControlsForTab(tab, opts = {}) {
      if (!FOCUSED_WORKSPACE_TABS.includes(tab)) return false;
      const controls = ensureFocusedWorkspaceControlsState();
      const next = normalizeFocusedWorkspaceControlState(controls[tab], tab);
      controls[tab] = next;

      linesPerPage = next.linesPerPage;
      activeRatio = next.activeRatio;
      bgMode = next.bgMode;

      const bgToggle = document.getElementById('bg-toggle');
      if (bgToggle) {
        bgToggle.checked = !!next.bgToggle;
      }

      const bgType = document.getElementById('bg-type');
      if (bgType) {
        bgType.value = next.bgType;
      }
      const transitionType = document.getElementById('song-transition-type');
      if (transitionType) transitionType.value = next.songTransitionType || 'fade';
      const transitionDuration = document.getElementById('song-transition-duration');
      if (transitionDuration) {
        transitionDuration.value = next.songTransitionDuration || '0.8';
        if (typeof updateSliderValue === 'function') updateSliderValue(transitionDuration, 's');
        if (typeof updateSliderFill === 'function') updateSliderFill(transitionDuration);
      }
      const animateBgToggle = document.getElementById('animate-bg-transitions');
      if (animateBgToggle) animateBgToggle.checked = !!next.animateBgTransitions;

      document.querySelectorAll('#line-picker .seg-btn').forEach((b) => b.classList.toggle('active', b.id === 'line-' + linesPerPage));
      const ratioFullBtn = document.getElementById('ratio-full');
      const ratioLtBtn = document.getElementById('ratio-lt');
      const ratioCustomBtn = document.getElementById('ratio-custom');
      if (ratioFullBtn) ratioFullBtn.classList.toggle('active', activeRatio === 'full');
      if (ratioLtBtn) ratioLtBtn.classList.toggle('active', activeRatio === '16-9');
      if (ratioCustomBtn) ratioCustomBtn.classList.toggle('active', false);

      updateBgModeUi();
      updateBgTypePicker();
      handleBgTypeChange();
      syncBgOpacitySlider();
      if (typeof setPresetPopoverOpen === 'function') setPresetPopoverOpen(!!next.presetPopoverOpen, { persist: false });
      if (typeof applyAnnotateWorkspaceState === 'function') {
        applyAnnotateWorkspaceState({
          annotateOpen: !!next.annotateOpen,
          annotateColor: next.annotateColor || null,
          annotatePickerColor: next.annotatePickerColor || ''
        }, { persist: false });
      }
      updateLinePickerAvailability();
      updateCustomModeAvailability();
      updateTextEditorModeAvailability();
      updateSongTextTransformControl();
      handleSongFullFontState({ suppressLiveUpdate: true });

      if (opts.render !== false) {
        updateButtonView({ preserveScroll: true, skipAutoScroll: true });
      }
      return true;
    }

    function getMaxLinesForCurrentTab(tab = sidebarTab) {
      return (tab === 'songs') ? 6 : 3;
    }

    function updateLinePickerAvailability() {
      const isSongs = (sidebarTab === 'songs');
      const btn4 = document.getElementById('line-4');
      const btn5 = document.getElementById('line-5');
      const btn6 = document.getElementById('line-6');
      if (btn4) btn4.disabled = !isSongs;
      if (btn5) btn5.disabled = !isSongs;
      if (btn6) btn6.disabled = !isSongs;
    }

    function isCustomModeAllowed() {
      if (sidebarTab === 'bible') return true;
      if (sidebarTab === 'schedule') {
        return currentItem ? getIsBibleItem(currentItem) : false;
      }
      return false;
    }

    function updateCustomModeAvailability() {
      const customBtn = document.getElementById('ratio-custom');
      if (!customBtn) return;
      const allowed = isCustomModeAllowed();
      customBtn.disabled = !allowed;
      if (!allowed && activeRatio === 'custom') {
        setRatio('full');
      }
    }

    function updateTextEditorModeAvailability() {
      const textBtn = document.getElementById('mode-text');
      if (!textBtn) return;
      const isBible = isBibleContentActive() || sidebarTab === 'bible';
      textBtn.disabled = isBible;
      if (isBible && editorMode === 'text') {
        setEditorMode('btn');
      }
    }

    function setLines(n, opts = {}) {
      const maxLines = getMaxLinesForCurrentTab(sidebarTab);
      const targetLines = Math.max(1, Math.min(n, maxLines));
      if (targetLines !== n) n = targetLines;
      if (n > 1 && linesPerPage === 1) {
        captureSingleLineFontBaseline();
      }
      const isBible = sidebarTab === 'bible' && currentItem && getIsBibleItem(currentItem);
      let anchorVerse = opts.anchorVerse ? String(opts.anchorVerse).trim() : null;
      if (isBible && !anchorVerse) {
        const prevPages = getPagesFromItem(currentItem, true);
        const prevPage = prevPages[lineCursor];
        anchorVerse = (prevPage && prevPage.startVerse) ? String(prevPage.startVerse).trim() : getFirstVerseNumber(prevPage && prevPage.raw);
      }
      const fullFontInput = document.getElementById('font-size-val');
      if (n === 1) {
        restoreLongVerseFullFontOverride(true);
        if (singleLineFontSizeSnapshot != null && fullFontInput) {
          fullFontInput.value = String(singleLineFontSizeSnapshot);
          singleLineFontSizeSnapshot = null;
        }
      }
      linesPerPage = n;
      const panelKind = getCurrentPanelContentKind();
      if (isLive && livePointer && panelKind && livePointer.kind === panelKind) {
        liveLinesPerPage = n;
      }
      if (isBible && anchorVerse) {
        setBibleGroupAnchor(anchorVerse, currentItem);
        const pages = getPagesFromItem(currentItem, true);
        const targetIdx = pages.findIndex(p => matchesVerseStart(p.raw, anchorVerse));
        if (targetIdx !== -1) lineCursor = targetIdx;
      }
      document.querySelectorAll('#line-picker .seg-btn').forEach(b => b.classList.toggle('active', b.id === 'line-' + n));
      updateButtonView();
      if (isLive && livePointer && livePointer.kind === 'bible' && currentItem && currentItem.version === livePointer.version && currentIndex === livePointer.index) {
        liveLineCursor = lineCursor;
      }
      if (!opts.silent) onAnyControlChange();
    }

    // The default look: a deep navy spotlight background, verses in Source Serif 4, and
    // the reference above each verse as a small muted Geist Mono label, left aligned.
    // Applied once per computer so existing settings are not overwritten again.
    const LOOK_DEFAULTS_KEY = 'scripturePod.lookDefaults.v5';

    function applyDisplayLookDefaults() {
      try { if (localStorage.getItem(LOOK_DEFAULTS_KEY) === 'done') return; } catch (error) { /* apply anyway */ }
      const $ = (id) => document.getElementById(id);
      const verseFont = "'Source Serif 4','Noto Sans Kannada','Noto Sans Tamil',serif";
      if (typeof renderFontFamilyOptions === 'function') renderFontFamilyOptions(verseFont);
      if ($('font-family')) $('font-family').value = verseFont;
      if ($('font-weight')) $('font-weight').value = '600';
      if ($('font-size-val')) $('font-size-val').value = '44';
      if ($('ref-font-size-val')) $('ref-font-size-val').value = '24';
      if ($('text-color')) { $('text-color').value = '#ffffff'; if (typeof syncTextColorFromPicker === 'function') syncTextColorFromPicker(); }
      if ($('ref-color')) { $('ref-color').value = '#9fb0d0'; if (typeof syncRefColorFromPicker === 'function') syncRefColorFromPicker(); }
      if ($('full-ref-text-transform')) { $('full-ref-text-transform').value = 'none'; if (typeof handleReferenceTextTransformChange === 'function') handleReferenceTextTransformChange('full'); }
      if ($('full-text-transform')) { $('full-text-transform').value = 'none'; if (typeof handleFullTextTransformChange === 'function') handleFullTextTransformChange(); }
      setRefBgEnabled(false, { silent: true });
      fullRefHAlign = 'left';
      fullHAlign = 'left';
      fullVAlign = 'middle';
      if ($('pad-lr-full')) { $('pad-lr-full').value = '7'; if (typeof updateSliderValue === 'function') updateSliderValue($('pad-lr-full'), '%'); }
      if ($('dual-version-gap')) { $('dual-version-gap').value = '72'; if (typeof updateSliderValue === 'function') updateSliderValue($('dual-version-gap'), 'px'); if (typeof saveDualVersionGap === 'function') saveDualVersionGap(); }
      // Background: spotlight gradient, customisable in Look and Settings > Background
      bgGradientShadow = '#070b14';
      bgGradientHighlight = '#22365c';
      if ($('bg-color-shadow')) $('bg-color-shadow').value = bgGradientShadow;
      if ($('bg-color-highlight')) $('bg-color-highlight').value = bgGradientHighlight;
      if ($('bg-gradient-shape')) $('bg-gradient-shape').value = 'radial';
      if ($('bg-toggle')) $('bg-toggle').checked = true;
      if ($('bg-type')) { $('bg-type').value = 'color'; if (typeof handleBgTypeChange === 'function') handleBgTypeChange(); }
      setBgMode('gradient', { silent: true });
      if (typeof updateBgModePicker === 'function') updateBgModePicker();
      updateFullAlignButtons();
      try { localStorage.setItem(LOOK_DEFAULTS_KEY, 'done'); } catch (error) { /* storage unavailable */ }
      onAnyControlChange();
      if (typeof saveToStorageDebounced === 'function') saveToStorageDebounced();
    }

    // Settings > Bible Options > "Hide lower-third options for verses" (on by
    // default): verses always show full screen and the Mode choice is hidden.
    const VERSE_LT_HIDDEN_KEY = 'scripturePod.hideVerseLowerThird.v1';

    function isVerseLowerThirdHidden() {
      try { return localStorage.getItem(VERSE_LT_HIDDEN_KEY) !== '0'; } catch (error) { return true; }
    }

    function applyVerseLtPolicy() {
      const hidden = isVerseLowerThirdHidden();
      document.body.dataset.hideVerseLt = hidden ? '1' : '0';
      const toggle = document.getElementById('hide-verse-lt');
      if (toggle) toggle.checked = hidden;
      if (hidden && sidebarTab === 'bible' && activeRatio === '16-9') setRatio('full');
    }

    function handleHideVerseLtToggle() {
      const toggle = document.getElementById('hide-verse-lt');
      try { localStorage.setItem(VERSE_LT_HIDDEN_KEY, toggle && toggle.checked ? '1' : '0'); } catch (error) { /* storage unavailable */ }
      applyVerseLtPolicy();
    }

    function setRatio(r) {
      if (r === 'custom') r = 'full';
      if (r === '16-9' && sidebarTab === 'bible' && isVerseLowerThirdHidden()) r = 'full';
      const prevRatio = activeRatio;
      activeRatio = r;
      document.getElementById('ratio-full').classList.toggle('active', r === 'full');
      document.getElementById('ratio-lt').classList.toggle('active', r === '16-9');
      document.getElementById('ratio-custom').classList.toggle('active', r === 'custom');

      if (r === 'custom' && ltStyle === 'default') setLtStyle('custom');
      if (r === 'full' && prevRatio !== 'full') document.getElementById('bg-toggle').checked = true;
      if (r === '16-9') applyLtBgDefaultForTab(getEffectiveContentTab());
      const panelKind = getCurrentPanelContentKind();
      if (isLive && livePointer && panelKind && livePointer.kind === panelKind) {
        liveRatio = r;
      }

      handleDualFontOverrideState();
      syncBgOpacitySlider();
      updateSongTextTransformControl();
      handleSongFullFontState({ suppressLiveUpdate: true });
      onAnyControlChange();
    }

    function setFullHAlign(val) {
      fullHAlign = val || 'center';
      updateFullAlignButtons();
      onAnyControlChange();
    }

    function setFullRefHAlign(val) {
      fullRefHAlign = val || 'center';
      updateFullAlignButtons();
      onAnyControlChange();
    }

    function setFullVAlign(val) {
      fullVAlign = val || 'middle';
      updateFullAlignButtons();
      onAnyControlChange();
    }





    // Lower Third alignment handlers
    function setLtHAlign(val) {
      const v = val || 'center';
      if (sidebarTab === 'bible') {
        ltHAlignBible = v;
      } else {
        ltHAlignSongs = v;
      }
      updateLtAlignButtons();
      onAnyControlChange();
    }

    function setLtVAlign(val) {
      const v = val || 'middle';
      if (sidebarTab === 'bible') {
        ltVAlignBible = v;
      } else {
        ltVAlignSongs = v;
      }
      updateLtAlignButtons();
      onAnyControlChange();
    }

    function setLtAnchorMode(val) {
      ltAnchorMode = (val === 'top') ? 'top' : 'bottom';
      updateLtAnchorButtons();
      onAnyControlChange();
    }

    function setLtBibleVerseHAlign(val) {
      ltHAlignBibleVerse = val || 'left';
      updateLtBibleVerseAlignButtons();
      onAnyControlChange();
    }

    function updateLtAlignButtons() {
      // Horizontal
      const hMap = { left: 'lt-h-left', center: 'lt-h-center', right: 'lt-h-right', justify: 'lt-h-justify' };
      const currentH = (sidebarTab === 'bible') ? ltHAlignBible : ltHAlignSongs;
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', currentH === key);
      });

      // Vertical
      const vMap = { top: 'lt-v-top', middle: 'lt-v-middle', bottom: 'lt-v-bottom' };
      const currentV = (sidebarTab === 'bible') ? ltVAlignBible : ltVAlignSongs;
      Object.entries(vMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', currentV === key);
      });

      updateLtBibleVerseAlignButtons();
      updateLtAnchorButtons();
      updateLtAlignTooltip();
    }

    function updateLtAnchorButtons() {
      const topBtn = document.getElementById('lt-anchor-top');
      const bottomBtn = document.getElementById('lt-anchor-bottom');
      if (topBtn) topBtn.classList.toggle('active', ltAnchorMode === 'top');
      if (bottomBtn) bottomBtn.classList.toggle('active', ltAnchorMode !== 'top');
    }

    function updateLtBibleVerseAlignButtons() {
      const hMap = { left: 'lt-bv-h-left', center: 'lt-bv-h-center', right: 'lt-bv-h-right', justify: 'lt-bv-h-justify' };
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', ltHAlignBibleVerse === key);
      });
    }

    function updateLtBibleVerseAlignVisibility() {
      const row = document.getElementById('lt-bible-verse-align-row');
      if (!row) return;
      row.style.display = (sidebarTab === 'bible') ? '' : 'none';
    }

    function updateLtAlignTooltip() {
      const hPick = document.getElementById('lt-h-align-picker');
      const vPick = document.getElementById('lt-v-align-picker');
      if (hPick) hPick.title = t('settings_horizontal_align');
      if (vPick) vPick.title = t('settings_vertical_align');
    }

    function capitalize(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }

    function updateFullAlignButtons() {
      // Look card: where the reference sits (left, middle, right)
      ['left', 'center', 'right'].forEach((key) => {
        const el = document.getElementById(`look-ref-${key}`);
        if (el) {
          el.classList.toggle('active', fullRefHAlign === key);
          el.setAttribute('aria-pressed', fullRefHAlign === key ? 'true' : 'false');
        }
      });
      const refMap = { left: 'full-ref-h-left', center: 'full-ref-h-center', right: 'full-ref-h-right', justify: 'full-ref-h-justify' };
      Object.entries(refMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', fullRefHAlign === key);
      });
      const hMap = { left: 'full-h-left', center: 'full-h-center', right: 'full-h-right', justify: 'full-h-justify' };
      Object.entries(hMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', fullHAlign === key);
      });
      const vMap = { top: 'full-v-top', middle: 'full-v-middle', bottom: 'full-v-bottom' };
      Object.entries(vMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', fullVAlign === key);
      });
    }



    function setRefBgEnabled(enabled, opts = {}) {
      refBgEnabled = !!enabled;
      const onBtn = document.getElementById('ref-bg-toggle-on');
      const offBtn = document.getElementById('ref-bg-toggle-off');
      if (onBtn) onBtn.classList.toggle('active', refBgEnabled);
      if (offBtn) offBtn.classList.toggle('active', !refBgEnabled);
      const row = document.getElementById('ref-bg-color-row');
      const effectiveTarget = (typeof getEffectiveSettingsTargetTab === 'function')
        ? getEffectiveSettingsTargetTab()
        : 'bible';
      if (row) row.style.display = (effectiveTarget === 'songs') ? 'none' : (refBgEnabled ? '' : 'none');
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setReferenceShadowEnabled(enabled, opts = {}) {
      referenceShadowEnabled = !!enabled;
      const onBtn = document.getElementById('ref-shadow-on');
      const offBtn = document.getElementById('ref-shadow-off');
      if (onBtn) onBtn.classList.toggle('active', referenceShadowEnabled);
      if (offBtn) offBtn.classList.toggle('active', !referenceShadowEnabled);
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setVerseShadowEnabled(enabled, opts = {}) {
      verseShadowEnabled = !!enabled;
      const onBtn = document.getElementById('verse-shadow-on');
      const offBtn = document.getElementById('verse-shadow-off');
      if (onBtn) onBtn.classList.toggle('active', verseShadowEnabled);
      if (offBtn) offBtn.classList.toggle('active', !verseShadowEnabled);
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setReferenceCapitalized(enabled, opts = {}) {
      referenceTextCapitalized = !!enabled;
      const normalizedTransform = referenceTextCapitalized ? 'uppercase' : 'none';
      if (typeof updateReferenceTextTransformValue === 'function') {
        updateReferenceTextTransformValue('full', normalizedTransform);
        updateReferenceTextTransformValue('lt', normalizedTransform);
      }
      const toggle = document.getElementById('capitalize-ref-text');
      if (toggle) toggle.checked = referenceTextCapitalized;
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setDualVersionSecondaryId(id, opts = {}) {
      const normalized = (id && bibles && bibles[id]) ? id : null;
      dualVersionSecondaryId = normalized;
      const select = document.getElementById('dual-version-secondary-select');
      if (select) {
        select.value = normalized || '';
      }
      renderDualVersionPickers();
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function setDualVersionTertiaryId(id, opts = {}) {
      const normalized = (id && bibles && bibles[id]) ? id : null;
      dualVersionTertiaryId = normalized;
      const select = document.getElementById('dual-version-tertiary-select');
      if (select) {
        select.value = normalized || '';
      }
      renderDualVersionPickers();
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function closeDualVersionMenus() {
      const primaryMenu = document.getElementById('dual-version-primary-menu');
      const secondaryMenu = document.getElementById('dual-version-secondary-menu');
      const tertiaryMenu = document.getElementById('dual-version-tertiary-menu');
      if (primaryMenu) primaryMenu.classList.remove('open');
      if (secondaryMenu) secondaryMenu.classList.remove('open');
      if (tertiaryMenu) tertiaryMenu.classList.remove('open');
    }

    function toggleDualVersionMenu(kind, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const menuId = (kind === 'secondary') ? 'dual-version-secondary-menu' : (kind === 'tertiary') ? 'dual-version-tertiary-menu' : 'dual-version-primary-menu';
      const menu = document.getElementById(menuId);
      if (!menu) return;
      const isOpen = menu.classList.contains('open');
      closeDualVersionMenus();
      if (!isOpen) {
        menu.classList.add('open');
        requestAnimationFrame(() => {
          const input = menu.querySelector('.dual-version-picker-search input');
          if (input) {
            try { input.focus(); } catch (_) {}
          }
        });
      }
    }

    function selectDualVersionOption(kind, value) {
      if (kind === 'secondary') {
        const select = document.getElementById('dual-version-secondary-select');
        if (select) select.value = value || '';
        handleDualSecondarySelectChange();
      } else if (kind === 'tertiary') {
        const select = document.getElementById('dual-version-tertiary-select');
        if (select) select.value = value || '';
        handleDualTertiarySelectChange();
      } else {
        const select = document.getElementById('dual-version-primary-select');
        if (select) select.value = value || '';
        handleDualPrimarySelectChange();
      }
      closeDualVersionMenus();
    }

    // tertiary support
    function handleDualTertiarySelectChange() {
      const select = document.getElementById('dual-version-tertiary-select');
      if (!select) return;
      setDualVersionTertiaryId(select.value);
      handleDualFontOverrideState();
    }

    function renderDualVersionPickers() {
      const versions = Object.keys(bibles || {});
      const primaryBtn = document.getElementById('dual-version-primary-btn');
      const secondaryBtn = document.getElementById('dual-version-secondary-btn');
      const tertiaryBtn = document.getElementById('dual-version-tertiary-btn');
      const primaryMenu = document.getElementById('dual-version-primary-menu');
      const secondaryMenu = document.getElementById('dual-version-secondary-menu');
      const tertiaryMenu = document.getElementById('dual-version-tertiary-menu');
      const primarySelect = document.getElementById('dual-version-primary-select');
      const secondarySelect = document.getElementById('dual-version-secondary-select');
      const tertiarySelect = document.getElementById('dual-version-tertiary-select');
      if (!primaryBtn || !secondaryBtn || !primaryMenu || !secondaryMenu || !primarySelect || !secondarySelect || !tertiaryBtn || !tertiaryMenu || !tertiarySelect) return;

      const primaryValue = primarySelect.value || '';
      const secondaryValue = secondarySelect.value || '';
      const tertiaryValue = tertiarySelect.value || '';
      primaryBtn.textContent = primaryValue || 'Select version';
      secondaryBtn.textContent = secondaryValue || t('ui_select_secondary_version');
      tertiaryBtn.textContent = tertiaryValue || t('ui_select_tertiary_version') || 'Tertiary version';
      primaryBtn.disabled = versions.length === 0;
      secondaryBtn.disabled = versions.length < 2;
      tertiaryBtn.disabled = versions.length < 3;

      primaryMenu.innerHTML = '';
      const primarySearchWrap = document.createElement('div');
      primarySearchWrap.className = 'dual-version-picker-search';
      const primarySearchInput = document.createElement('input');
      primarySearchInput.type = 'text';
      primarySearchInput.placeholder = t('ui_search_generic');
      primarySearchInput.autocomplete = 'off';
      primarySearchInput.setAttribute('aria-label', t('ui_search_generic'));
      primarySearchWrap.appendChild(primarySearchInput);
      primaryMenu.appendChild(primarySearchWrap);
      const primaryRows = [];
      versions.forEach((ver) => {
        const wrapper = document.createElement('div');
        wrapper.className = `footer-bv-item ${primaryValue === ver ? 'active' : ''}`;
        wrapper.dataset.searchLabel = normalizeSearchText(ver);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-bv-btn';
        btn.innerHTML = `
          <svg class="footer-bv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>${esc(ver)}</span>
        `;
        btn.onclick = () => selectDualVersionOption('primary', ver);
        wrapper.appendChild(btn);
        primaryRows.push(wrapper);
        primaryMenu.appendChild(wrapper);
      });
      primarySearchInput.addEventListener('input', () => {
        const q = normalizeSearchText(primarySearchInput.value || '').trim();
        primaryRows.forEach(row => {
          const label = row.dataset.searchLabel || '';
          row.style.display = !q || label.includes(q) ? '' : 'none';
        });
      });

      secondaryMenu.innerHTML = '';
      const secondarySearchWrap = document.createElement('div');
      secondarySearchWrap.className = 'dual-version-picker-search';
      const secondarySearchInput = document.createElement('input');
      secondarySearchInput.type = 'text';
      secondarySearchInput.placeholder = t('ui_search_generic');
      secondarySearchInput.autocomplete = 'off';
      secondarySearchInput.setAttribute('aria-label', t('ui_search_generic'));
      secondarySearchWrap.appendChild(secondarySearchInput);
      secondaryMenu.appendChild(secondarySearchWrap);
      const secondaryRows = [];
      versions.forEach((ver) => {
        const disabled = (ver === activeBibleVersion);
        const wrapper = document.createElement('div');
        wrapper.className = `footer-bv-item ${secondaryValue === ver ? 'active' : ''}${disabled ? ' disabled' : ''}`;
        wrapper.dataset.searchLabel = normalizeSearchText(ver);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-bv-btn';
        btn.innerHTML = `
          <svg class="footer-bv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>${esc(ver)}</span>
        `;
        btn.disabled = disabled;
        btn.onclick = () => selectDualVersionOption('secondary', ver);
        wrapper.appendChild(btn);
        secondaryRows.push(wrapper);
        secondaryMenu.appendChild(wrapper);
      });
      secondarySearchInput.addEventListener('input', () => {
        const q = normalizeSearchText(secondarySearchInput.value || '').trim();
        secondaryRows.forEach(row => {
          const label = row.dataset.searchLabel || '';
          row.style.display = !q || label.includes(q) ? '' : 'none';
        });
      });

      // tertiary menu
      tertiaryMenu.innerHTML = '';
      const tertiarySearchWrap = document.createElement('div');
      tertiarySearchWrap.className = 'dual-version-picker-search';
      const tertiarySearchInput = document.createElement('input');
      tertiarySearchInput.type = 'text';
      tertiarySearchInput.placeholder = t('ui_search_generic');
      tertiarySearchInput.autocomplete = 'off';
      tertiarySearchInput.setAttribute('aria-label', t('ui_search_generic'));
      tertiarySearchWrap.appendChild(tertiarySearchInput);
      tertiaryMenu.appendChild(tertiarySearchWrap);
      const tertiaryRows = [];
      versions.forEach((ver) => {
        const disabled = (ver === activeBibleVersion) || (ver === dualVersionSecondaryId);
        const wrapper = document.createElement('div');
        wrapper.className = `footer-bv-item ${tertiaryValue === ver ? 'active' : ''}${disabled ? ' disabled' : ''}`;
        wrapper.dataset.searchLabel = normalizeSearchText(ver);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-bv-btn';
        btn.innerHTML = `
          <svg class="footer-bv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>${esc(ver)}</span>
        `;
        btn.disabled = disabled;
        btn.onclick = () => selectDualVersionOption('tertiary', ver);
        wrapper.appendChild(btn);
        tertiaryRows.push(wrapper);
        tertiaryMenu.appendChild(wrapper);
      });
      tertiarySearchInput.addEventListener('input', () => {
        const q = normalizeSearchText(tertiarySearchInput.value || '').trim();
        tertiaryRows.forEach(row => {
          const label = row.dataset.searchLabel || '';
          row.style.display = !q || label.includes(q) ? '' : 'none';
        });
      });
    }

    function shouldApplyDualFontOverride() {
      const autoResizeFull = document.getElementById('auto-resize-full')?.value || 'none';
      return dualVersionModeEnabled &&
        !!dualVersionSecondaryId &&
        activeRatio === 'full' &&
        sidebarTab === 'bible' &&
        autoResizeFull !== 'none';
    }

    function captureDualFontSizes() {
      const verseInput = document.getElementById('font-size-val');
      const refInput = document.getElementById('ref-font-size-val');
      if (!verseInput || !refInput) return null;
      return {
        verse: Number(verseInput.value || DEFAULT_BIBLE_FULL_FONT),
        ref: Number(refInput.value || 45)
      };
    }

    function applyDualFontOverride(opts = {}) {
      if (dualModeFontOverrideActive) return;
      const verseInput = document.getElementById('font-size-val');
      const refInput = document.getElementById('ref-font-size-val');
      if (!verseInput || !refInput) return;
      if (!dualModeFontOverrideSnapshot) {
        const snapshot = captureDualFontSizes();
        if (!snapshot) return;
        dualModeFontOverrideSnapshot = snapshot;
      }
      dualModeFontOverrideActive = true;
    }

    function restoreDualFontOverride(force = false, opts = {}) {
      if (!dualModeFontOverrideActive && !force) return;
      const snapshot = dualModeFontOverrideSnapshot;
      if (!snapshot) {
        dualModeFontOverrideActive = false;
        return;
      }
      const verseInput = document.getElementById('font-size-val');
      const refInput = document.getElementById('ref-font-size-val');
      if (verseInput) {
        verseInput.value = String(snapshot.verse);
      }
      if (refInput) {
        refInput.value = String(snapshot.ref);
      }
      dualModeFontOverrideActive = false;
      dualModeFontOverrideSnapshot = null;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function shouldApplyDualLtOverride() {
      return dualVersionModeEnabled &&
        !!dualVersionSecondaryId &&
        activeRatio === '16-9' &&
        sidebarTab === 'bible';
    }

    function captureDualLtSettings() {
      const verseInput = document.getElementById('font-size-lt-val');
      const refInput = document.getElementById('ref-font-size-lt-val');
      const autoResize = document.getElementById('auto-resize-lt');
      if (!verseInput || !refInput) return null;
      return {
        verse: Number(verseInput.value || 36),
        ref: Number(refInput.value || 26),
        autoResize: autoResize ? autoResize.value : null
      };
    }

    function applyDualLtOverride(opts = {}) {
      if (dualModeLtActive) return;
      const verseInput = document.getElementById('font-size-lt-val');
      const refInput = document.getElementById('ref-font-size-lt-val');
      const autoResize = document.getElementById('auto-resize-lt');
      if (!verseInput || !refInput || !autoResize) return;
      if (!dualModeLtSnapshot) {
        const snapshot = captureDualLtSettings();
        if (!snapshot) return;
        dualModeLtSnapshot = snapshot;
      }
      const dualBibleLtMaxFont = (typeof DUAL_BIBLE_LT_MAX_FONT === 'number') ? DUAL_BIBLE_LT_MAX_FONT : 23;
      const nextVerseSize = Math.min(Number(verseInput.value || dualBibleLtMaxFont), dualBibleLtMaxFont);
      ltFontBible = nextVerseSize;
      verseInput.value = String(nextVerseSize);
      refInput.value = String(Math.min(Number(refInput.value || 22), 22));
      ltRefFontSize = Number(refInput.value || 22);
      autoResize.value = 'shrink';
      dualModeLtActive = true;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function restoreDualLtOverride(force = false, opts = {}) {
      if (!dualModeLtActive && !force) return;
      const snapshot = dualModeLtSnapshot;
      if (!snapshot) {
        dualModeLtActive = false;
        return;
      }
      const verseInput = document.getElementById('font-size-lt-val');
      const refInput = document.getElementById('ref-font-size-lt-val');
      const autoResize = document.getElementById('auto-resize-lt');
      if (verseInput) {
        verseInput.value = String(snapshot.verse);
        ltFontBible = snapshot.verse;
      }
      if (refInput) {
        refInput.value = String(snapshot.ref);
        ltRefFontSize = snapshot.ref;
      }
      if (autoResize && snapshot.autoResize != null) {
        autoResize.value = snapshot.autoResize;
      }
      dualModeLtActive = false;
      dualModeLtSnapshot = null;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    function handleDualFontOverrideState(opts = {}) {
      if (sidebarTab !== 'bible') {
        if (!dualVersionModeEnabled) {
          restoreDualLtOverride(false, opts);
          restoreDualFontOverride(false, opts);
        }
        return;
      }
      if (shouldApplyDualFontOverride()) {
        restoreDualLtOverride(false, opts);
        applyDualFontOverride(opts);
      } else if (shouldApplyDualLtOverride()) {
        restoreDualFontOverride(true, opts);
        applyDualLtOverride(opts);
      } else {
        restoreDualLtOverride(false, opts);
        if (!dualVersionModeEnabled || !dualVersionSecondaryId) {
          restoreDualFontOverride(false, opts);
        }
      }
    }

    function captureFullFontSize() {
      const fontInput = document.getElementById('font-size-val');
      if (!fontInput) return null;
      return Number(fontInput.value || DEFAULT_BIBLE_FULL_FONT);
    }

    function applyLongVerseFullFontOverride(key, factor = 0.8, sourceFontSize = null) {
      if (!key) return;
      const fontInput = document.getElementById('font-size-val');
      if (!fontInput) return;
      if (longVerseFullFontActive) {
        if (longVerseFullVerseKey === key && longVerseFullFontFactor === factor) return;
        restoreLongVerseFullFontOverride(true);
      }
      if (longVerseFullFontSnapshot == null) {
        const snapshot = Number.isFinite(sourceFontSize) ? sourceFontSize : captureFullFontSize();
        if (snapshot == null) return;
        longVerseFullFontSnapshot = snapshot;
      }
      longVerseFullFontFactor = factor;
      const reduced = Math.max(12, Math.round(longVerseFullFontSnapshot * factor));
      fontInput.value = String(reduced);
      longVerseFullFontActive = true;
      longVerseFullVerseKey = key;
    }

    function restoreLongVerseFullFontOverride(force = false) {
      if (!longVerseFullFontActive && !force) return;
      const fontInput = document.getElementById('font-size-val');
      if (fontInput && longVerseFullFontSnapshot != null) {
        fontInput.value = String(longVerseFullFontSnapshot);
      }
      longVerseFullFontActive = false;
      longVerseFullFontSnapshot = null;
      longVerseFullVerseKey = null;
      longVerseFullFontFactor = null;
    }

    function handleLongVerseFullFontState(shouldApply, key, reductionFactor = 0.8, sourceFontSize = null) {
      if (shouldApply && key) {
        applyLongVerseFullFontOverride(key, reductionFactor, sourceFontSize);
      } else {
        restoreLongVerseFullFontOverride();
      }
    }

    function shouldApplySongFullFontDefaults() {
      return activeRatio === 'full' && isLive && liveKind === 'songs';
    }

    function applySongFullFontDefaults(opts = {}) {
      if (!shouldApplySongFullFontDefaults()) return false;
      if (songFullFontOverrideActive) return false;
      const verseInput = document.getElementById('font-size-val');
      const lineHeightInput = document.getElementById('line-height-full');
      if (!verseInput || !lineHeightInput) return false;
      songFullFontSnapshot = {
        verse: Number(verseInput.value || DEFAULT_BIBLE_FULL_FONT),
        lineHeight: Number(lineHeightInput.value || DEFAULT_BIBLE_FULL_LINE_HEIGHT)
      };
      verseInput.value = String(DEFAULT_SONG_FULL_FONT);
      lineHeightInput.value = String(DEFAULT_SONG_FULL_LINE_HEIGHT);
      updateSliderValue(lineHeightInput);
      updateSliderFill(lineHeightInput);
      songFullFontOverrideActive = true;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
      return true;
    }

    function restoreSongFullFontDefaults(opts = {}) {
      if (!songFullFontOverrideActive && !opts.force) return false;
      const verseInput = document.getElementById('font-size-val');
      const lineHeightInput = document.getElementById('line-height-full');
      if (!verseInput || !lineHeightInput) {
        songFullFontOverrideActive = false;
        songFullFontSnapshot = null;
        return false;
      }
      const snapshot = songFullFontSnapshot || {
        verse: DEFAULT_BIBLE_FULL_FONT,
        lineHeight: DEFAULT_BIBLE_FULL_LINE_HEIGHT
      };
      verseInput.value = String(snapshot.verse);
      lineHeightInput.value = String(snapshot.lineHeight);
      updateSliderValue(lineHeightInput);
      updateSliderFill(lineHeightInput);
      songFullFontOverrideActive = false;
      songFullFontSnapshot = null;
      if (!opts.suppressLiveUpdate && typeof onAnyControlChange === 'function') onAnyControlChange();
      return true;
    }

    function handleSongFullFontState(opts = {}) {
      if (shouldApplySongFullFontDefaults()) {
        return applySongFullFontDefaults(opts);
      }
      return restoreSongFullFontDefaults(opts);
    }

    function updateDualVersionSelects() {
      const primarySelect = document.getElementById('dual-version-primary-select');
      const secondarySelect = document.getElementById('dual-version-secondary-select');
      const tertiarySelect = document.getElementById('dual-version-tertiary-select');
      const versions = Object.keys(bibles || []);
      if (primarySelect) {
        primarySelect.innerHTML = '';
        versions.forEach(ver => {
          const opt = document.createElement('option');
          opt.value = ver;
          opt.textContent = ver;
          primarySelect.appendChild(opt);
        });
        if (versions.length) {
          primarySelect.value = activeBibleVersion && versions.includes(activeBibleVersion)
            ? activeBibleVersion
            : versions[0];
        } else {
          primarySelect.value = '';
        }
      }
      if (secondarySelect) {
        secondarySelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = t('ui_select_secondary_version');
        placeholder.disabled = true;
        placeholder.selected = !dualVersionSecondaryId;
        secondarySelect.appendChild(placeholder);
        versions.forEach(ver => {
          const opt = document.createElement('option');
          opt.value = ver;
          opt.textContent = ver;
          if (ver === activeBibleVersion) opt.disabled = true;
          if (ver === dualVersionSecondaryId) {
            opt.selected = true;
          }
          secondarySelect.appendChild(opt);
        });
        if (dualVersionSecondaryId && !versions.includes(dualVersionSecondaryId)) {
          setDualVersionSecondaryId(null, { silent: true });
        } else {
          secondarySelect.value = dualVersionSecondaryId || '';
        }
        secondarySelect.disabled = versions.length < 2;
      }
      if (tertiarySelect) {
        tertiarySelect.innerHTML = '';
        const placeholder3 = document.createElement('option');
        placeholder3.value = '';
        placeholder3.textContent = t('ui_select_tertiary_version') || 'Select tertiary version';
        placeholder3.disabled = true;
        placeholder3.selected = !dualVersionTertiaryId;
        tertiarySelect.appendChild(placeholder3);
        versions.forEach(ver => {
          const opt = document.createElement('option');
          opt.value = ver;
          opt.textContent = ver;
          if (ver === activeBibleVersion) opt.disabled = true;
          if (ver === dualVersionSecondaryId) opt.disabled = true;
          if (ver === dualVersionTertiaryId) opt.selected = true;
          tertiarySelect.appendChild(opt);
        });
        if (dualVersionTertiaryId && !versions.includes(dualVersionTertiaryId)) {
          setDualVersionTertiaryId(null, { silent: true });
        } else {
          tertiarySelect.value = dualVersionTertiaryId || '';
        }
        tertiarySelect.disabled = versions.length < 3;
      }
      renderDualVersionPickers();
    }

    function setDualVersionModeEnabled(enabled, opts = {}) {
      const toggle = document.getElementById('dual-version-mode-toggle');
      const row = document.getElementById('dual-version-select-row');
      const hasMultipleVersions = Object.keys(bibles || []).length > 1;
      const prevState = dualVersionModeEnabled;
      dualVersionModeEnabled = !!enabled && hasMultipleVersions;
      if (toggle) {
        toggle.checked = dualVersionModeEnabled;
        toggle.disabled = !hasMultipleVersions;
      }
      if (row) {
        row.style.display = dualVersionModeEnabled ? 'flex' : 'none';
      }
      if (dualVersionModeEnabled && !prevState) {
        const fontInput = document.getElementById('font-size-val');
        preDualFontSize = Number(fontInput?.value || DEFAULT_BIBLE_FULL_FONT);
      }
      if (!dualVersionModeEnabled && prevState) {
        if (preDualFontSize != null) {
          const fontInput = document.getElementById('font-size-val');
          if (fontInput) fontInput.value = String(preDualFontSize);
          preDualFontSize = null;
        }
        restoreLongVerseFullFontOverride(true);
        restoreDualFontOverride(true);
        setDualVersionSecondaryId(null, { silent: true });
        setDualVersionTertiaryId(null, { silent: true });
      }
      if (!dualVersionModeEnabled) {
        setDualVersionSecondaryId(null, { silent: true });
      }
      if (!opts.silent && typeof onAnyControlChange === 'function') onAnyControlChange();
      handleDualFontOverrideState();
    }

    function updateDualVersionAvailability() {
      const hasMultipleVersions = Object.keys(bibles || []).length > 1;
      const toggle = document.getElementById('dual-version-mode-toggle');
      if (toggle) {
        toggle.disabled = !hasMultipleVersions;
      }
      if (!hasMultipleVersions && dualVersionModeEnabled) {
        setDualVersionModeEnabled(false, { silent: true });
      }
      const panel = document.getElementById('dual-version-panel');
      if (!hasMultipleVersions && panel) {
        panel.classList.remove('open');
        closeDualVersionMenus();
      }
    }

    function handleDualVersionModeToggle() {
      const toggle = document.getElementById('dual-version-mode-toggle');
      if (!toggle) return;
      setDualVersionModeEnabled(toggle.checked);
    }

    function handleDualPrimarySelectChange() {
      const select = document.getElementById('dual-version-primary-select');
      if (!select) return;
      const version = select.value;
      if (!version) return;
      changeActiveBibleVersion(version);
      handleDualFontOverrideState();
    }

    function handleDualSecondarySelectChange() {
      const select = document.getElementById('dual-version-secondary-select');
      if (!select) return;
      setDualVersionSecondaryId(select.value);
      handleDualFontOverrideState();
    }


    // Reference font (Settings > Typography). 'inherit' follows the verse font.
    const REF_FONT_KEY = 'scripturePod.refFontFamily.v1';
    const DEFAULT_REF_FONT = "'Geist Mono',ui-monospace,monospace";
    let refFontFamily = (() => {
      try { return localStorage.getItem(REF_FONT_KEY) || DEFAULT_REF_FONT; } catch (error) { return DEFAULT_REF_FONT; }
    })();

    function handleRefFontChange() {
      const select = document.getElementById('ref-font-family');
      refFontFamily = (select && select.value) || DEFAULT_REF_FONT;
      try { localStorage.setItem(REF_FONT_KEY, refFontFamily); } catch (error) { /* storage unavailable */ }
      onAnyControlChange();
    }

    function buildReferenceBadgeSpan(text, fontSizePt, foregroundColor, backgroundColor, opts = {}) {
      const styles = [
        `color:${foregroundColor}`,
        `font-weight:${refBgEnabled ? 800 : 600}`,
        ...(refFontFamily && refFontFamily !== 'inherit' ? [`font-family:${refFontFamily}`] : []),
        `font-size:${fontSizePt}pt`,
        'display:inline-block',
        `border-radius:${opts.borderRadius || '12px'}`,
        'white-space:nowrap',
        'line-height:1.2',
        `text-transform:${opts.textTransform || 'uppercase'}`
      ];
      const allowBackground = (opts.allowBackground !== undefined) ? opts.allowBackground : true;
      const paddingValue = opts.padding || '16px 80px';
      if (refBgEnabled && allowBackground) {
        styles.push(`background:${backgroundColor || '#000000'}`);
        styles.push(`padding:${paddingValue}`);
        styles.push(referenceShadowEnabled ? 'box-shadow:0 10px 24px rgba(0,0,0,0.42);' : 'box-shadow:none;');
        styles.push('text-shadow:none;');
      } else {
        styles.push('background:transparent');
        styles.push('padding:0');
        styles.push('box-shadow:none;');
        styles.push(referenceShadowEnabled ? 'text-shadow:0 10px 24px rgba(0,0,0,0.65);' : 'text-shadow:none;');
      }
      const keepFont = (refFontFamily && refFontFamily !== 'inherit') ? ' data-keep-font="1"' : '';
      return `<span${keepFont} style="${styles.join(';')}">${text}</span>`;
    }

    function buildFullBibleSegment({ referenceLabel, verseHtml, refSize, refColor, refBgColor, verseAlign, refAlign, verseShadowStyle, refPosition, refTextTransform }) {
      const normalizedAlign = (['left', 'right', 'center'].includes(refAlign) ? refAlign : 'center');
      const containerAlign = (refAlign === 'justify') ? 'left' : normalizedAlign;
      const refBadge = buildReferenceBadgeSpan(referenceLabel, refSize, refColor, refBgColor, { textTransform: refTextTransform || fullRefTextTransform });
      const refHtml = `<div style="text-align:${containerAlign};margin:0 20px 20px;width:100%">${refBadge}</div>`;
      const extraSpacingStyle = verseAlign === 'justify'
        ? 'word-spacing:0;letter-spacing:0;text-justify:inter-word;'
        : '';
      const bodyHtml = `<div class="jo-body" style="text-align:${verseAlign};margin:0 20px;width:100%;${verseShadowStyle}${extraSpacingStyle}">${verseHtml}</div>`;
      const spacerHtml = '<div style="height:0.6em;width:100%"></div>';
      return (refPosition === 'bottom') ? (bodyHtml + spacerHtml + refHtml) : (refHtml + bodyHtml);
    }

    function buildLtBibleSegment({ referenceLabel, verseHtml, refSize, refColor, refBgColor, alignValue, verseShadowStyle, allowBackground, padding = '1px 6px', borderRadius = '5px', refTextTransform }) {
      const refBadge = buildReferenceBadgeSpan(
        referenceLabel,
        refSize,
        refColor,
        refBgColor,
        { allowBackground, padding, borderRadius, textTransform: refTextTransform || ltRefTextTransform }
      );
      return `<div class="jo-ref-line" style="margin-bottom:3px;width:100%;text-align:${alignValue}">${refBadge}</div>` +
             `<div class="jo-body" style="${verseShadowStyle}">${verseHtml}</div>`;
    }

    function isBibleContentActive() {
      return !!(currentItem && getIsBibleItem(currentItem));
    }

    function setEditorMode(m) {
      if (isBibleContentActive() && m === 'text') return;
      document.getElementById('lyric-editor').style.display = m === 'text' ? 'block' : 'none';
      document.getElementById('lyric-buttons').style.display = m === 'btn' ? 'block' : 'none';
      document.getElementById('mode-text').classList.toggle('active', m === 'text');
      document.getElementById('mode-btn').classList.toggle('active', m === 'btn');
      editorMode = m;
      const tagBar = document.querySelector('.section-tag-bar[data-target="lyric-editor"]');
      if (tagBar) tagBar.style.display = m === 'text' ? 'flex' : 'none';
      refreshWorkspaceLayoutUi();
      saveToStorageDebounced();
    }

    function getScheduleEntryKey(entry) {
      if (!entry) return null;
      if (entry._metaKind === 'bible_verse') {
        return `bible:${entry.version || ''}:${entry.title || ''}:${entry.content || ''}`;
      }
      if (entry.id) {
        return `song:${entry.id}`;
      }
      if (entry.title && entry.content) {
        return `song:${entry.title}:${entry.content}`;
      }
      return null;
    }

    function insertIntoSchedule(entry, { successMessage = null, duplicateMessage = null } = {}) {
      if (!entry) return { inserted: false, movedToTop: false };
      if (entry._metaKind === 'bible_verse') {
        const hintLines = getScheduleLineHint(entry);
        if (hintLines != null) {
          entry.linesPerPage = hintLines;
        } else if (!Number.isFinite(entry.linesPerPage)) {
          entry.linesPerPage = linesPerPage;
        }
      }
      const key = getScheduleEntryKey(entry);
      if (key) {
        const existingIdx = schedule.findIndex(item => getScheduleEntryKey(item) === key);
        if (existingIdx !== -1) {
          const [existing] = schedule.splice(existingIdx, 1);
          schedule.unshift(existing);
          if (sidebarTab === 'schedule') renderSongs();
          saveState();
          saveToStorageDebounced();
          if (duplicateMessage) showToast(duplicateMessage);
          return { inserted: false, movedToTop: true };
        }
      }
      schedule.push(entry);
      if (sidebarTab === 'schedule') renderSongs();
      saveState();
      saveToStorageDebounced();
      if (successMessage) showToast(successMessage);
      return { inserted: true, movedToTop: false };
    }

    function addToSet(i, e) {
      e.stopPropagation();
      let list = (sidebarTab === 'songs') ? songs : (activeBibleVersion ? bibles[activeBibleVersion] : []);
      if (!list[i]) return;
      insertIntoSchedule({ ...list[i] }, {
        successMessage: 'Added to setlist',
        duplicateMessage: 'This entry already exists on the setlist; moved to the top'
      });
    }

    function removeFromSet(i, e) {
      e.stopPropagation();
      schedule.splice(i, 1);
      saveState();
      saveToStorageDebounced();
      renderSongs();
      showToast('Removed from setlist');
    }

    function deleteItem(i, e) {
      e.stopPropagation();
      if (sidebarTab === 'songs') {
        const removed = songs.splice(i, 1)[0];
        if (removed && removed.id) idbDelete(STORE_SONGS, removed.id).catch(() => {});
      } else if (sidebarTab === 'bible' && activeBibleVersion) {
        bibles[activeBibleVersion].splice(i, 1);
        persistBibleVersion(activeBibleVersion).catch(() => {});
      }
      saveState();
      saveToStorageDebounced();
      renderSongs();
      updateButtonView();
      if (isLive) scheduleLiveUpdate();
      showToast('Item deleted');
    }

    function normalizeSongTitleKey(title) {
      return String(title || '').trim().toLowerCase();
    }

    function renameSongTitle(songIndex, nextTitleRaw) {
      const idx = Number(songIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= songs.length) return false;
      const song = songs[idx];
      if (!song) return false;
      const nextTitle = String(nextTitleRaw || '').trim();
      if (!nextTitle) {
        showToast('Song title cannot be empty');
        return false;
      }
      const currentKey = normalizeSongTitleKey(song.title);
      const nextKey = normalizeSongTitleKey(nextTitle);
      if (nextKey !== currentKey) {
        const exists = songs.some((s, i) => i !== idx && normalizeSongTitleKey(s?.title) === nextKey);
        if (exists) {
          showToast('Song title already exists');
          return false;
        }
      }
      song.title = nextTitle;
      song.updatedAt = Date.now();
      song.searchableText = normalizeSearchText(`${song.title}\n${song.content || song.text || ''}`);
      idbPut(STORE_SONGS, buildSongRecord(song, { isNew: false })).catch(() => {});
      renderSongs();
      saveState();
      saveToStorageDebounced();
      showToast('Song title renamed');
      return true;
    }

    function prevSlide() {
      if (!currentItem) return;
      if (lineCursor > 0) {
        lineCursor--;
        // The live pointer moves first so the cards redraw with LIVE on the verse now on air
        if (isLive && livePointer) liveLineCursor = lineCursor;
        updateButtonView();
        if (isLive && livePointer) {
          if (!pushLiveUpdate()) {
            projectLive(true);
          }
        }
        saveToStorageDebounced();
      }
    }

    function nextSlide() {
      if (!currentItem) return;
      const pages = getPagesFromItem(currentItem, getIsBibleItem(currentItem));
      if (lineCursor < pages.length - 1) {
        lineCursor++;
        // The live pointer moves first so the cards redraw with LIVE on the verse now on air
        if (isLive && livePointer) liveLineCursor = lineCursor;
        updateButtonView();
        if (isLive && livePointer) {
          if (!pushLiveUpdate()) {
            projectLive(true);
          }
        }
        saveToStorageDebounced();
      }
    }

    // Header "Imports" menu: one place for everything the app can bring in
    function closeImportsPopover() {
      const pop = document.getElementById('imports-popover');
      if (pop) pop.hidden = true;
      document.getElementById('btn-imports')?.setAttribute('aria-expanded', 'false');
    }

    function toggleImportsPopover(event) {
      if (event) event.stopPropagation();
      const pop = document.getElementById('imports-popover');
      if (!pop) return;
      pop.hidden = !pop.hidden;
      document.getElementById('btn-imports')?.setAttribute('aria-expanded', String(!pop.hidden));
    }

    function runImportAction(kind) {
      closeImportsPopover();
      if (kind === 'files') triggerImport();
      else if (kind === 'bundled') importBundledBibles();
      else if (kind === 'style') document.getElementById('import-style-file')?.click();
      else if (kind === 'backup') document.getElementById('backup-import-file')?.click();
    }

    document.addEventListener('click', (event) => {
      const pop = document.getElementById('imports-popover');
      if (pop && !pop.hidden && !event.target.closest('.imports-wrap')) closeImportsPopover();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeImportsPopover();
    });

    function openModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      if (id === 'autoLyricsModal') loadLyricsSourceKeyInputs();
      if (id === 'settingsModal') {
        populateLanguageSelect();
        setLanguage(currentLanguage, { silent: true });
        if (typeof setSettingsTargetTab === 'function') {
          setSettingsTargetTab('follow', { silent: true });
        }
        if (typeof initSettingsPreview === 'function') {
          initSettingsPreview();
          setTimeout(() => { scalePreviewDisplay('settings-preview-shell', 'settings-preview-frame'); syncPreviewMonitor(); }, 120);
        }
      } else if (id === 'newSongModal') {
        resetNewSongLookupState({ keepInputs: false });
        const titleInput = document.getElementById('new-song-title');
        if (titleInput) {
          setTimeout(() => {
            try { titleInput.focus(); } catch (_) {}
          }, 20);
        }
      } else if (id === 'autoLyricsModal') {
        bindAutoLyricsGlobalHandlers();
        renderAutoLyricsResults();
        updateAutoLyricsInputClearButtons();
        const hasSavedAutoLyricsSearch = !!((document.getElementById('auto-lyrics-title')?.value || '').trim() || autoLyricsResults.length);
        updateAutoLyricsStatus(
          hasSavedAutoLyricsSearch
            ? (autoLyricsResults.length
                ? t('auto_lyrics_found_results_click_add').replace('{count}', String(autoLyricsResults.length))
                : t('auto_lyrics_continue_last_search_or_new'))
            : t('auto_lyrics_prompt'),
          hasSavedAutoLyricsSearch && autoLyricsResults.length ? 'success' : 'muted'
        );
        const titleInput = document.getElementById('auto-lyrics-title');
        if (titleInput) {
          setTimeout(() => {
            try { titleInput.focus(); } catch (_) {}
          }, 20);
        }
      }
      modal.style.display = 'flex';
      if (id === 'autoLyricsModal') {
        requestAnimationFrame(() => {
          positionAutoLyricsModal();
        });
      }
      /* Close when clicking on the overlay backdrop (outside modal content) */
      modal._backdropHandler = modal._backdropHandler || function(e) {
        if (e.target === modal) closeModal(id);
      };
      modal.addEventListener('click', modal._backdropHandler);
      if (id === 'settingsModal') {
        modal._escHandler = modal._escHandler || function(e) {
          if (e.key === 'Escape') closeModal('settingsModal');
        };
        modal._outsideClickHandler = modal._outsideClickHandler || function(e) {
          if (modal.style.display !== 'flex') return;
          const content = modal.querySelector('.modal-content');
          if (!content) return;
          if (!(e.target instanceof Node)) return;
          if (!content.contains(e.target)) closeModal('settingsModal');
        };
        document.addEventListener('keydown', modal._escHandler);
        document.addEventListener('mousedown', modal._outsideClickHandler);
      }
    }

    function closeModal(id) {
      if (id === 'styleEditorModal') {
        try {
          flushStyleAutosave();
        } catch (e) {
          console.error('Style autosave failed on close', e);
        }
      }
      const modal = document.getElementById(id);
      if (modal) {
        modal.style.display = 'none';
        if (id === 'newSongModal') {
          resetNewSongLookupState({ keepInputs: false });
        }
        if (id === 'autoLyricsModal') {
          closeAutoLyricsContextMenu();
          hideAutoLyricsPreview();
        }
        if (id === 'settingsModal') {
          if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
          if (modal._outsideClickHandler) document.removeEventListener('mousedown', modal._outsideClickHandler);
        }
      }
    }

    function getNewSongLookupKey(title, artist) {
      return `${String(title || '').trim().toLowerCase()}::${String(artist || '').trim().toLowerCase()}`;
    }

    function updateNewSongFetchStatus(message, tone = 'muted') {
      const status = document.getElementById('new-song-fetch-status');
      if (!status) return;
      status.textContent = message || '';
      if (tone === 'success') status.style.color = 'var(--success)';
      else if (tone === 'error') status.style.color = 'var(--danger)';
      else status.style.color = 'var(--text-secondary)';
    }

    function setNewSongLookupBusy(busy) {
      newSongLookupBusy = !!busy;
      const btn = document.getElementById('new-song-fetch-btn');
      if (!btn) return;
      btn.disabled = newSongLookupBusy;
      btn.textContent = newSongLookupBusy ? t('common_searching') : t('new_song_search_lyrics');
    }

    function clearNewSongLookupResults() {
      newSongLookupResults = [];
      const host = document.getElementById('new-song-search-results');
      if (!host) return;
      host.innerHTML = '';
      host.style.display = 'none';
    }

    function renderNewSongLookupResults() {
      const host = document.getElementById('new-song-search-results');
      if (!host) return;
      host.innerHTML = '';
      if (!Array.isArray(newSongLookupResults) || !newSongLookupResults.length) {
        host.style.display = 'none';
        return;
      }
      host.style.display = 'block';
      newSongLookupResults.forEach((entry, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:100%;text-align:left;border:1px solid var(--border);background:rgba(255,255,255,0.02);color:var(--text);padding:8px 10px;border-radius:7px;margin:0 0 6px;cursor:pointer;';
        const track = entry.title || 'Untitled';
        const artist = entry.artist || 'Unknown artist';
        const album = entry.album || '';
        const source = entry.source || '';
        const langTag = entry.language ? ` • ${entry.language}${entry.converted ? ' → typed English' : ''}` : '';
        btn.innerHTML = `<div style="font-weight:600;font-size:12px">${esc(track)}</div><div style="font-size:11px;color:var(--text-secondary)">${esc(artist)}${album ? ' • ' + esc(album) : ''}${source ? ' • ' + esc(source) : ''}</div>`;
        btn.onclick = () => selectNewSongLookupResult(idx);
        host.appendChild(btn);
      });
    }

    function resetNewSongLookupState(opts = {}) {
      const keepInputs = !!opts.keepInputs;
      newSongFetchedLyrics = '';
      newSongFetchedLookupKey = '';
      const lyricsBox = document.getElementById('new-song-lyrics');
      if (lyricsBox && !keepInputs) lyricsBox.value = '';
      clearNewSongLookupResults();
      setNewSongLookupBusy(false);
      updateNewSongFetchStatus(t('new_song_no_lyrics_fetched'), 'muted');
      if (!keepInputs) {
        const titleInput = document.getElementById('new-song-title');
        const artistInput = document.getElementById('new-song-artist');
        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
      }
    }

    function handleNewSongLookupInputChange() {
      showLyricsSuggestion('new-song-suggest', '', () => {});
      scheduleLiveLyricsSearch('new');
      const titleInput = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const key = getNewSongLookupKey(titleInput?.value || '', artistInput?.value || '');
      if (key && key === newSongFetchedLookupKey && newSongFetchedLyrics) {
        updateNewSongFetchStatus(t('new_song_lyrics_ready'), 'success');
        return;
      }
      clearNewSongLookupResults();
      if (newSongFetchedLookupKey) {
        updateNewSongFetchStatus(t('new_song_lyrics_not_fetched_current'), 'muted');
      } else {
        updateNewSongFetchStatus(t('new_song_no_lyrics_fetched'), 'muted');
      }
    }

    function extractLyricsFromLookupPayload(payload) {
      if (!payload) return '';
      if (typeof payload === 'string') return inferSectionedLyricsFromText(payload);
      const candidates = [
        payload.plainLyrics, payload.plain_lyrics, payload.lyrics, payload.text,
        payload.syncedLyrics, payload.synced_lyrics
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) return inferSectionedLyricsFromText(c);
      }
      if (Array.isArray(payload)) {
        for (const item of payload) {
          const v = extractLyricsFromLookupPayload(item);
          if (v) return v;
        }
      }
      return '';
    }

    function normalizeLyricsSearchResultEntry(entry) {
      if (!entry || typeof entry !== 'object') return null;
      const title = String(entry.trackName || entry.track_name || entry.title || entry.name || '').trim();
      const artist = String(entry.artistName || entry.artist_name || entry.artist || '').trim();
      const album = String(entry.albumName || entry.album_name || entry.album || '').trim();
      const source = String(entry.sourceName || entry.source || 'LRCLIB').trim();
      const rawLyrics = extractLyricsFromLookupPayload(entry);
      if (!rawLyrics || !title) return null;
      // Kannada and Tamil results are stored as typed English (Latin letters), so every song reads the same
      const script = (window.SP_TRANSLIT && window.SP_TRANSLIT.detectScript(`${title}\n${rawLyrics}`)) || 'latin';
      const toLatin = (text) => (window.SP_TRANSLIT && script !== 'latin') ? window.SP_TRANSLIT.toTypedEnglish(text) : text;
      return {
        worship: !!entry.worship,
        title: toLatin(title),
        artist: toLatin(artist),
        album: toLatin(album),
        source,
        lyrics: (window.SP_LYRICS_CLEAN ? window.SP_LYRICS_CLEAN.cleanPastedLyrics(toLatin(rawLyrics)) : toLatin(rawLyrics)),
        language: entry.languageHint || (script === 'kannada' ? 'Kannada' : (script === 'tamil' ? 'Tamil' : 'English')),
        converted: script !== 'latin'
      };
    }

    function dedupeLyricsSearchResults(results) {
      const seen = new Set();
      const out = [];
      (Array.isArray(results) ? results : []).forEach((entry) => {
        const n = normalizeLyricsSearchResultEntry(entry);
        if (!n) return;
        const key = `${n.title.toLowerCase()}::${n.artist.toLowerCase()}::${n.lyrics.slice(0, 160)}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(n);
      });
      return out;
    }

    // ── Search as you type, and "Did you mean …?" for misspelt titles ─────────────────
    // Titles from earlier results are remembered on this computer, so a misspelling can be matched
    // against songs it has already seen as well as the songs in the library.
    const LYRICS_TITLE_INDEX_KEY = 'scripturePod.lyricsTitleIndex.v1';
    function loadLyricsTitleIndex() {
      try { const v = JSON.parse(localStorage.getItem(LYRICS_TITLE_INDEX_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function rememberLyricsTitles(results) {
      const known = loadLyricsTitleIndex();
      const seen = new Set(known.map((t) => t.toLowerCase()));
      (results || []).forEach((r) => {
        const title = String((r && r.title) || '').trim();
        if (title && title.length <= 80 && !seen.has(title.toLowerCase())) { seen.add(title.toLowerCase()); known.push(title); }
      });
      try { localStorage.setItem(LYRICS_TITLE_INDEX_KEY, JSON.stringify(known.slice(-600))); } catch (e) { /* storage unavailable */ }
    }
    function lyricsEditDistance(a, b, limit) {
      if (Math.abs(a.length - b.length) > limit) return limit + 1;
      let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 2] + 1);
          if (cur[j] < rowMin) rowMin = cur[j];
        }
        if (rowMin > limit) return limit + 1;
        prev = cur;
      }
      return prev[b.length];
    }
    const lyricsWordKey = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    // The closest known title (or the query with its misspelt words fixed), or '' when nothing is close
    function suggestSongTitle(query, extraTitles = []) {
      const q = lyricsWordKey(query);
      if (q.length < 3) return '';
      const titles = Array.from(new Set([...(songs || []).map((s) => s.title || ''), ...loadLyricsTitleIndex(), ...extraTitles].map((t) => String(t).trim()).filter(Boolean)));
      let best = '', bestScore = Infinity, exactKnown = false;
      titles.forEach((title) => {
        const key = lyricsWordKey(title);
        if (!key) return;
        if (key === q || key.startsWith(q)) { exactKnown = true; return; }
        // Compare against the same-length start of the title too, so a half-typed misspelling still matches
        const fullLimit = Math.max(1, Math.floor(Math.min(q.length, key.length) * 0.2));
        const full = lyricsEditDistance(q, key, fullLimit);
        const headLimit = Math.floor(q.length * 0.2);
        const head = q.length >= 5 ? lyricsEditDistance(q, key.slice(0, q.length), headLimit) + 0.5 : Infinity;
        const d = Math.min(full <= fullLimit ? full : Infinity, head <= headLimit + 0.5 ? head : Infinity);
        if (d < Infinity && d < bestScore) { best = title; bestScore = d; }
      });
      if (exactKnown) return '';
      if (best) return best;
      // Word by word against the words of known titles
      const vocab = new Set();
      titles.forEach((t) => lyricsWordKey(t).split(' ').forEach((w) => { if (w.length >= 3) vocab.add(w); }));
      let changed = false;
      const fixed = q.split(' ').map((word) => {
        if (word.length < 3 || vocab.has(word)) return word;
        let bw = word, bd = Infinity;
        vocab.forEach((v) => { const d = lyricsEditDistance(word, v, word.length >= 7 ? 2 : 1); if (d < bd && d <= (word.length >= 7 ? 2 : 1)) { bd = d; bw = v; } });
        if (bw !== word) changed = true;
        return bw;
      }).join(' ');
      return changed ? fixed.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : '';
    }
    function showLyricsSuggestion(hostId, suggestion, onPick) {
      const host = document.getElementById(hostId);
      if (!host) return;
      host.replaceChildren();
      if (!suggestion) { host.style.display = 'none'; return; }
      host.style.display = '';
      host.append('Did you mean ');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = suggestion;
      btn.onclick = () => onPick(suggestion);
      host.appendChild(btn);
      host.append('?');
    }
    const liveLyricsTimers = {};
    function scheduleLiveLyricsSearch(kind) {
      clearTimeout(liveLyricsTimers[kind]);
      const value = (document.getElementById(kind === 'new' ? 'new-song-title' : 'auto-lyrics-title')?.value || '').trim();
      if (value.length < 2) return;
      liveLyricsTimers[kind] = setTimeout(() => {
        if (kind === 'new') autoFetchNewSongLyrics(); else searchAutoLyrics();
      }, 450);
    }

    // "Christian worship songs only": results are scored by worship words (English, and the typed-English
    // forms of Kannada and Tamil words) and the songs without any are left out, best matches first.
    const WORSHIP_STRONG = ['jesus', 'christ', 'hallelujah', 'halleluyah', 'hosanna', 'savior', 'saviour', 'holy spirit', 'worship', 'emmanuel', 'messiah', 'amen',
      'yesu', 'iyesu', 'yesappa', 'yaesu', 'kristh', 'kiristh', 'karthar', 'karththar', 'devaru', 'daevaru', 'thaevan', 'daevaa', 'parishuddh', 'aaradhan', 'aaradhane', 'ratchak', 'rakshak', 'stuthi', 'sthuthi', 'sthothra', 'aaviyan'];
    const WORSHIP_WEAK = ['lord', 'god', 'praise', 'grace', 'glory', 'cross', 'lamb', 'king of kings', 'redeemer', 'blood of', 'heaven', 'holy', 'faith', 'prayer', 'blessed', 'mercy', 'father', 'spirit', 'psalm', 'deva', 'appa', 'karthaave', 'kartha'];
    function worshipScore(entry) {
      const hay = `${entry.title || ''}\n${entry.lyrics || ''}`.toLowerCase();
      let score = 0;
      WORSHIP_STRONG.forEach((w) => { if (hay.includes(w)) score += 3; });
      WORSHIP_WEAK.forEach((w) => { if (hay.includes(w)) score += 1; });
      return score;
    }
    function isWorshipSong(entry) { return !!entry.worship || worshipScore(entry) >= 3; }

    // tamilchristiansongs.in: an all-Christian Tamil song library with a search API and a typed-English
    // (romanised) version of each song. Its server does not allow requests from a web page, so the app fetches it.
    async function fetchFromSite(url) {
      if (window.BSPDesktop && typeof window.BSPDesktop.fetchText === 'function') {
        const r = await window.BSPDesktop.fetchText({ url });
        return r && r.ok ? r.body : '';
      }
      try { const res = await fetch(url); return res.ok ? await res.text() : ''; } catch (e) { return ''; }
    }
    async function searchTamilChristianSongs(query, limit = 5) {
      const q = String(query || '').trim();
      if (!q) return [];
      const text = await fetchFromSite(`https://tamilchristiansongs.in/api/search/?q=${encodeURIComponent(q)}&per_page=${limit}`);
      let list = [];
      try { list = JSON.parse(text).results || []; } catch (e) { return []; }
      const pages = await Promise.all(list.slice(0, limit).map(async (item) => {
        const html = await fetchFromSite(`https://tamilchristiansongs.in${item.url}`);
        if (!html) return null;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // The site gives a romanised version of each song: that is the typed English we store
        const roman = doc.querySelector('#tamilroman .whitespace-pre-line');
        const tamil = doc.querySelector('#tamiltext');
        const lyrics = ((roman && roman.textContent) || (tamil && tamil.innerText) || (tamil && tamil.textContent) || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
        if (!lyrics) return null;
        return { title: String(item.title || '').replace(/\s*[-–|]\s*(lyrics|tamil christian songs).*$/i, '').trim() || 'Untitled', artist: '', album: '', source: 'tamilchristiansongs.in', lyrics, worship: true, languageHint: 'Tamil' };
      }));
      return pages.filter(Boolean);
    }

    // More Tamil and Kannada sources, so one site being down or missing a song does not end the search.
    // waytochurch.com lists its songs by language and first letter (titles already in English letters) and
    // each song page has an English (typed) tab. The Blogger site is searched through Blogger's public feed.
    const looseWord = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1').replace(/[aeiou]/g, '');
    function titleMatchScore(query, title) {
      const q = String(query || '').toLowerCase().split(/\s+/).map(looseWord).filter(Boolean);
      const t = String(title || '').toLowerCase().split(/\s+/).map(looseWord).filter(Boolean);
      if (!q.length || !t.length) return 0;
      let hit = 0;
      q.forEach((w) => { if (t.some((x) => x === w || (w.length >= 3 && x.length >= 3 && (x.startsWith(w) || w.startsWith(x))))) hit++; });
      return hit / q.length;
    }
    async function searchWaytochurch(query, language, limit = 3) {
      const q = String(query || '').trim();
      const lang = language === 'tamil' ? 'tamil' : 'kannada';
      const letters = Array.from(new Set(q.split(/\s+/).slice(0, 2).map((w) => w.replace(/[^A-Za-z]/g, '').charAt(0)).filter(Boolean)));
      const lists = await Promise.all(letters.flatMap((c) => Array.from(new Set([c.toUpperCase(), c.toLowerCase()]))
        .map((l) => fetchFromSite(`https://waytochurch.com/lyrics/list/${lang}-${l}`))));
      const seen = new Set();
      const cands = [];
      lists.forEach((html) => {
        const re = /href=['"](https:\/\/waytochurch\.com\/lyrics\/song\/\d+\/[^'"]+)['"][^>]*>([^<]+)</g;
        let m;
        while ((m = re.exec(html))) {
          if (seen.has(m[1])) continue;
          seen.add(m[1]);
          cands.push({ url: m[1], title: m[2].replace(/\s+/g, ' ').trim(), score: titleMatchScore(q, m[2]) });
        }
      });
      const best = cands.filter((c) => c.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, limit);
      const pages = await Promise.all(best.map(async (c) => {
        const html = await fetchFromSite(c.url);
        if (!html) return null;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const read = (box) => {
          if (!box) return '';
          box.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
          return (box.textContent || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        };
        let lyrics = read(doc.querySelector('#english'));
        // Some songs only have the original tab: use it when it is real Tamil/Kannada script (it is then
        // converted to typed English), not the old-font text some Kannada pages hold
        if (lyrics.length < 20) {
          const original = read(doc.querySelector('#original'));
          const script = window.SP_TRANSLIT ? window.SP_TRANSLIT.detectScript(original) : 'latin';
          lyrics = script !== 'latin' ? original : '';
        }
        if (lyrics.length < 20) return null;
        return { title: c.title, artist: '', album: '', source: 'waytochurch.com', lyrics, worship: true, languageHint: lang === 'tamil' ? 'Tamil' : 'Kannada' };
      }));
      return pages.filter(Boolean);
    }
    async function searchKannadaBlog(query, limit = 3) {
      const q = String(query || '').trim();
      if (!q) return [];
      const text = await fetchFromSite(`https://kannadateluguchristiansongslyrics.blogspot.com/feeds/posts/default?alt=json&max-results=${limit}&q=${encodeURIComponent(q)}`);
      let entries = [];
      try { entries = JSON.parse(text).feed.entry || []; } catch (e) { return []; }
      return entries.map((e) => {
        const doc = new DOMParser().parseFromString(`<div>${(e.content && e.content.$t) || ''}</div>`, 'text/html');
        doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
        doc.querySelectorAll('p,div').forEach((b) => b.append('\n'));
        const lyrics = (doc.body.textContent || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const title = String((e.title && e.title.$t) || '').replace(/\s*[-–]?\s*kannada christian song lyrics.*$/i, '').trim();
        return lyrics.length < 20 ? null : { title: title || 'Untitled', artist: '', album: '', source: 'kannadateluguchristiansongslyrics.blogspot.com', lyrics, worship: true, languageHint: 'Kannada' };
      }).filter(Boolean);
    }

    // Optional extra sources, kept on this computer only. Genius and YouTube do not hand out lyrics,
    // so they are used to find the proper song and artist names, which are then looked up for lyrics.
    const LYRICS_KEYS_STORAGE = 'scripturePod.lyricsKeys.v1';
    function getLyricsSourceKeys() {
      try { const v = JSON.parse(localStorage.getItem(LYRICS_KEYS_STORAGE) || '{}'); return { genius: String(v.genius || '').trim(), youtube: String(v.youtube || '').trim() }; }
      catch (e) { return { genius: '', youtube: '' }; }
    }
    function saveLyricsSourceKeys() {
      const genius = document.getElementById('lyrics-key-genius')?.value.trim() || '';
      const youtube = document.getElementById('lyrics-key-youtube')?.value.trim() || '';
      try { localStorage.setItem(LYRICS_KEYS_STORAGE, JSON.stringify({ genius, youtube })); } catch (e) { /* storage unavailable */ }
      showToast('Lyrics sources saved');
    }
    function loadLyricsSourceKeyInputs() {
      const keys = getLyricsSourceKeys();
      const g = document.getElementById('lyrics-key-genius'); if (g) g.value = keys.genius;
      const y = document.getElementById('lyrics-key-youtube'); if (y) y.value = keys.youtube;
    }

    // Song and artist names from Genius and YouTube for a search the lyrics sources could not answer
    async function findSongNameCandidates(query, signal, opts = {}) {
      const keys = getLyricsSourceKeys();
      const found = [];
      const getJson = async (url, headers) => {
        const res = await fetch(url, { signal, headers });
        return res.ok ? res.json() : null;
      };
      if (keys.genius) {
        const data = await getJson(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, { Authorization: `Bearer ${keys.genius}` }).catch(() => null);
        (data?.response?.hits || []).slice(0, 4).forEach((h) => {
          const r = h.result || {};
          if (r.title) found.push({ title: String(r.title), artist: String(r.primary_artist?.name || '') });
        });
      }
      if (keys.youtube) {
        const data = await getJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=4&q=${encodeURIComponent(query + (opts && opts.worshipOnly ? ' christian worship song lyrics' : ' lyrics'))}&key=${encodeURIComponent(keys.youtube)}`).catch(() => null);
        (data?.items || []).forEach((it) => {
          // Video titles look like "Song name - Artist (Lyrical Video)": keep the part before the bracket
          const raw = String(it.snippet?.title || '').replace(/[\(\[｜|].*$/, '').trim();
          const parts = raw.split(/\s[-–]\s/);
          if (parts[0]) found.push({ title: parts[0].trim(), artist: (parts[1] || '').trim() });
        });
      }
      return found;
    }

    async function searchLyricsCatalog(title, artist, language = 'any', opts = {}) {
      const cleanTitle = String(title || '').trim();
      const cleanArtist = String(artist || '').trim();
      if (!cleanTitle && !cleanArtist) throw new Error('Title or artist required');

      const timeoutMs = 12000;
      const doFetchJson = async (url) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await fetch(url, { signal: ctl.signal });
          if (!res.ok) return null;
          return await res.json();
        } finally {
          clearTimeout(t);
        }
      };

      const lookupTerms = [];
      if (cleanTitle && cleanArtist) lookupTerms.push(`${cleanTitle} ${cleanArtist}`);
      if (cleanTitle) lookupTerms.push(cleanTitle);
      if (cleanArtist) lookupTerms.push(cleanArtist);
      const lookupUrls = Array.from(new Set(lookupTerms.map(term => `https://lrclib.net/api/search?q=${encodeURIComponent(term)}`)));

      const collected = [];
      for (const url of lookupUrls) {
        const payload = await doFetchJson(url).catch(() => null);
        if (!payload) continue;
        if (Array.isArray(payload)) collected.push(...payload);
        else if (payload && typeof payload === 'object') collected.push(payload);
      }
      // Tamil worship songs: tamilchristiansongs.in has them with a typed-English version
      if (language !== 'english' && language !== 'kannada') {
        const tamilSongs = await searchTamilChristianSongs(`${cleanTitle} ${cleanArtist}`.trim()).catch(() => []);
        collected.push(...tamilSongs);
      }
      // More Tamil and Kannada sources, all searched at once
      const nameQuery = `${cleanTitle} ${cleanArtist}`.trim();
      const extra = [];
      if (language === 'any' || language === 'tamil') extra.push(searchWaytochurch(nameQuery, 'tamil'));
      if (language === 'any' || language === 'kannada') {
        extra.push(searchWaytochurch(nameQuery, 'kannada'));
        extra.push(searchKannadaBlog(nameQuery));
      }
      (await Promise.all(extra.map((p) => p.catch(() => [])))).forEach((list) => collected.push(...list));
      // A second public source for English songs when both the title and the artist are known
      if (cleanTitle && cleanArtist && language !== 'kannada' && language !== 'tamil') {
        const ovh = await doFetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`).catch(() => null);
        if (ovh && typeof ovh.lyrics === 'string' && ovh.lyrics.trim()) {
          collected.push({ title: cleanTitle, artist: cleanArtist, lyrics: ovh.lyrics, source: 'lyrics.ovh' });
        }
      }
      let results = dedupeLyricsSearchResults(collected);
      const want = { english: 'English', kannada: 'Kannada', tamil: 'Tamil' }[String(language || 'any').toLowerCase()];
      if (want) results = results.filter((r) => r.language === want);
      const keepWorship = (list) => {
        if (!opts.worshipOnly) return list;
        const kept = list.filter(isWorshipSong).sort((a, b) => worshipScore(b) - worshipScore(a));
        kept.hidden = list.length - kept.length;
        return kept;
      };
      results = keepWorship(results);
      // Nothing found: ask Genius / YouTube (when a key is saved) for the proper names, then look those up
      if (!results.length) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const names = await findSongNameCandidates(`${cleanTitle} ${cleanArtist}`.trim(), ctl.signal, opts);
          const more = [];
          for (const n of names.slice(0, 6)) {
            const payload = await doFetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(`${n.title} ${n.artist}`.trim())}`).catch(() => null);
            if (Array.isArray(payload)) more.push(...payload);
          }
          results = dedupeLyricsSearchResults(more);
          if (want) results = results.filter((r) => r.language === want);
          results = keepWorship(results);
        } catch (e) { /* the extra sources are optional */ } finally { clearTimeout(timer); }
      }
      return results;
    }

    function selectNewSongLookupResult(index) {
      const i = Number(index);
      if (!Number.isFinite(i) || i < 0 || i >= newSongLookupResults.length) return;
      const picked = newSongLookupResults[i];
      const lyrics = picked && picked.lyrics ? picked.lyrics : extractLyricsFromLookupPayload(picked);
      if (!lyrics) {
        updateNewSongFetchStatus(t('new_song_selected_result_no_lyrics'), 'error');
        showToast(t('new_song_selected_result_no_lyrics'));
        return;
      }
      const titleInput = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const pickedTitle = (picked.title || '').trim();
      const pickedArtist = (picked.artist || '').trim();
      if (titleInput && pickedTitle) titleInput.value = pickedTitle;
      if (artistInput && pickedArtist) artistInput.value = pickedArtist;
      newSongFetchedLyrics = lyrics;
      const lyricsBox = document.getElementById('new-song-lyrics');
      if (lyricsBox) lyricsBox.value = lyrics;
      newSongFetchedLookupKey = getNewSongLookupKey(titleInput?.value || '', artistInput?.value || '');
      updateNewSongFetchStatus(t('new_song_lyrics_ready_selected'), 'success');
      showToast(t('new_song_lyrics_selected'));
      clearNewSongLookupResults();
    }

    let newSongSearchQueued = false;
    async function autoFetchNewSongLyrics() {
      if (newSongLookupBusy) { newSongSearchQueued = true; return; }
      const titleInput = document.getElementById('new-song-title');
      const artistInput = document.getElementById('new-song-artist');
      const title = (titleInput?.value || '').trim();
      const artist = (artistInput?.value || '').trim();
      if (!title && !artist) {
        showToast(t('auto_lyrics_enter_title_or_artist_first'));
        updateNewSongFetchStatus(t('auto_lyrics_enter_title_or_artist_first'), 'error');
        return;
      }
      setNewSongLookupBusy(true);
      updateNewSongFetchStatus(t('new_song_searching_matches'), 'muted');
      clearNewSongLookupResults();
      showSkeleton(document.getElementById('new-song-search-results'), 4, 'card');
      try {
        const results = await searchLyricsCatalog(title, artist, document.getElementById('new-song-lyrics-language')?.value || 'any', { worshipOnly: document.getElementById('new-song-worship-only')?.checked !== false });
        rememberLyricsTitles(results);
        showLyricsSuggestion('new-song-suggest', (!results || !results.length) ? suggestSongTitle(title) : '', (picked) => {
          const input = document.getElementById('new-song-title');
          if (input) input.value = picked;
          autoFetchNewSongLyrics();
        });
        if (!Array.isArray(results) || !results.length) {
          newSongFetchedLyrics = '';
          newSongFetchedLookupKey = '';
          updateNewSongFetchStatus(results && results.hidden ? `No worship songs matched. ${results.hidden} other song${results.hidden === 1 ? '' : 's'} hidden: untick "Worship songs only" to see ${results.hidden === 1 ? 'it' : 'them'}.` : t('new_song_no_matching_lyrics_found'), 'error');
          showToast(t('auto_lyrics_no_results_found'));
          return;
        }
        newSongLookupResults = results.slice(0, 40);
        if (!newSongLookupResults.length) {
          updateNewSongFetchStatus(t('new_song_matches_found_no_lyrics'), 'error');
          showToast(t('new_song_no_lyrics_in_results'));
          return;
        }
        renderNewSongLookupResults();
        updateNewSongFetchStatus(t('new_song_found_results_choose_one').replace('{count}', String(newSongLookupResults.length)), 'muted');
        showToast(t('new_song_choose_result'));
      } catch (e) {
        console.error('Lyrics fetch failed', e);
        updateNewSongFetchStatus(t('common_search_failed'), 'error');
        showToast(t('new_song_lyrics_search_failed'));
      } finally {
        setNewSongLookupBusy(false);
        // nothing to show (no matches or an error): the placeholders must not stay behind
        const lookupHost = document.getElementById('new-song-search-results');
        if (lookupHost && lookupHost.querySelector('.sk-row')) clearNewSongLookupResults();
        if (newSongSearchQueued) { newSongSearchQueued = false; autoFetchNewSongLyrics(); }
      }
    }

    function updateAutoLyricsStatus(message, tone = 'muted') {
      const el = document.getElementById('auto-lyrics-status');
      if (!el) return;
      el.textContent = message || '';
      if (tone === 'success') el.style.color = 'var(--success)';
      else if (tone === 'error') el.style.color = 'var(--danger)';
      else el.style.color = 'var(--text-secondary)';
    }

    function setAutoLyricsLookupBusy(busy) {
      autoLyricsLookupBusy = !!busy;
      const btn = document.getElementById('auto-lyrics-search-btn');
      if (!btn) return;
      btn.disabled = autoLyricsLookupBusy;
      btn.textContent = autoLyricsLookupBusy ? t('common_searching') : t('common_search');
    }

    function updateAutoLyricsInputClearButtons() {
      const titleInput = document.getElementById('auto-lyrics-title');
      const artistInput = document.getElementById('auto-lyrics-artist');
      const titleClear = document.getElementById('auto-lyrics-title-clear');
      const artistClear = document.getElementById('auto-lyrics-artist-clear');
      if (titleClear) titleClear.style.display = (titleInput && titleInput.value) ? 'flex' : 'none';
      if (artistClear) artistClear.style.display = (artistInput && artistInput.value) ? 'flex' : 'none';
    }

    function clearAutoLyricsField(kind) {
      const input = document.getElementById(kind === 'artist' ? 'auto-lyrics-artist' : 'auto-lyrics-title');
      if (!input) return;
      input.value = '';
      updateAutoLyricsInputClearButtons();
      try { input.focus(); } catch (_) {}
    }

    function closeAutoLyricsContextMenu() {
      const menu = document.getElementById('auto-lyrics-context-menu');
      if (!menu) return;
      menu.style.display = 'none';
      menu.innerHTML = '';
      autoLyricsContextEntry = null;
    }

    function hideAutoLyricsPreview() {
      const preview = document.getElementById('auto-lyrics-preview');
      if (!preview) return;
      preview.style.display = 'none';
      preview.textContent = '';
    }

    function bindAutoLyricsGlobalHandlers() {
      if (autoLyricsUiBound) return;
      autoLyricsUiBound = true;
      document.addEventListener('mousedown', (e) => {
        const menu = document.getElementById('auto-lyrics-context-menu');
        if (!menu || menu.style.display !== 'block') return;
        const t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
        if (t && typeof t.closest === 'function' && t.closest('#auto-lyrics-context-menu')) return;
        closeAutoLyricsContextMenu();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeAutoLyricsContextMenu();
          hideAutoLyricsPreview();
        }
      });
      window.addEventListener('scroll', () => {
        closeAutoLyricsContextMenu();
        hideAutoLyricsPreview();
        positionAutoLyricsModal();
      }, true);
      window.addEventListener('resize', () => {
        closeAutoLyricsContextMenu();
        hideAutoLyricsPreview();
        positionAutoLyricsModal();
      });
    }

    function showAutoLyricsPreview(entry, clientX, clientY) {
      const preview = document.getElementById('auto-lyrics-preview');
      if (!preview || !entry) return;
      const title = entry.title || 'Untitled';
      const artist = entry.artist || t('common_unknown_artist');
      const body = String(entry.lyrics || '').trim().split('\n').slice(0, 24).join('\n');
      preview.textContent = `${title}${artist ? ' — ' + artist : ''}\n\n${body}`;
      preview.style.display = 'block';
      const pad = 12;
      const w = preview.offsetWidth || 360;
      const h = preview.offsetHeight || 260;
      let left = (clientX || 0) + 14;
      let top = (clientY || 0) + 14;
      if (left + w > window.innerWidth - pad) left = Math.max(pad, (clientX || 0) - w - 12);
      if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
    }

    function normalizeSongTitleKeyForInsert(title) {
      return String(title || '').trim().toLowerCase();
    }

    function buildUniqueSongTitle(baseTitle) {
      const base = String(baseTitle || '').trim() || 'Untitled';
      const used = new Set(songs.map(s => normalizeSongTitleKeyForInsert(s && s.title)));
      if (!used.has(normalizeSongTitleKeyForInsert(base))) return base;
      let n = 2;
      while (n < 1000) {
        const candidate = `${base} (${n})`;
        if (!used.has(normalizeSongTitleKeyForInsert(candidate))) return candidate;
        n += 1;
      }
      return `${base} (${Date.now()})`;
    }

    function addAutoLyricsResultToSongs(entry, opts = {}) {
      if (!entry || !entry.lyrics) return null;
      const openEditor = opts.openEditor !== false;
      const closeModalAfter = !!opts.closeModal;
      const title = buildUniqueSongTitle(entry.title || 'Untitled');
      const content = String(entry.lyrics || '').trim();
      const newSong = {
        id: createId('song', title),
        title,
        content,
        text: content,
        searchableText: normalizeSearchText(`${title}\n${content}`),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      songs.push(newSong);
      idbPut(STORE_SONGS, buildSongRecord(newSong, { isNew: true })).catch(() => {});
      saveState();
      saveToStorageDebounced();
      if (openEditor) {
        setSidebarTab('songs');
        const searchInput = document.getElementById('song-search');
        if (searchInput) searchInput.value = '';
        setSearchValueForTab('songs', '');
        selectItem(songs.length - 1);
        setEditorMode('text');
        document.getElementById('lyric-editor')?.focus();
        requestAnimationFrame(() => {
          focusActiveSongInSidebar();
        });
      } else {
        renderSongs();
      }
      if (closeModalAfter) closeModal('autoLyricsModal');
      showToast(openEditor ? t('auto_lyrics_added_and_opened') : t('auto_lyrics_added_to_songs'));
      return newSong;
    }

    function openAutoLyricsResultContextMenu(entry, x, y) {
      const menu = document.getElementById('auto-lyrics-context-menu');
      if (!menu || !entry) return;
      autoLyricsContextEntry = entry;
      menu.innerHTML = '';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'sl-ctx-item';
      addBtn.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:var(--text);padding:8px 10px;border-radius:6px;cursor:pointer;';
      addBtn.textContent = t('auto_lyrics_add_to_songs');
      addBtn.onclick = () => {
        if (autoLyricsContextEntry) addAutoLyricsResultToSongs(autoLyricsContextEntry, { openEditor: false, closeModal: false });
        closeAutoLyricsContextMenu();
      };
      menu.appendChild(addBtn);
      menu.style.display = 'block';
      const rect = menu.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 8;
      const maxY = window.innerHeight - rect.height - 8;
      menu.style.left = `${Math.max(4, Math.min(x, maxX))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, maxY))}px`;
    }

    function renderAutoLyricsResults() {
      const host = document.getElementById('auto-lyrics-results');
      if (!host) return;
      host.innerHTML = '';
      if (!autoLyricsResults.length) {
        host.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:10px">${esc(t('auto_lyrics_no_results_yet'))}</div>`;
        requestAnimationFrame(() => {
          positionAutoLyricsModal();
        });
        return;
      }
      const frag = document.createDocumentFragment();
      autoLyricsResults.forEach((entry) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:block;width:100%;text-align:left;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin:0 0 8px;color:var(--text);cursor:pointer;';
        const meta = `${entry.artist || 'Unknown artist'}${entry.album ? ' • ' + entry.album : ''}${entry.source ? ' • ' + entry.source : ''}${entry.language ? ' • ' + entry.language + (entry.converted ? ' → typed English' : '') : ''}`;
        row.innerHTML = `<div style="font-size:12px;font-weight:700">${esc(entry.title)}</div><div style="font-size:11px;color:var(--text-secondary)">${esc(meta)}</div>`;
        row.onclick = () => {
          addAutoLyricsResultToSongs(entry, { openEditor: true, closeModal: false });
        };
        row.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openAutoLyricsResultContextMenu(entry, e.clientX, e.clientY);
        };
        row.onmouseenter = (e) => showAutoLyricsPreview(entry, e.clientX, e.clientY);
        row.onmousemove = (e) => showAutoLyricsPreview(entry, e.clientX, e.clientY);
        row.onmouseleave = () => hideAutoLyricsPreview();
        frag.appendChild(row);
      });
      host.appendChild(frag);
      requestAnimationFrame(() => {
        positionAutoLyricsModal();
      });
    }


    // From the ⌘K palette: open the Auto-Lyrics window with the typed words and search the web at once
    function openLyricsWebSearch(query, language = 'any') {
      openModal('autoLyricsModal');
      const titleInput = document.getElementById('auto-lyrics-title');
      const artistInput = document.getElementById('auto-lyrics-artist');
      const languageSelect = document.getElementById('auto-lyrics-language');
      if (titleInput) titleInput.value = String(query || '').trim();
      if (artistInput) artistInput.value = '';
      if (languageSelect) languageSelect.value = language;
      updateAutoLyricsInputClearButtons();
      searchAutoLyrics();
    }

    let autoLyricsSearchQueued = false;
    async function searchAutoLyrics() {
      if (autoLyricsLookupBusy) { autoLyricsSearchQueued = true; return; }
      const title = (document.getElementById('auto-lyrics-title')?.value || '').trim();
      const artist = (document.getElementById('auto-lyrics-artist')?.value || '').trim();
      if (!title && !artist) {
        updateAutoLyricsStatus(t('auto_lyrics_enter_title_or_artist_first'), 'error');
        showToast(t('auto_lyrics_enter_title_or_artist_first'));
        return;
      }
      setAutoLyricsLookupBusy(true);
      updateAutoLyricsStatus(t('common_searching'), 'muted');
      showSkeleton(document.getElementById('auto-lyrics-results'), 4, 'card');
      closeAutoLyricsContextMenu();
      hideAutoLyricsPreview();
      try {
        const results = await searchLyricsCatalog(title, artist, document.getElementById('auto-lyrics-language')?.value || 'any', { worshipOnly: document.getElementById('auto-lyrics-worship-only')?.checked !== false });
        autoLyricsResults = Array.isArray(results) ? results.slice(0, 40) : [];
        rememberLyricsTitles(results);
        showLyricsSuggestion('auto-lyrics-suggest', autoLyricsResults.length ? '' : suggestSongTitle(title), (picked) => {
          const input = document.getElementById('auto-lyrics-title');
          if (input) input.value = picked;
          updateAutoLyricsInputClearButtons();
          searchAutoLyrics();
        });
        renderAutoLyricsResults();
        if (!autoLyricsResults.length) {
          updateAutoLyricsStatus(results && results.hidden ? `No worship songs matched. ${results.hidden} other song${results.hidden === 1 ? '' : 's'} hidden: untick "Worship songs only" to see ${results.hidden === 1 ? 'it' : 'them'}.` : t('auto_lyrics_no_results_found'), 'error');
          showToast(t('auto_lyrics_no_results_found'));
          return;
        }
        updateAutoLyricsStatus(t('auto_lyrics_found_results_click_add').replace('{count}', String(autoLyricsResults.length)), 'success');
      } catch (e) {
        console.error('Auto lyrics search failed', e);
        autoLyricsResults = [];
        renderAutoLyricsResults();
        updateAutoLyricsStatus(t('common_search_failed'), 'error');
        showToast(t('auto_lyrics_search_failed'));
      } finally {
        setAutoLyricsLookupBusy(false);
        const autoHost = document.getElementById('auto-lyrics-results');
        if (autoHost) autoHost.removeAttribute('aria-busy');
        if (autoLyricsSearchQueued) { autoLyricsSearchQueued = false; searchAutoLyrics(); }
      }
    }

    function updateSidebarToggleTooltip() {
      const s = document.getElementById('sidebar');
      if (!s) return;
      if (isSidebarDockedLayoutActive()) {
        const title = s.classList.contains('sidebar-open') ? 'close sidebar' : 'open sidebar';
        const topBtn = document.getElementById('sidebar-toggle-btn');
        const leftBtn = document.getElementById('ab-sidebar-toggle');
        const footerBtn = document.getElementById('footer-sidebar-btn');
        if (topBtn) topBtn.title = title;
        if (leftBtn) leftBtn.title = title;
        if (footerBtn) footerBtn.title = title;
        return;
      }
      const isOpen = s.classList.contains('sidebar-open');
      const title = isOpen ? 'close sidebar' : 'open sidebar';
      const topBtn = document.getElementById('sidebar-toggle-btn');
      const leftBtn = document.getElementById('ab-sidebar-toggle');
      const footerBtn = document.getElementById('footer-sidebar-btn');
      if (topBtn) topBtn.title = title;
      if (leftBtn) leftBtn.title = title;
      if (footerBtn) footerBtn.title = title;
    }

    function normalizeSidebarLayout(layout) {
      return layout === 'layout2' ? 'layout2' : 'layout1';
    }

    function normalizeWorkspaceLayoutMode(mode) {
      return mode === 'focused' ? 'focused' : 'classic';
    }

    function isFocusedWorkspaceMode() {
      return normalizeWorkspaceLayoutMode(workspaceLayoutMode) === 'focused';
    }

    // Bible "Reader" view: the same verse buttons, laid out as one passage.
    const BIBLE_READER_VIEW_KEY = 'scripturePod.bibleReaderView.v1';

    function setBibleReaderView(enabled) {
      const on = !!enabled;
      document.body.classList.toggle('bible-reader-view', on);
      document.getElementById('bible-view-verses')?.classList.toggle('active', !on);
      document.getElementById('bible-view-verses')?.setAttribute('aria-pressed', on ? 'false' : 'true');
      document.getElementById('bible-view-reader')?.classList.toggle('active', on);
      document.getElementById('bible-view-reader')?.setAttribute('aria-pressed', on ? 'true' : 'false');
      try { localStorage.setItem(BIBLE_READER_VIEW_KEY, on ? '1' : '0'); } catch (_) {}
    }

    function restoreBibleReaderView() {
      let on = false;
      try { on = localStorage.getItem(BIBLE_READER_VIEW_KEY) === '1'; } catch (_) {}
      setBibleReaderView(on);
    }

    // ── Saved service templates: keep a setlist and start next week's from it ─────────
    const SERVICE_TEMPLATES_KEY = 'scripturePod.serviceTemplates.v1';
    function loadServiceTemplates() {
      try { const v = JSON.parse(localStorage.getItem(SERVICE_TEMPLATES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function saveServiceTemplates(list) {
      try { localStorage.setItem(SERVICE_TEMPLATES_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { showToast('Could not save the template'); }
    }
    function saveSetlistAsTemplate(name) {
      const clean = String(name || '').trim().slice(0, 60);
      if (!clean) { showToast('Give the template a name'); return false; }
      if (!schedule.length) { showToast('The setlist is empty'); return false; }
      const list = loadServiceTemplates().filter((t) => t.name.toLowerCase() !== clean.toLowerCase());
      list.unshift({ id: createId('tpl', clean), name: clean, savedAt: Date.now(), entries: JSON.parse(JSON.stringify(schedule)) });
      saveServiceTemplates(list);
      showToast(`Saved the template “${clean}”`);
      return true;
    }
    function useServiceTemplate(id) {
      const tpl = loadServiceTemplates().find((t) => t.id === id);
      if (!tpl) return;
      const apply = () => {
        schedule = JSON.parse(JSON.stringify(tpl.entries));
        saveState(); saveToStorageDebounced();
        if (sidebarTab === 'schedule') renderSongs();
        renderFocusedMainPanel();
        showToast(`Setlist started from “${tpl.name}”`);
      };
      if (schedule.length && typeof showConfirm === 'function') showConfirm('Replace the setlist?', `The current setlist will be replaced by “${tpl.name}”.`, apply);
      else apply();
    }
    function deleteServiceTemplate(id) {
      saveServiceTemplates(loadServiceTemplates().filter((t) => t.id !== id));
      renderSetlistTemplateBar();
    }
    function renderSetlistTemplateBar() {
      const bar = document.getElementById('setlist-template-bar');
      if (!bar) return;
      bar.replaceChildren();
      const templates = loadServiceTemplates();
      const mk = (text, onClick, title) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn setlist-template-btn'; b.textContent = text; if (title) b.title = title; b.onclick = onClick; return b; };
      const save = mk('Save as template', () => {
        const input = document.createElement('input');
        input.type = 'text'; input.placeholder = 'Template name, e.g. Sunday service'; input.maxLength = 60; input.className = 'setlist-template-name';
        input.onkeydown = (e) => { if (e.key === 'Enter') { if (saveSetlistAsTemplate(input.value)) renderSetlistTemplateBar(); } if (e.key === 'Escape') renderSetlistTemplateBar(); };
        save.replaceWith(input); input.focus();
      }, 'Keep this setlist as a template');
      bar.appendChild(save);
      if (templates.length) {
        const select = document.createElement('select');
        select.className = 'setlist-template-select'; select.setAttribute('aria-label', 'Start from a template');
        select.innerHTML = '<option value="">Start from a template…</option>' + templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${t.entries.length})</option>`).join('');
        select.onchange = () => { const id = select.value; select.value = ''; if (id) useServiceTemplate(id); };
        bar.appendChild(select);
        const del = mk('Delete a template', () => {
          del.replaceWith(Object.assign(document.createElement('select'), {
            className: 'setlist-template-select',
            innerHTML: '<option value="">Choose one to delete…</option>' + templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(''),
            onchange(ev) { if (ev.target.value) deleteServiceTemplate(ev.target.value); }
          }));
        }, 'Remove a saved template');
        bar.appendChild(del);
      }
    }

    function renderFocusedMainPanel() {
      const panel = document.getElementById('focused-main-panel');
      if (!panel) return;
      if (!isFocusedWorkspaceMode() || sidebarTab !== 'schedule') {
        panel.innerHTML = '';
        panel.setAttribute('aria-hidden', 'true');
        return;
      }
      panel.setAttribute('aria-hidden', 'false');
      const activeScheduleIndex = (sidebarTab === 'schedule' && buttonContextTab === 'schedule') ? currentIndex : -1;
      const entries = Array.isArray(schedule) ? schedule : [];
      const liveScheduleIndex = (isLive && livePointer && livePointer.source === 'schedule') ? livePointer.index : -1;
      const icons = {
        passage: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>',
        song: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
        up: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
        down: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
        remove: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      };
      const itemsHtml = entries.length ? entries.map((entry, idx) => {
        const isActive = idx === activeScheduleIndex;
        const isOnAir = idx === liveScheduleIndex;
        const isUpNext = liveScheduleIndex >= 0 && idx === liveScheduleIndex + 1;
        const isPassage = getIsBibleItem(entry);
        const previewSource = String(entry?.content || entry?.text || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
        const preview = esc(previewSource || (entry?.title || 'Untitled'));
        const title = esc(entry?.title || `Item ${idx + 1}`);
        const kind = isPassage ? 'Passage' : 'Song';
        const tag = isOnAir
          ? '<span class="setlist-tag is-live">Live</span>'
          : (isUpNext ? '<span class="setlist-tag is-next">Up next</span>' : '');
        return `
          <div class="focused-main-item setlist-row${isActive ? ' active' : ''}${isOnAir ? ' is-live' : ''}${isUpNext ? ' is-next' : ''}" data-focused-schedule-index="${idx}">
            <span class="setlist-number">${String(idx + 1).padStart(2, '0')}</span>
            <span class="setlist-kind" title="${kind}">${isPassage ? icons.passage : icons.song}</span>
            <button type="button" class="focused-main-item-copy setlist-open" data-focused-action="select" data-focused-schedule-index="${idx}">
              <span class="focused-main-item-title">${title}</span>
              <span class="focused-main-item-preview"><span class="setlist-kind-label">${kind}</span> · ${preview}</span>
            </button>
            ${tag}
            <div class="focused-main-item-actions">
              <button type="button" class="btn setlist-icon-btn" data-focused-action="up" data-focused-schedule-index="${idx}" aria-label="Move ${title} up"${idx === 0 ? ' disabled' : ''}>${icons.up}</button>
              <button type="button" class="btn setlist-icon-btn" data-focused-action="down" data-focused-schedule-index="${idx}" aria-label="Move ${title} down"${idx === entries.length - 1 ? ' disabled' : ''}>${icons.down}</button>
              <button type="button" class="btn setlist-icon-btn" data-focused-action="remove" data-focused-schedule-index="${idx}" aria-label="Remove ${title} from setlist">${icons.remove}</button>
              <button type="button" class="btn focused-main-mini-btn setlist-live-btn" data-focused-action="live" data-focused-schedule-index="${idx}">Go live</button>
            </div>
          </div>
        `;
      }).join('') : `<div class="focused-main-empty">The setlist is empty. Add verses or songs with their + buttons, or right-click a chapter or song and choose Add to setlist.</div>`;

      panel.innerHTML = `
        <div class="focused-main-shell">
          <div class="focused-main-header">
            <div class="focused-main-title">Setlist</div>
            <div class="focused-main-subtitle">${entries.length} item${entries.length === 1 ? '' : 's'}</div>
          </div>
          <div class="setlist-template-bar" id="setlist-template-bar"></div>
          <div class="focused-main-list">${itemsHtml}</div>
        </div>
      `;
      renderSetlistTemplateBar();
      renderSetlistNextCard();
    }

    // Setlist "Up next" card (right column): the item after the live one, else
    // after the selected one, else the first. Operator notes are saved on the
    // setlist item itself.
    let setlistNextIndex = -1;

    function getSetlistUpNextIndex() {
      const entries = Array.isArray(schedule) ? schedule : [];
      if (!entries.length) return -1;
      const liveIndex = (isLive && livePointer && livePointer.source === 'schedule') ? livePointer.index : -1;
      const selected = (buttonContextTab === 'schedule') ? currentIndex : -1;
      const anchor = liveIndex >= 0 ? liveIndex : selected;
      const next = anchor >= 0 ? anchor + 1 : 0;
      return next < entries.length ? next : -1;
    }

    function renderSetlistNextCard() {
      const body = document.getElementById('setlist-next-body');
      const number = document.getElementById('setlist-next-number');
      const notes = document.getElementById('setlist-next-notes');
      const notesWrap = document.getElementById('setlist-next-notes-wrap');
      if (!body) return;
      const idx = getSetlistUpNextIndex();
      const entry = idx >= 0 ? schedule[idx] : null;
      if (number) number.textContent = entry ? String(idx + 1).padStart(2, '0') : '';
      if (notesWrap) notesWrap.hidden = !entry;
      if (!entry) {
        body.innerHTML = '<p class="setlist-next-empty">Nothing after this item.</p>';
        setlistNextIndex = -1;
        return;
      }
      const isPassage = getIsBibleItem(entry);
      const pages = getPagesFromItem(entry, isPassage);
      const rows = [
        ['Type', isPassage ? 'Passage' : 'Song'],
        isPassage && entry.version ? ['Version', entry.version] : null,
        ['Slides', String(pages.length)]
      ].filter(Boolean);
      body.innerHTML = `
        <div class="setlist-next-title">${esc(entry.title || `Item ${idx + 1}`)}</div>
        <dl class="setlist-next-facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <button type="button" class="btn setlist-next-cue" onclick="handleFocusedSchedulePanelAction('select', ${idx})">Cue in preview</button>
      `;
      // Only refill the notes when the up-next item changes, so typing is never interrupted
      if (notes && setlistNextIndex !== idx) notes.value = entry.notes || '';
      setlistNextIndex = idx;
    }

    function handleSetlistNotesInput(value) {
      const entry = setlistNextIndex >= 0 ? schedule[setlistNextIndex] : null;
      if (!entry) return;
      entry.notes = String(value || '');
      saveState();
      saveToStorageDebounced();
    }

    function handleFocusedSchedulePanelAction(action, idx) {
      const index = Number(idx);
      if (!Number.isFinite(index) || index < 0 || index >= schedule.length) return;
      const entry = schedule[index];
      if (!entry) return;
      if (action === 'select') {
        scheduleReturnTarget = buildScheduleRestoreTarget(entry);
        buttonContextTab = 'schedule';
        selectItem(index);
        const setlistBehavior = (typeof getSetlistSettingsSnapshot === 'function')
          ? getSetlistSettingsSnapshot()
          : DEFAULT_SETLIST_SETTINGS;
        if (setlistBehavior.autoGoLiveOnSelect) {
          projectLive(true);
        }
        return;
      }
      if (action === 'live') {
        scheduleReturnTarget = buildScheduleRestoreTarget(entry);
        buttonContextTab = 'schedule';
        selectItem(index);
        projectLive(true);
        return;
      }
      if (action === 'remove') {
        schedule.splice(index, 1);
        saveState();
        saveToStorageDebounced();
        renderSongs();
        showToast('Removed from setlist');
        return;
      }
      if (action === 'up' && index > 0) {
        const moved = schedule.splice(index, 1)[0];
        schedule.splice(index - 1, 0, moved);
        saveState();
        saveToStorageDebounced();
        renderSongs();
        return;
      }
      if (action === 'down' && index < schedule.length - 1) {
        const moved = schedule.splice(index, 1)[0];
        schedule.splice(index + 1, 0, moved);
        saveState();
        saveToStorageDebounced();
        renderSongs();
      }
    }

    function refreshWorkspaceLayoutUi() {
      const mode = normalizeWorkspaceLayoutMode(workspaceLayoutMode);
      const body = document.body;
      if (body) {
        body.classList.toggle('workspace-layout-focused', mode === 'focused');
        body.dataset.workspaceLayoutMode = mode;
        body.dataset.sidebarTab = sidebarTab || 'bible';
      }
      const editorContainer = document.getElementById('editor-container');
      const focusedPanel = document.getElementById('focused-main-panel');
      const isScheduleFocused = mode === 'focused' && sidebarTab === 'schedule';
      if (editorContainer) editorContainer.style.display = isScheduleFocused ? 'none' : 'flex';
      if (focusedPanel) focusedPanel.style.display = isScheduleFocused ? 'flex' : 'none';
      if (mode === 'focused' && sidebarTab !== 'songs' && editorMode !== 'btn') {
        setEditorMode('btn');
      }
      updateFocusedWorkspaceToolbar();
      updateFocusedEditorBanner();
      renderFocusedMainPanel();
    }

    function applyWorkspaceLayoutMode(mode, opts = {}) {
      workspaceLayoutMode = normalizeWorkspaceLayoutMode(mode);
      if (workspaceLayoutMode === 'focused') {
        saveFocusedWorkspaceControlsForTab(sidebarTab);
      }
      const select = document.getElementById('workspace-layout-mode-select');
      if (select && select.value !== workspaceLayoutMode) select.value = workspaceLayoutMode;
      refreshWorkspaceLayoutUi();
      if (opts.persist === false) return;
      saveToStorageDebounced();
    }

    function handleWorkspaceLayoutModeChange() {
      const select = document.getElementById('workspace-layout-mode-select');
      applyWorkspaceLayoutMode(select ? select.value : 'classic', { persist: true });
    }

    function updateFocusedWorkspaceToolbar() {
      const addBtn = document.querySelector('.header-toolbar > .add-btn');
      const modeSwitch = document.getElementById('editor-mode-switch');
      const importsWrap = document.querySelector('.imports-wrap');
      const fxCard = document.getElementById('fx-card');
      const focused = isFocusedWorkspaceMode();
      const isSongsTab = sidebarTab === 'songs';
      const isBibleTab = sidebarTab === 'bible';
      const isScheduleTab = sidebarTab === 'schedule';

      if (addBtn) addBtn.style.display = (!focused || isSongsTab) ? '' : 'none';
      if (modeSwitch) modeSwitch.style.display = (!focused || !isScheduleTab) ? '' : 'none';
      if (importsWrap) importsWrap.style.display = (!focused || isSongsTab || isBibleTab) ? '' : 'none';
      if (fxCard) fxCard.style.display = (!focused || !isScheduleTab) ? '' : 'none';
    }

    function updateFocusedEditorBanner() {
      if (typeof syncSongEditBar === 'function') syncSongEditBar();
      const titleEl = document.getElementById('focused-editor-banner-title');
      const subtitleEl = document.getElementById('focused-editor-banner-subtitle');
      const sectionNavEl = document.getElementById('focused-editor-section-nav');
      if (!titleEl || !subtitleEl || !sectionNavEl) return;
      const eyebrowEl = document.getElementById('focused-editor-banner-eyebrow');
      const searchLabelEl = document.getElementById('library-label-search');
      const setEyebrow = (text) => { if (eyebrowEl) eyebrowEl.textContent = text; };
      // View toggle labels follow the workspace (the design's Slides / Edit text)
      const modeTextLabel = document.querySelector('#mode-text span');
      const modeBtnLabel = document.querySelector('#mode-btn span');
      if (modeTextLabel && modeBtnLabel && sidebarTab === 'songs') {
        modeTextLabel.textContent = 'Edit text';
        modeBtnLabel.textContent = 'Slides';
      }
      if (searchLabelEl) {
        searchLabelEl.textContent = sidebarTab === 'songs' ? 'Find a song' : (sidebarTab === 'schedule' ? 'Find in setlist' : 'Go to passage');
      }
      const renderSectionNav = (items = []) => {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
          sectionNavEl.innerHTML = '';
          sectionNavEl.classList.remove('has-items');
          return;
        }
        sectionNavEl.innerHTML = list.map((item) => {
          const safeLabel = esc(String(item.label || 'Section'));
          const safeTag = esc(String(item.tag || ''));
          const short = esc(sectionShortCode(item.label));
          return `<button type="button" class="focused-section-chip" data-section-tag="${safeTag}" onclick="jumpToFocusedSongSection(this.dataset.sectionTag)"><span class="chip-code">${short}</span>${safeLabel}</button>`;
        }).join('') + `<button type="button" class="focused-section-add" aria-label="Add a section" title="Add a section" onclick="addSongSection()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>`;
        sectionNavEl.classList.add('has-items');
        if (typeof refreshArrangementChips === 'function') refreshArrangementChips();
      };
      if (!isFocusedWorkspaceMode()) {
        setEyebrow('');
        titleEl.textContent = 'Workspace';
        subtitleEl.textContent = '';
        renderSectionNav([]);
        return;
      }
      if (sidebarTab === 'songs') {
        const hasSong = currentItem && !getIsBibleItem(currentItem);
        setEyebrow('Lyrics workspace');
        titleEl.textContent = hasSong ? (currentItem.title || 'Untitled song') : 'Lyrics';
        subtitleEl.textContent = hasSong ? '' : 'Select a song from the library';
        if (currentItem && !getIsBibleItem(currentItem)) {
          const pages = getPagesFromItem(currentItem, false);
          const seen = new Set();
          const sectionItems = [];
          const getSectionLabel = (tag) => {
            const trimmed = String(tag || '').trim();
            if (!trimmed) return '';
            const match = trimmed.match(/^(verse|chorus|bridge|refrain|pre[-\s]?chorus|intro|outro|tag|hook)\b\s*(\d+)?/i);
            if (!match) return trimmed;
            const base = match[1].replace(/^pre[-\s]?chorus$/i, 'Pre-Chorus');
            const label = base
              .split(/[\s-]+/)
              .map(part => part ? (part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()) : '')
              .join(base.includes('-') ? '-' : ' ');
            // Keep the section number so Verse 1, Verse 2… each get a chip
            return match[2] ? `${label} ${match[2]}` : label;
          };
          pages.forEach((page) => {
            const tag = String(page?.tag || '').trim();
            const label = getSectionLabel(tag);
            const key = label.toLowerCase();
            if (!label || seen.has(key)) return;
            seen.add(key);
            sectionItems.push({ label, tag });
          });
          renderSectionNav(sectionItems.filter(item => item.label && item.label.toLowerCase() !== 'lyrics'));
        } else {
          renderSectionNav([]);
        }
        return;
      }
      if (sidebarTab === 'bible') {
        const hasChapter = currentItem && getIsBibleItem(currentItem);
        setEyebrow('Bible workspace');
        titleEl.textContent = hasChapter ? (currentItem.title || 'Bible') : 'Bible';
        subtitleEl.textContent = hasChapter
          ? (getOnScreenVersionIds().map(getVersionCode).join(' · ') || getVersionCode(currentItem.version))
          : 'Select a chapter or search a reference';
        renderSectionNav([]);
        return;
      }
      if (sidebarTab === 'schedule') {
        setEyebrow('Setlist');
        titleEl.textContent = 'Setlist';
        subtitleEl.textContent = `${Array.isArray(schedule) ? schedule.length : 0} item${Array.isArray(schedule) && schedule.length === 1 ? '' : 's'}`;
        renderSectionNav([]);
        return;
      }
      titleEl.textContent = 'Workspace';
      subtitleEl.textContent = '';
      renderSectionNav([]);
    }

    // How song slides are laid out: grouped under each section, large cards, or a compact grid
    const LYRIC_VIEW_KEY = 'scripturePod.lyricView.v1';
    function setLyricView(view) {
      const v = ['grouped', 'cards', 'grid'].includes(view) ? view : 'cards';
      document.body.dataset.lyricView = v;
      document.querySelectorAll('#lyric-view-switch [data-lyric-view]').forEach((b) => {
        const on = b.dataset.lyricView === v;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      try { localStorage.setItem(LYRIC_VIEW_KEY, v); } catch (e) { /* storage unavailable */ }
    }
    function initLyricView() {
      let v = 'cards';
      try { v = localStorage.getItem(LYRIC_VIEW_KEY) || 'cards'; } catch (e) { /* storage unavailable */ }
      setLyricView(v);
    }

    // V1, C, B2 ... : the short code shown on each Arrangement chip
    function sectionShortCode(label) {
      const m = String(label || '').match(/^(verse|chorus|bridge|refrain|pre[-\s]?chorus|intro|outro|tag|hook)\s*(\d+)?/i);
      if (!m) return String(label || '').slice(0, 2).toUpperCase();
      const base = m[1].toLowerCase().replace(/[-\s]/g, '');
      const letter = { verse: 'V', chorus: 'C', bridge: 'B', refrain: 'R', prechorus: 'PC', intro: 'I', outro: 'O', tag: 'T', hook: 'H' }[base] || m[1][0].toUpperCase();
      return letter + (m[2] || '');
    }

    // Chips follow the cards: red for the section on air, blue for the one in Preview
    function refreshArrangementChips() {
      const nav = document.getElementById('focused-editor-section-nav');
      const container = document.getElementById('lyric-buttons');
      if (!nav || !container) return;
      const liveTag = container.querySelector('.lyric-btn .live-indicator') ? container.querySelector('.lyric-btn:has(.live-indicator)').dataset.section : null;
      const cueTag = container.querySelector('.lyric-btn.active')?.dataset.section || null;
      nav.querySelectorAll('.focused-section-chip').forEach((chip) => {
        const tag = chip.dataset.sectionTag;
        chip.classList.toggle('is-live', liveTag != null && tag === liveTag);
        chip.classList.toggle('is-cue', cueTag != null && tag === cueTag && tag !== liveTag);
      });
    }

    // + on the Arrangement row: start the next verse at the end of the lyrics, ready to type
    function addSongSection() {
      if (sidebarTab !== 'songs' || !currentItem || getIsBibleItem(currentItem)) return;
      const editor = document.getElementById('lyric-editor');
      if (!editor) return;
      const verses = (String(currentItem.content || editor.value || '').match(/^\[\s*verse\b/gim) || []).length;
      const name = `Verse ${verses + 1}`;
      const text = String(editor.value || '').replace(/\s+$/, '');
      editor.value = `${text}${text ? '\n\n' : ''}[${name}]\n`;
      if (typeof saveCurrentItem === 'function') saveCurrentItem();
      setEditorMode('text');
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
      editor.scrollTop = editor.scrollHeight;
    }

    function jumpToFocusedSongSection(tag) {
      if (sidebarTab !== 'songs' || !currentItem || getIsBibleItem(currentItem)) return;
      const targetTag = String(tag || '').trim();
      if (!targetTag) return;
      const container = document.getElementById('lyric-buttons');
      if (!container) return;
      // Like the design: a section chip cues that section's first slide in Preview
      const first = Array.from(container.querySelectorAll('.lyric-btn')).find((b) => String(b.dataset.section || '').trim() === targetTag);
      if (!first) return;
      lineCursor = Number(first.dataset.pageIndex) || 0;
      if (typeof updateActiveButtonInPlace === 'function') updateActiveButtonInPlace(lineCursor, false, -1);
      if (typeof schedulePreviewMonitorRefresh === 'function') schedulePreviewMonitorRefresh();
      first.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }

    function setupFocusedMainPanelEvents() {
      const panel = document.getElementById('focused-main-panel');
      if (!panel || panel.dataset.bound === '1') return;
      panel.dataset.bound = '1';
      panel.addEventListener('click', (event) => {
        const actionBtn = event.target.closest('[data-focused-action]');
        if (actionBtn) {
          event.stopPropagation();
          handleFocusedSchedulePanelAction(actionBtn.dataset.focusedAction, actionBtn.dataset.focusedScheduleIndex);
          return;
        }
        const row = event.target.closest('[data-focused-schedule-index]');
        if (row) {
          handleFocusedSchedulePanelAction('select', row.dataset.focusedScheduleIndex);
        }
      });
      panel.addEventListener('dblclick', (event) => {
        const row = event.target.closest('[data-focused-schedule-index]');
        if (!row) return;
        handleFocusedSchedulePanelAction('live', row.dataset.focusedScheduleIndex);
      });
    }

    function shouldUseDockedSidebarLayout() {
      if (sidebarLayoutMode !== 'layout2') return false;
      const sidebar = document.getElementById('sidebar');
      const host = document.getElementById('left-workspace');
      if (!sidebar || !host) return false;
      const hostWidth = host.clientWidth || host.offsetWidth || 0;
      if (!hostWidth) return false;
      const savedWidth = parseFloat(sidebar.style.width || '');
      const cssWidth = parseFloat(getComputedStyle(sidebar).width || '');
      const sidebarWidth = Math.max(150, Number.isFinite(savedWidth) ? savedWidth : 0, Number.isFinite(cssWidth) ? cssWidth : 200);
      const mainMinWidth = 300;
      const spacer = 10;
      return hostWidth >= (sidebarWidth + mainMinWidth + spacer);
    }

    function isSidebarDockedLayoutActive() {
      return document.body.classList.contains('sidebar-layout-docked-active');
    }

    function syncSidebarLayoutModeForViewport() {
      const shouldDock = shouldUseDockedSidebarLayout();
      document.body.classList.toggle('sidebar-layout-docked-active', shouldDock);
      if (sidebarLayoutMode !== 'layout2') return;
      const sidebar = document.getElementById('sidebar');
      if (shouldDock) {
        if (sidebar) {
          let shouldOpen = true;
          try {
            const savedOpen = localStorage.getItem('sidebarOpen');
            if (savedOpen === '0') shouldOpen = false;
          } catch (_) {}
          sidebar.classList.toggle('sidebar-open', shouldOpen);
          sidebar.style.left = '';
          sidebar.style.top = '';
          sidebar.style.height = '';
          sidebar.style.maxWidth = '';
          try {
            const saved = localStorage.getItem('sidebarWidth');
            if (saved) {
              sidebar.style.width = saved;
              sidebar.style.minWidth = saved;
            }
          } catch (_) {}
        }
      } else {
        setSidebarPopupOpen(false);
      }
      updateSidebarToggleTooltip();
      positionSidebarQuickActions();
    }

    function applySidebarLayoutMode(layout, opts = {}) {
      const persist = opts.persist !== false;
      sidebarLayoutMode = normalizeSidebarLayout(layout);
      const select = document.getElementById('sidebar-layout-select');
      if (select && select.value !== sidebarLayoutMode) select.value = sidebarLayoutMode;
      syncSidebarLayoutModeForViewport();
      if (persist) {
        saveState();
        saveToStorageDebounced();
      }
    }

    function handleSidebarLayoutChange() {
      const select = document.getElementById('sidebar-layout-select');
      applySidebarLayoutMode(select ? select.value : 'layout2', { persist: true });
    }

    function positionSidebarPopup() {
      const sidebar = document.getElementById('sidebar');
      const host = document.getElementById('left-workspace');
      const activityBar = document.getElementById('activity-bar');
      const topbar = document.getElementById('app-topbar');
      if (!sidebar) return;
      if (isSidebarDockedLayoutActive()) {
        sidebar.style.left = '';
        sidebar.style.top = '';
        sidebar.style.height = '';
        sidebar.style.maxWidth = '';
        positionSidebarQuickActions();
        return;
      }
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        sidebar.style.left = '';
        sidebar.style.top = '';
        sidebar.style.height = '';
        sidebar.style.width = '';
        positionSidebarQuickActions();
        return;
      }

      const activityRect = activityBar ? activityBar.getBoundingClientRect() : null;
      const hostRect = host ? host.getBoundingClientRect() : null;
      const headerRect = topbar ? topbar.getBoundingClientRect() : null;

      // always place the popup below the app header; activity bar normally
      // starts immediately under the header but in some edge cases (tiny
      // panels, scroll, obs-isolated mode) the computed top may collapse to 0
      // which would push the sidebar up into the title bar. using the header
      // bottom keeps it pinned correctly.
      const top = headerRect
        ? headerRect.bottom
        : (activityRect ? activityRect.top : (hostRect ? hostRect.top : 0));

      // width offset is controlled by activity bar width – use its right edge if
      // available, otherwise fall back to the workspace left.
      const left = activityRect
        ? activityRect.right
        : (hostRect ? hostRect.left : 0);

      // height should extend to the bottom of the window from the top offset.
      const height = Math.max(1, window.innerHeight - top);

      sidebar.style.left = Math.round(left) + 'px';
      sidebar.style.top = Math.round(top) + 'px';
      sidebar.style.height = Math.round(height) + 'px';
      sidebar.style.width = '200px';
      sidebar.style.minWidth = '200px';
      sidebar.style.maxWidth = '200px';
      positionSidebarQuickActions();
    }

    function setSidebarPopupOpen(open) {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebar-popup-backdrop');
      if (!sidebar) return;
      if (isSidebarDockedLayoutActive()) {
        const shouldOpen = !!open;
        sidebar.classList.toggle('sidebar-open', shouldOpen);
        if (backdrop) backdrop.classList.remove('open');
        try { localStorage.setItem('sidebarOpen', shouldOpen ? '1' : '0'); } catch (e) {}
        updateSidebarToggleTooltip();
        positionSidebarQuickActions();
        return;
      }
      const shouldOpen = !!open;
      positionSidebarPopup();
      sidebar.classList.toggle('sidebar-open', shouldOpen);
      if (backdrop) backdrop.classList.remove('open');
      try { localStorage.setItem('sidebarOpen', shouldOpen ? '1' : '0'); } catch (e) {}
      updateSidebarToggleTooltip();
      positionSidebarQuickActions();
    }

    function closeSidebarPopup() {
      setSidebarPopupOpen(false);
    }

    function toggleSidebar() {
      const s = document.getElementById('sidebar');
      if (!s) return;
      if (isSidebarDockedLayoutActive()) {
        setSidebarPopupOpen(!s.classList.contains('sidebar-open'));
        return;
      }
      setSidebarPopupOpen(!s.classList.contains('sidebar-open'));
    }

    function positionFooterPrimaryTabs() {
      const footer = document.getElementById('page-nav-bar');
      const primary = footer ? footer.querySelector('.page-nav-primary') : null;
      const toolsLeft = footer ? footer.querySelector('.page-nav-tool-left') : null;
      const sidebarBtn = document.getElementById('footer-sidebar-btn');
      const main = document.getElementById('main');
      if (!footer || !primary || !main) return;
      const footerRect = footer.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      if (!footerRect.width || !mainRect.width) return;
      const centerX = mainRect.left + (mainRect.width / 2) - footerRect.left;
      primary.style.left = `${Math.round(centerX)}px`;
      if (!toolsLeft) return;
      const primaryWidth = primary.offsetWidth || 0;
      const toolsWidth = toolsLeft.offsetWidth || 0;
      const sidebarRight = sidebarBtn
        ? (sidebarBtn.getBoundingClientRect().right - footerRect.left)
        : 52;
      const gap = 12;
      const leftStart = Math.max(12, Math.round(sidebarRight + gap));
      const leftEnd = Math.round(centerX - (primaryWidth / 2) - gap);
      toolsLeft.style.left = `${Math.max(leftStart, leftEnd - toolsWidth)}px`;
    }

    window.addEventListener('resize', () => {
      syncSidebarLayoutModeForViewport();
      positionSidebarPopup();
      positionFooterPrimaryTabs();
      positionSidebarQuickActions();
    });
    window.addEventListener('scroll', () => {
      positionSidebarPopup();
      positionSidebarQuickActions();
    }, true);

