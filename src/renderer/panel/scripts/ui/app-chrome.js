function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function closeAbSettingsPopup() {
      const popup = document.getElementById('ab-settings-popup');
      const backdrop = document.getElementById('ab-settings-backdrop');
      if (popup) popup.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    }

// ---- App Page Navigation ----
    let currentAppPage = 'projection';

function _isProjectionLivePair(a, b) {
      return false;
    }

function _resetKeepMountedPageStyle(el) {
      if (!el) return;
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
      el.style.visibility = '';
      el.style.pointerEvents = '';
      el.style.zIndex = '';
      el.style.display = '';
      delete el.dataset.keepMountedHidden;
    }

function _keepPageMountedHidden(el) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.display = 'flex';
      el.style.position = 'fixed';
      el.style.left = `${Math.round(rect.left)}px`;
      el.style.top = `${Math.round(rect.top)}px`;
      el.style.width = `${Math.max(1, Math.round(rect.width))}px`;
      el.style.height = `${Math.max(1, Math.round(rect.height))}px`;
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '0';
      el.dataset.keepMountedHidden = '1';
    }

function renderFooterBibleVersionPopover() {
      const pop = document.getElementById('footer-bible-version-popover');
      if (!pop) return;
      pop.innerHTML = '';
      const verKeys = Object.keys(bibles || {});
      if (!verKeys.length) {
        const empty = document.createElement('div');
        empty.className = 'footer-bv-empty';
        empty.textContent = 'No Bible versions loaded';
        pop.appendChild(empty);
        return;
      }
      const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const rotation = typeof isOneVersionActive === 'function' && isOneVersionActive();
      // The versions on screen, main one first, then the rest of the installed ones
      let onScreen = [];
      try { onScreen = getOnScreenVersionIds().filter((v) => verKeys.includes(v)); } catch (e) { onScreen = []; }
      if (!onScreen.length && activeBibleVersion && verKeys.includes(activeBibleVersion)) onScreen = [activeBibleVersion];
      const others = verKeys.filter((v) => !onScreen.includes(v));

      const root = el('div', 'vp');
      const head = el('div', 'vp-head');
      head.append(el('strong', '', 'Bible versions'), el('span', 'vp-count', verKeys.length + ' installed'));
      root.appendChild(head);

      const search = el('label', 'vp-search');
      search.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
      const searchInput = document.createElement('input');
      searchInput.type = 'text'; searchInput.placeholder = 'Search versions'; searchInput.autocomplete = 'off';
      searchInput.setAttribute('aria-label', 'Search Bible versions');
      search.appendChild(searchInput);
      root.appendChild(search);

      const scroll = el('div', 'vp-scroll');
      const rows = [];
      const groups = [];
      const makeRow = (ver, position) => {
        const isMain = activeBibleVersion === ver;
        const row = el('div', 'vp-row' + (isMain ? ' is-main' : '') + (position >= 0 ? ' is-on' : ''));
        row.dataset.searchLabel = normalizeSearchText(ver + ' ' + (typeof getVersionCode === 'function' ? getVersionCode(ver) : ''));
        const pick = el('button', 'vp-pick');
        pick.type = 'button';
        pick.title = isMain ? 'Showing now' : 'Make this the main version';
        const code = el('span', 'vp-code', (typeof getVersionCode === 'function' ? getVersionCode(ver) : ver).slice(0, 7));
        const text = el('span', 'vp-text');
        text.append(el('span', 'vp-name', ver));
        pick.append(code, text);
        if (position >= 0) {
          const role = isMain ? (rotation ? 'Showing now' : 'Main') : (rotation ? 'In rotation' : (position === 1 ? 'Second' : 'Third'));
          pick.appendChild(el('span', 'vp-role' + (isMain ? ' is-main' : ''), role));
        }
        pick.onclick = () => { changeActiveBibleVersion(ver); toggleFooterBibleVersionPopover(false); };
        const del = el('button', 'vp-del');
        del.type = 'button';
        del.title = 'Remove from this computer';
        del.setAttribute('aria-label', 'Remove ' + ver + ' from this computer');
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>';
        del.onclick = (e) => {
          e.stopPropagation();
          showConfirm(
            'Remove this Bible?',
            '"' + ver + '" is taken off this computer. You can import it again later.',
            () => {
              delete bibles[ver];
              clearBibleSearchCache(ver);
              if (activeBibleVersion === ver) {
                const remaining = Object.keys(bibles).filter(name => name !== ver);
                activeBibleVersion = remaining.length ? remaining[0] : null;
              }
              idbDelete(STORE_BIBLES, ver).catch(() => {});
              saveState();
              saveToStorageDebounced();
              renderVersionBar();
              renderSongs();
              updateBibleLists();
              if (isLive) scheduleLiveUpdate();
              renderFooterBibleVersionPopover();
            }
          );
        };
        row.append(pick, del);
        rows.push(row);
        return row;
      };
      const addGroup = (title, versions, startPosition) => {
        if (!versions.length) return;
        const label = el('div', 'vp-group', title);
        scroll.appendChild(label);
        const members = [label];
        versions.forEach((v, i) => { const r = makeRow(v, startPosition < 0 ? -1 : i); scroll.appendChild(r); members.push(r); });
        groups.push(members);
      };
      addGroup(rotation ? 'In rotation' : 'On screen', onScreen, 0);
      addGroup(onScreen.length ? 'Other versions' : 'Versions', others, -1);
      const none = el('div', 'vp-none', 'No version matches');
      none.hidden = true;
      scroll.appendChild(none);
      root.appendChild(scroll);
      root.appendChild(el('div', 'vp-foot', 'Click a version to make it the main one. Add more to the screen under Versions on screen.'));

      const visibleRows = () => rows.filter((r) => r.style.display !== 'none');
      searchInput.addEventListener('input', () => {
        const q = normalizeSearchText(searchInput.value || '').trim();
        rows.forEach((row) => { row.style.display = !q || (row.dataset.searchLabel || '').includes(q) ? '' : 'none'; });
        groups.forEach((members) => { const label = members[0]; label.style.display = members.slice(1).some((r) => r.style.display !== 'none') ? '' : 'none'; });
        none.hidden = visibleRows().length > 0;
      });
      // Keys: Down from the search goes to the list, Up and Down move through it, Enter picks, and Enter in the search picks the first match
      root.addEventListener('keydown', (e) => {
        const items = visibleRows().map((r) => r.querySelector('.vp-pick'));
        const at = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[at + 1] || items[0])?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (at <= 0) searchInput.focus(); else items[at - 1].focus(); }
        else if (e.key === 'Enter' && document.activeElement === searchInput && items[0]) { e.preventDefault(); items[0].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); toggleFooterBibleVersionPopover(false); document.getElementById('footer-bible-version-btn')?.focus(); }
      });
      pop.appendChild(root);
      requestAnimationFrame(() => { try { searchInput.focus(); } catch (_) {} });
    }

