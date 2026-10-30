    // ── Blur behind small menus ─────────────────────────────────────────────────────
    // While Outputs, the connected displays list, quick actions or another small menu is open, the app behind it is
    // blurred and dimmed, and the button that opened the menu and the menu itself stay sharp.
    //
    // This is done on the elements themselves: everything that is not the button, the menu or one of their parents
    // gets a blur filter. A blur drawn over the page (backdrop-filter) was left out of parts of the page in the
    // desktop app's web view, and could not leave a rounded button clear without a seam.
    const POPUP_SELECTOR = '#outputs-card.is-open, .preset-popover.open, #display-list-card.is-open, #sidebar-quick-actions-panel.open, #footer-bible-version-popover.open, #imports-popover:not([hidden]), .version-add-menu';
    // The button that opened each menu
    const POPUP_TRIGGERS = [
      ['#outputs-card.is-open', '#btn-topbar-outputs'],
      ['#display-list-card.is-open', '#status-bar'],
      ['#sidebar-quick-actions-panel.open', '#sidebar-quick-actions-btn'],
      ['#footer-bible-version-popover.open', '#footer-bible-version-btn'],
      ['#output-popover.open', '#btn-open-standalone-output'],
      ['#imports-popover:not([hidden])', '#btn-imports']
    ];
    const POPUP_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'META', 'NOSCRIPT']);
    let popupBlurred = [];
    let popupKeepKey = '';

    function clearPopupBlur() {
      popupBlurred.forEach((n) => n.classList.remove('sp-blurred'));
      popupBlurred = [];
      popupKeepKey = '';
    }
    // The open menus and the buttons that opened them: these stay sharp
    function popupKeepElements() {
      const keep = [];
      document.querySelectorAll(POPUP_SELECTOR).forEach((m) => keep.push(m));
      POPUP_TRIGGERS.forEach(([menu, trigger]) => {
        try { if (document.querySelector(menu)) { const t = document.querySelector(trigger); if (t) keep.push(t); } } catch (e) { /* selector unsupported */ }
      });
      return keep;
    }
    function applyPopupBlur(keepEls) {
      const key = keepEls.map((e) => (e.id || e.className || e.tagName)).join('|');
      if (key === popupKeepKey) return;
      clearPopupBlur();
      popupKeepKey = key;
      const leaves = new Set(keepEls);
      const keep = new Set();
      keepEls.forEach((el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) keep.add(n); });
      keep.forEach((node) => {
        // The button and the menu themselves are left alone; their parents have every other child blurred
        if (leaves.has(node)) return;
        Array.from(node.children).forEach((child) => {
          if (keep.has(child) || POPUP_SKIP_TAGS.has(child.tagName) || child.id === 'popup-scrim') return;
          child.classList.add('sp-blurred');
          popupBlurred.push(child);
        });
      });
    }

    function syncPopupScrim() {
      let keepEls = [];
      try { keepEls = popupKeepElements(); } catch (e) { /* selector unsupported */ }
      const open = keepEls.length > 0 && !!document.querySelector(POPUP_SELECTOR);
      document.body.classList.toggle('sp-popup-open', open);
      if (open) applyPopupBlur(keepEls); else if (popupBlurred.length) clearPopupBlur();
    }
    function schedulePopupScrim() { syncPopupScrim(); }
    window.addEventListener('resize', schedulePopupScrim);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(schedulePopupScrim).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    syncPopupScrim();
