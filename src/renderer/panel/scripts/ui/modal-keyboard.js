    // ── Keyboard for pop-ups ────────────────────────────────────────────────────
    // Every pop-up (confirmations such as the service lock, settings, new song …) can be used from the keyboard:
    // Enter presses the main button, Esc closes, the arrow keys and Tab move between the buttons and fields, and the
    // keys no longer reach the shortcuts behind the pop-up (an arrow key used to move the slides underneath).
    function getOpenModal() {
      const open = Array.from(document.querySelectorAll('.modal-overlay')).filter((m) => m.style.display === 'flex' || (m.style.display !== 'none' && m.classList.contains('active')));
      return open.length ? open[open.length - 1] : null;
    }
    function modalFocusables(modal) {
      return Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.disabled && el.offsetParent !== null && el.type !== 'hidden');
    }
    function modalPrimary(modal) {
      return modal.querySelector('[data-modal-primary]') || (modal.id === 'confirmModal' ? modal.querySelector('#confirm-btn') : null) ||
        modal.querySelector('.confirm-actions button:last-child');
    }
    // The pop-up opens with the focus on what Enter should do (its main button, or its text box)
    function focusModalStart(modal) {
      if (!modal || modal.contains(document.activeElement)) return;
      const input = modal.id === 'confirmModal' ? modal.querySelector('#confirm-input') : null;
      const target = (input && input.offsetParent !== null) ? input : (modalPrimary(modal) || modalFocusables(modal)[0]);
      if (target) { try { target.focus(); } catch (e) { /* not focusable */ } }
    }
    (function wrapOpenModal() {
      const original = window.openModal;
      if (typeof original !== 'function' || original.__kb) return;
      const wrapped = function (id, ...rest) {
        const result = original.call(this, id, ...rest);
        setTimeout(() => focusModalStart(document.getElementById(id)), 60);
        return result;
      };
      wrapped.__kb = true;
      window.openModal = wrapped;
    })();

    document.addEventListener('keydown', (e) => {
      const modal = getOpenModal();
      if (!modal || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const inModal = modal.contains(t);
      const typing = !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
      const textarea = !!(t && t.tagName === 'TEXTAREA');

      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        closeModal(modal.id);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (textarea) { e.stopPropagation(); return; }
        // A focused button, link or menu does its own thing; anywhere else Enter presses the main button
        if (inModal && t && /^(BUTTON|A)$/.test(t.tagName)) { e.preventDefault(); e.stopPropagation(); t.click(); return; }
        if (inModal && t && t.tagName === 'SELECT') { e.stopPropagation(); return; }
        const primary = modalPrimary(modal);
        if (primary && !primary.disabled) { e.preventDefault(); e.stopPropagation(); primary.click(); return; }
        e.stopPropagation();
        return;
      }
      if (e.key === 'Tab') {
        const items = modalFocusables(modal);
        if (!items.length) return;
        e.stopPropagation();
        const at = items.indexOf(t);
        if (!inModal || at < 0 || (!e.shiftKey && at === items.length - 1) || (e.shiftKey && at === 0)) {
          e.preventDefault();
          items[e.shiftKey ? items.length - 1 : 0].focus();
        }
        return;
      }
      if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
        // Arrow keys move between buttons; inside a text box or a menu they keep their own job
        if (typing) { e.stopPropagation(); return; }
        const items = modalFocusables(modal);
        if (!items.length) { e.stopPropagation(); return; }
        e.preventDefault(); e.stopPropagation();
        const step = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
        const at = items.indexOf(t);
        items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length].focus();
        return;
      }
      // Other keys (Space, letters …) must not run the shortcuts behind the pop-up
      if (!typing) e.stopPropagation();
    }, true);