function positionFooterBibleVersionPopover() {
      const btn = document.getElementById('footer-bible-version-btn');
      const pop = document.getElementById('footer-bible-version-popover');
      if (!btn || !pop || !footerBibleVersionPopoverOpen) return;
      const btnRect = btn.getBoundingClientRect();
      pop.style.left = '10px';
      pop.style.top = '10px';
      const popRect = pop.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(btnRect.left, window.innerWidth - popRect.width - margin));
      const top = Math.max(margin, btnRect.top - popRect.height - 6);
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
    }

function positionAutoLyricsModal() {
      const modal = document.getElementById('autoLyricsModal');
      if (!modal || modal.style.display !== 'flex') return;
      const content = modal.querySelector('.modal-content');
      if (!content) return;
      // Centred in the window, whatever opened it
      const margin = 10;
      content.style.left = `${margin}px`;
      content.style.top = `${margin}px`;
      const rect = content.getBoundingClientRect();
      content.style.left = `${Math.max(margin, Math.round((window.innerWidth - rect.width) / 2))}px`;
      content.style.top = `${Math.max(margin, Math.round((window.innerHeight - rect.height) / 2))}px`;
    }

function toggleFooterBibleVersionPopover(forceOpen) {
      const pop = document.getElementById('footer-bible-version-popover');
      if (!pop) return;
      const nextOpen = (typeof forceOpen === 'boolean') ? forceOpen : !footerBibleVersionPopoverOpen;
      footerBibleVersionPopoverOpen = nextOpen;
      pop.classList.toggle('open', nextOpen);
      pop.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
      if (!nextOpen) return;
      renderFooterBibleVersionPopover();
      requestAnimationFrame(positionFooterBibleVersionPopover);
    }

function setupFooterBibleVersionPopover() {
      const btn = document.getElementById('footer-bible-version-btn');
      const pop = document.getElementById('footer-bible-version-popover');
      if (!btn || !pop || btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      if (!btn.hasAttribute('onclick')) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFooterBibleVersionPopover();
        });
      }
      document.addEventListener('click', (e) => {
        if (!footerBibleVersionPopoverOpen) return;
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest('#footer-bible-version-popover') || t.closest('#footer-bible-version-btn')) return;
        toggleFooterBibleVersionPopover(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && footerBibleVersionPopoverOpen) {
          toggleFooterBibleVersionPopover(false);
        }
      });
      window.addEventListener('resize', () => {
        if (footerBibleVersionPopoverOpen) positionFooterBibleVersionPopover();
      });
      window.addEventListener('scroll', () => {
        if (footerBibleVersionPopoverOpen) positionFooterBibleVersionPopover();
      }, true);
    }

