    // ── Blur behind small menus ─────────────────────────────────────────────────────
    // While Outputs, the connected displays list, quick actions or another small menu is open, the app behind it is
    // blurred and dimmed. A class on the body says so, set here as menus open and close, so the style does not
    // depend on the engine understanding :has().
    const POPUP_SELECTOR = '#outputs-card.is-open, .preset-popover.open, #display-list-card.is-open, #sidebar-quick-actions-panel.open, #footer-bible-version-popover.open, #imports-popover:not([hidden]), .version-add-menu';
    // The button that opened each menu stays clear of the blur
    const POPUP_TRIGGERS = [
      ['#outputs-card.is-open', '#btn-topbar-outputs'],
      ['#display-list-card.is-open', '#status-bar'],
      ['#sidebar-quick-actions-panel.open', '#sidebar-quick-actions-btn'],
      ['#footer-bible-version-popover.open', '#footer-bible-version-btn'],
      ['#output-popover.open', '#btn-open-standalone-output'],
      ['#imports-popover:not([hidden])', '#btn-imports']
    ];
    function popupTriggerRect() {
      for (const [menu, trigger] of POPUP_TRIGGERS) {
        try {
          if (!document.querySelector(menu)) continue;
          const el = document.querySelector(trigger);
          const r = el && el.getBoundingClientRect();
          if (r && r.width && r.height) return r;
        } catch (e) { /* selector unsupported */ }
      }
      return null;
    }
    function syncPopupScrim() {
      let open = false;
      try { open = !!document.querySelector(POPUP_SELECTOR); } catch (e) { /* selector unsupported */ }
      document.body.classList.toggle('sp-popup-open', open);
      const scrim = document.getElementById('popup-scrim');
      if (!scrim) return;
      const r = open ? popupTriggerRect() : null;
      if (!r) { scrim.style.clipPath = ''; scrim.style.webkitClipPath = ''; return; }
      // The whole screen except a hole where the button is
      const pad = 3, x1 = Math.max(0, r.left - pad), y1 = Math.max(0, r.top - pad), x2 = r.right + pad, y2 = r.bottom + pad;
      const clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`;
      scrim.style.clipPath = clip; scrim.style.webkitClipPath = clip;
    }
    function schedulePopupScrim() { syncPopupScrim(); }
    window.addEventListener('resize', schedulePopupScrim);
    if (typeof MutationObserver === 'function') {
      new MutationObserver(schedulePopupScrim).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    syncPopupScrim();
