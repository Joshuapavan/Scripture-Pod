    // ── Name and role: extra options ──────────────────────────────────────────────────
    // Text colours, font, weight, case, corners, the height on the screen, a third line, and hiding by itself.
    // They are kept as one block of settings (nameRoleOverlayExtras) that travels with the lower third to every display.
    const NAME_ROLE_EXTRA_DEFAULTS = { nameColor: '', roleColor: '', font: '', weight: '', textCase: '', corners: '', position: 'bottom', extra: '', autoHide: 0 };
    const nameRoleExtraEl = (id) => document.getElementById('name-role-overlay-x-' + id);
    // A colour picker always holds a colour, so "Auto" is remembered on the picker itself
    function collectNameRoleExtras() {
      const val = (id) => { const el = nameRoleExtraEl(id); return el ? String(el.value || '') : ''; };
      const colour = (which) => { const el = nameRoleExtraEl(which + '-color'); return el && el.dataset.set === '1' && /^#[0-9a-f]{6}$/i.test(el.value) ? el.value : ''; };
      return {
        nameColor: colour('name'), roleColor: colour('role'),
        font: val('font'), weight: val('weight'), textCase: val('case'), corners: val('corners'),
        position: ['bottom', 'middle', 'top'].includes(val('position')) ? val('position') : 'bottom',
        extra: val('extra').trim().slice(0, 80),
        autoHide: Math.max(0, Math.min(60, Number(val('autohide')) || 0))
      };
    }
    function applyNameRoleExtras(x) {
      x = { ...NAME_ROLE_EXTRA_DEFAULTS, ...(x || {}) };
      const put = (id, v) => { const el = nameRoleExtraEl(id); if (el) el.value = String(v == null ? '' : v); };
      ['name', 'role'].forEach((which) => {
        const el = nameRoleExtraEl(which + '-color'); if (!el) return;
        const c = x[which + 'Color'];
        if (/^#[0-9a-f]{6}$/i.test(c || '')) { el.value = c; el.dataset.set = '1'; } else { el.value = '#ffffff'; el.dataset.set = '0'; }
      });
      put('font', x.font); put('weight', x.weight); put('case', x.textCase); put('corners', x.corners);
      put('position', x.position); put('extra', x.extra); put('autohide', x.autoHide);
    }
    function onNameRoleExtraColor(which) {
      const el = nameRoleExtraEl(which + '-color'); if (el) el.dataset.set = '1';
      handleNameRoleOverlayChange();
    }
    function resetNameRoleTextColours() {
      ['name', 'role'].forEach((which) => { const el = nameRoleExtraEl(which + '-color'); if (el) { el.value = '#ffffff'; el.dataset.set = '0'; } });
      handleNameRoleOverlayChange();
    }

    // Hiding by itself must not stop to ask while the service lock is on: nobody is there to answer
    function runWithoutServiceLock(fn) {
      if (typeof allowServiceLockPass === 'function') allowServiceLockPass(2000);
      try { fn(); } catch (e) { console.error(e); }
    }

    // Step through the saved names in the order they are listed: the next or the previous speaker.
    // Showing one this way leaves the list in the same order, so the next press goes where you expect.
    let steppedSavedKey = '';
    function stepSavedName(step) {
      const list = typeof readSavedNames === 'function' ? readSavedNames() : [];
      if (!list.length) { if (typeof showToast === 'function') showToast('No saved names yet'); return; }
      const nameInput = document.getElementById('name-role-overlay-name');
      const roleInput = document.getElementById('name-role-overlay-role');
      const now = String(nameInput && nameInput.value || '').trim();
      let at = list.findIndex((p) => p.name === now && (p.role || '') === String(roleInput && roleInput.value || '').trim());
      at = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
      const person = list[at];
      if (nameInput) nameInput.value = person.name;
      if (roleInput) roleInput.value = person.role || '';
      const button = document.getElementById('name-role-overlay-show-btn');
      const live = button && button.getAttribute('aria-pressed') === 'true';
      steppedSavedKey = person.name + '|' + (person.role || '');
      // On air already: the lower third changes to the new person. Otherwise it is only filled in.
      handleNameRoleOverlayChange();
      if (!live && typeof showToast === 'function') showToast(`${person.name}${person.role ? ', ' + person.role : ''}. Press L to show.`);
    }
