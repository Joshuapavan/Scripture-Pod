    // ── Custom shortcuts and clicker keys ─────────────────────────────────────────
    // Extra keys for the main actions, on top of the built-in ones (Space, Esc, arrows …). A presentation
    // clicker sends Page Down / Page Up (and often "." or "b" for a blank screen), so those work out of the box.
    // Each action's list can be edited in Settings, Shortcuts, and is kept on this computer.
    const SHORTCUT_ACTIONS = [
      { id: 'goLive', label: 'Go live', run: () => projectLive(true) },
      { id: 'preview', label: 'Send to Preview only', run: () => previewCurrentSelection() },
      { id: 'clear', label: 'Clear the live output', run: () => clearOutput() },
      { id: 'clearPreview', label: 'Clear Preview', run: () => clearProgramPreview() },
      { id: 'clearAll', label: 'Clear everything', run: () => clearAllOutputs() },
      { id: 'nextSlide', label: 'Next slide or verse', run: () => nextSlide() },
      { id: 'prevSlide', label: 'Previous slide or verse', run: () => prevSlide() },
      { id: 'nextItem', label: 'Next song or chapter', run: () => navigateSidebar(1) },
      { id: 'prevItem', label: 'Previous song or chapter', run: () => navigateSidebar(-1) },
      { id: 'nextVersion', label: 'Switch Bible version in the lower third', run: () => cycleLiveBibleVersion(1) },
      { id: 'toggleSidebar', label: 'Show or hide the sidebar', run: () => toggleSidebar() }
    ];
    const DEFAULT_EXTRA_SHORTCUTS = {
      nextSlide: ['PageDown'],
      prevSlide: ['PageUp'],
      clear: ['.', 'B'],
      nextVersion: ['V']
    };
    const SHORTCUTS_STORAGE_KEY = 'scripturePod.shortcuts.v1';

    function loadCustomShortcuts() {
      try {
        const saved = JSON.parse(localStorage.getItem(SHORTCUTS_STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') return saved;
      } catch (e) { /* storage unavailable */ }
      return JSON.parse(JSON.stringify(DEFAULT_EXTRA_SHORTCUTS));
    }
    let customShortcuts = loadCustomShortcuts();

    function saveCustomShortcuts() {
      try { localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(customShortcuts)); } catch (e) { /* storage unavailable */ }
    }

    // "Ctrl+Shift+F5", "PageDown", "." : modifiers in a fixed order, a single letter in capitals
    function shortcutFromEvent(e) {
      const key = e.key === ' ' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return '';
      const mods = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.metaKey) mods.push('Cmd');
      if (e.shiftKey && key.length > 1) mods.push('Shift');
      return [...mods, key].join('+');
    }

    function describeShortcut(s) { return s.replace('Cmd', '⌘').replace('Alt', '⌥').replace('Space', 'Space'); }

    function runShortcutAction(id, e) {
      const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
      if (!action) return false;
      if (e && e.repeat && ['goLive', 'clear', 'clearAll', 'preview'].includes(id)) return true;
      try { action.run(); } catch (err) { console.error('Shortcut failed', id, err); }
      return true;
    }

    let shortcutCapture = null;
    function setupCustomShortcuts() {
      document.addEventListener('keydown', (e) => {
        // choosing a key for an action in Settings
        if (shortcutCapture) {
          e.preventDefault(); e.stopImmediatePropagation();
          if (e.key === 'Escape') { shortcutCapture.cancel(); return; }
          const combo = shortcutFromEvent(e);
          if (combo) shortcutCapture.done(combo);
          return;
        }
        const target = e.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;
        if (document.querySelector('.modal-overlay') && [...document.querySelectorAll('.modal-overlay')].some((m) => m.style.display === 'flex')) return;
        const combo = shortcutFromEvent(e);
        if (!combo) return;
        for (const id of Object.keys(customShortcuts)) {
          if ((customShortcuts[id] || []).includes(combo)) {
            e.preventDefault(); e.stopImmediatePropagation();
            runShortcutAction(id, e);
            return;
          }
        }
      }, true);
    }

    function renderShortcutSettings() {
      const host = document.getElementById('shortcut-settings-list');
      if (!host) return;
      host.replaceChildren();
      SHORTCUT_ACTIONS.forEach((action) => {
        const row = document.createElement('div');
        row.className = 'shortcut-edit-row';
        const label = document.createElement('span');
        label.textContent = action.label;
        const keys = document.createElement('div');
        keys.className = 'shortcut-edit-keys';
        (customShortcuts[action.id] || []).forEach((combo) => {
          const chip = document.createElement('span');
          chip.className = 'shortcut-edit-chip';
          chip.append(describeShortcut(combo));
          const x = document.createElement('button');
          x.type = 'button'; x.textContent = '×'; x.title = 'Remove this key'; x.setAttribute('aria-label', 'Remove ' + combo);
          x.onclick = () => { customShortcuts[action.id] = customShortcuts[action.id].filter((c) => c !== combo); saveCustomShortcuts(); renderShortcutSettings(); };
          chip.appendChild(x);
          keys.appendChild(chip);
        });
        const add = document.createElement('button');
        add.type = 'button'; add.className = 'shortcut-edit-add'; add.textContent = '+ Add key';
        add.onclick = () => {
          add.textContent = 'Press a key… (Esc cancels)';
          shortcutCapture = {
            cancel: () => { shortcutCapture = null; renderShortcutSettings(); },
            done: (combo) => {
              shortcutCapture = null;
              // one key does one thing: it moves from any other action
              Object.keys(customShortcuts).forEach((id) => { customShortcuts[id] = (customShortcuts[id] || []).filter((c) => c !== combo); });
              customShortcuts[action.id] = [...(customShortcuts[action.id] || []), combo];
              saveCustomShortcuts(); renderShortcutSettings();
            }
          };
        };
        keys.appendChild(add);
        row.append(label, keys);
        host.appendChild(row);
      });
    }

    function resetCustomShortcuts() {
      customShortcuts = JSON.parse(JSON.stringify(DEFAULT_EXTRA_SHORTCUTS));
      saveCustomShortcuts();
      renderShortcutSettings();
    }

    setupCustomShortcuts();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderShortcutSettings); else renderShortcutSettings();
