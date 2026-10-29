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
