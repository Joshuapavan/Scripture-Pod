    // ── Section order ───────────────────────────────────────────────────────────
    // The tabs in the top bar (Bible, Lyrics, Overlays …) can be moved to any position: drag a tab, or focus it and press
    // Alt+Left / Alt+Right. The order is remembered, and ⌘1…9 follow it, because those keys count the tabs as they sit.
    // A section added later that is not in the saved order takes its place from the default order below.
    const SECTION_ORDER_KEY = 'scripturePod.sectionOrder.v1';
    const DEFAULT_SECTION_ORDER = ['tab-bible', 'tab-songs', 'tab-overlays', 'tab-schedule', 'tab-media', 'tab-background', 'tab-displays'];

    function loadSectionOrder() {
      try {
        const saved = JSON.parse(localStorage.getItem(SECTION_ORDER_KEY) || 'null');
        if (Array.isArray(saved)) return saved.filter((id) => typeof id === 'string');
      } catch (e) { /* storage unavailable */ }
      return null;
    }
    function saveSectionOrder(ids) {
      try { localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(ids)); } catch (e) { /* storage unavailable */ }
    }
    function sectionTabHost() { return document.querySelector('#app-topbar .sidebar-tabs'); }
    function sectionTabIds() { return Array.from(sectionTabHost()?.querySelectorAll('.tab') || []).map((t) => t.id); }

    // The order to use now: the saved one, then anything new in default order after the section before it
    function resolvedSectionOrder() {
      const present = sectionTabIds();
      const saved = loadSectionOrder();
      const base = saved ? saved.filter((id) => present.includes(id)) : [];
      const missing = DEFAULT_SECTION_ORDER.concat(present).filter((id, i, all) => present.includes(id) && !base.includes(id) && all.indexOf(id) === i);
      if (!saved) return DEFAULT_SECTION_ORDER.filter((id) => present.includes(id)).concat(present.filter((id) => !DEFAULT_SECTION_ORDER.includes(id)));
      // A section that is not in the saved order (one added later) goes at the end
      return base.concat(missing);
    }

    function applySectionOrder(ids) {
      const host = sectionTabHost();
      if (!host) return;
      const order = ids || resolvedSectionOrder();
      order.forEach((id) => { const el = document.getElementById(id); if (el && el.parentElement === host) host.appendChild(el); });
      // The bottom navigation (small windows) follows the same order
      const bottom = document.querySelector('#page-nav-bar');
      if (bottom) {
        order.forEach((id) => {
          const side = id.replace(/^tab-/, '');
          const btn = bottom.querySelector(`.page-nav-btn[data-side-tab="${side}"]`);
          if (btn && btn.parentElement) btn.parentElement.appendChild(btn);
        });
      }
      if (typeof labelSectionShortcuts === 'function') labelSectionShortcuts();
    }

    function moveSection(id, toIndex) {
      const ids = sectionTabIds();
      const from = ids.indexOf(id);
      if (from < 0) return;
      const to = Math.max(0, Math.min(ids.length - 1, toIndex));
      if (from === to) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      saveSectionOrder(ids);
      applySectionOrder(ids);
      const moved = document.getElementById(id);
      if (moved) moved.focus();
    }

    function resetSectionOrder() {
      try { localStorage.removeItem(SECTION_ORDER_KEY); } catch (e) { /* storage unavailable */ }
      applySectionOrder(DEFAULT_SECTION_ORDER.filter((id) => document.getElementById(id)));
      showToast('Sections are back in their usual order');
    }

    function setupSectionDrag() {
      const host = sectionTabHost();
      if (!host || host.dataset.dragReady) return;
      host.dataset.dragReady = '1';
      let dragId = '';
      const clearMarks = () => host.querySelectorAll('.tab').forEach((t) => t.classList.remove('drop-before', 'drop-after', 'is-dragging'));
      host.addEventListener('dragstart', (e) => {
        const tab = e.target.closest && e.target.closest('.tab');
        if (!tab) return;
        dragId = tab.id;
        tab.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', tab.id); } catch (err) { /* some engines need data to drag */ }
      });
      host.addEventListener('dragover', (e) => {
        if (!dragId) return;
        const over = e.target.closest && e.target.closest('.tab');
        if (!over || over.id === dragId) return;
        e.preventDefault();
        const r = over.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        host.querySelectorAll('.tab').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
        over.classList.add(after ? 'drop-after' : 'drop-before');
      });
      host.addEventListener('drop', (e) => {
        if (!dragId) return;
        const over = e.target.closest && e.target.closest('.tab');
        e.preventDefault();
        if (over && over.id !== dragId) {
          const r = over.getBoundingClientRect();
          const after = e.clientX > r.left + r.width / 2;
          const ids = sectionTabIds().filter((id) => id !== dragId);
          const at = ids.indexOf(over.id) + (after ? 1 : 0);
          ids.splice(at, 0, dragId);
          saveSectionOrder(ids);
          applySectionOrder(ids);
        }
        dragId = '';
        clearMarks();
      });
      host.addEventListener('dragend', () => { dragId = ''; clearMarks(); });
      host.addEventListener('keydown', (e) => {
        const tab = e.target.closest && e.target.closest('.tab');
        if (!tab || !e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault(); e.stopPropagation();
        moveSection(tab.id, sectionTabIds().indexOf(tab.id) + (e.key === 'ArrowLeft' ? -1 : 1));
      }, true);
      host.querySelectorAll('.tab').forEach((t) => { t.draggable = true; t.title = t.title || ''; });
    }

    function initSectionOrder() {
      applySectionOrder();
      setupSectionDrag();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSectionOrder); else initSectionOrder();

    // ── Showing and hiding sections ─────────────────────────────────────────────────
    // Any section can be hidden from the top bar (Settings, Sections). At least one always stays. A hidden section is
    // skipped by ⌘1…9 and ⌘[ ⌘], which count the tabs that are shown.
    const SECTION_HIDDEN_KEY = 'scripturePod.sectionHidden.v1';
    function loadHiddenSections() {
      try { const saved = JSON.parse(localStorage.getItem(SECTION_HIDDEN_KEY) || '[]'); if (Array.isArray(saved)) return saved.filter((id) => typeof id === 'string'); } catch (e) { /* storage unavailable */ }
      return [];
    }
    function saveHiddenSections(ids) {
      try { localStorage.setItem(SECTION_HIDDEN_KEY, JSON.stringify(ids)); } catch (e) { /* storage unavailable */ }
    }
    function applySectionVisibility() {
      const hidden = new Set(loadHiddenSections());
      const present = sectionTabIds();
      // Never all of them: with everything hidden there would be no way back
      if (present.length && present.every((id) => hidden.has(id))) hidden.delete(present[0]);
      present.forEach((id) => {
        const tab = document.getElementById(id);
        if (tab) tab.hidden = hidden.has(id);
        const btn = document.querySelector('#page-nav-bar .page-nav-btn[data-side-tab="' + id.replace(/^tab-/, '') + '"]');
        if (btn) btn.hidden = hidden.has(id);
      });
      // The open section was hidden: go to the first one that is shown
      const active = document.querySelector('#app-topbar .sidebar-tabs .tab.active');
      if (active && active.hidden) {
        const first = Array.from(sectionTabHost().querySelectorAll('.tab')).find((t) => !t.hidden);
        if (first) first.click();
      }
      if (typeof labelSectionShortcuts === 'function') labelSectionShortcuts();
    }
    function setSectionShown(id, shown) {
      const present = sectionTabIds();
      let hidden = loadHiddenSections().filter((x) => present.includes(x));
      hidden = shown ? hidden.filter((x) => x !== id) : Array.from(new Set(hidden.concat(id)));
      if (present.every((x) => hidden.includes(x))) { showToast('At least one section has to stay'); return false; }
      saveHiddenSections(hidden);
      applySectionVisibility();
      return true;
    }
    function showAllSections() {
      saveHiddenSections([]);
      applySectionVisibility();
      renderSectionsManager();
    }

    // The list in Settings: move a section up or down, show or hide it
    function renderSectionsManager() {
      const host = document.getElementById('sections-manager');
      if (!host) return;
      const ids = sectionTabIds();
      const hidden = new Set(loadHiddenSections());
      host.replaceChildren();
      ids.forEach((id, index) => {
        const tab = document.getElementById(id);
        if (!tab) return;
        const row = document.createElement('div');
        row.className = 'sec-row' + (hidden.has(id) ? ' is-hidden' : '');
        const icon = document.createElement('span');
        icon.className = 'sec-icon';
        const svg = tab.querySelector('svg');
        if (svg) icon.appendChild(svg.cloneNode(true));
        const name = document.createElement('span');
        name.className = 'sec-name';
        name.textContent = (tab.textContent || '').trim() || id;
        const place = document.createElement('span');
        place.className = 'sec-place';
        place.textContent = hidden.has(id) ? 'Hidden' : 'Key ' + (ids.filter((x) => !hidden.has(x)).indexOf(id) + 1 <= 9 ? '\u2318' + (ids.filter((x) => !hidden.has(x)).indexOf(id) + 1) : '\u2013');
        const move = (label, aria, delta, disabled) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'sec-move'; b.textContent = label; b.title = aria; b.setAttribute('aria-label', aria + ' ' + name.textContent);
          b.disabled = disabled;
          b.onclick = () => {
            moveSection(id, index + delta);
            renderSectionsManager();
            // Keep the keyboard where it was: on the same section's button, in its new row
            const rows = host.querySelectorAll('.sec-row');
            const moved = rows[Math.max(0, Math.min(rows.length - 1, index + delta))];
            const buttons = moved ? moved.querySelectorAll('.sec-move') : [];
            const target = buttons[delta < 0 ? 0 : 1];
            if (target && !target.disabled) target.focus(); else if (buttons[0] && !buttons[0].disabled) buttons[0].focus(); else if (buttons[1]) buttons[1].focus();
          };
          return b;
        };
        const toggle = document.createElement('label');
        toggle.className = 'mini-toggle sec-toggle';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !hidden.has(id); cb.setAttribute('aria-label', 'Show ' + name.textContent);
        cb.onchange = () => { if (!setSectionShown(id, cb.checked)) cb.checked = true; renderSectionsManager(); };
        toggle.appendChild(cb);
        row.append(icon, name, place, move('\u2191', 'Move up', -1, index === 0), move('\u2193', 'Move down', 1, index === ids.length - 1), toggle);
        host.appendChild(row);
      });
    }
    function resetSectionsFromSettings() {
      saveHiddenSections([]);
      resetSectionOrder();
      applySectionVisibility();
      renderSectionsManager();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySectionVisibility); else applySectionVisibility();

