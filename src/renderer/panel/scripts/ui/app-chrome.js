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
      const list = document.createElement('div');
      list.className = 'footer-bv-list';
      const searchWrap = document.createElement('div');
      searchWrap.className = 'footer-bv-search';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = t('ui_search_generic');
      searchInput.autocomplete = 'off';
      searchInput.setAttribute('aria-label', t('ui_search_generic'));
      searchWrap.appendChild(searchInput);
      list.appendChild(searchWrap);
      const itemRows = [];
      verKeys.forEach((ver) => {
        const isPrimaryActive = activeBibleVersion === ver;
        const isSecondaryActive = !!(dualVersionModeEnabled && dualVersionSecondaryId === ver);
        const markerClass = (isPrimaryActive || isSecondaryActive) ? ' marked' : '';
        const wrapper = document.createElement('div');
        wrapper.className = `footer-bv-item ${isPrimaryActive ? 'active' : ''}${markerClass}`;
        wrapper.dataset.searchLabel = normalizeSearchText(ver);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-bv-btn';
        const flags = [];
        if (isPrimaryActive && dualVersionModeEnabled && dualVersionSecondaryId) {
          flags.push('<span class="footer-bv-flag primary" title="Primary">1</span>');
        } else if (isPrimaryActive) {
          flags.push('<span class="footer-bv-flag primary" title="Active">✓</span>');
        }
        if (isSecondaryActive) {
          flags.push('<span class="footer-bv-flag secondary" title="Secondary">2</span>');
        }
        btn.innerHTML = `
          <svg class="footer-bv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span class="footer-bv-name">${esc(ver)}</span>
          <span class="footer-bv-flags">${flags.join('')}</span>
        `;
        btn.onclick = () => {
          changeActiveBibleVersion(ver);
          toggleFooterBibleVersionPopover(false);
        };
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'footer-bv-del';
        del.title = `Delete ${ver}`;
        del.setAttribute('aria-label', `Delete ${ver}`);
        del.textContent = '×';
        del.onclick = (e) => {
          e.stopPropagation();
          showConfirm(
            'Delete Bible Version',
            `Remove "${ver}" from imported Bible versions?`,
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
        wrapper.appendChild(btn);
        wrapper.appendChild(del);
        itemRows.push(wrapper);
        list.appendChild(wrapper);
      });
      searchInput.addEventListener('input', () => {
        const q = normalizeSearchText(searchInput.value || '').trim();
        itemRows.forEach(row => {
          const label = row.dataset.searchLabel || '';
          row.style.display = !q || label.includes(q) ? '' : 'none';
        });
      });
      pop.appendChild(list);
      requestAnimationFrame(() => {
        try { searchInput.focus(); } catch (_) {}
      });
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
      const mainAnchorBtn = document.getElementById('main-get-lyrics-btn');
      const footerAnchorBtn = document.getElementById('footer-auto-lyrics-btn');
      const anchorBtn = (mainAnchorBtn && mainAnchorBtn.style.display !== 'none')
        ? mainAnchorBtn
        : footerAnchorBtn;
      const margin = 10;
      const anchorGap = 16;
      content.style.left = `${margin}px`;
      content.style.top = `${margin}px`;
      const contentRect = content.getBoundingClientRect();
      const anchorRect = anchorBtn
        ? anchorBtn.getBoundingClientRect()
        : { left: window.innerWidth * 0.5, width: 0, top: window.innerHeight - margin, bottom: window.innerHeight - margin };
      let left = anchorRect.left + ((anchorRect.width || 0) - contentRect.width) / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - contentRect.width - margin));
      let top = anchorRect.top - contentRect.height - anchorGap;
      if (top < margin) top = anchorRect.bottom + anchorGap;
      if (top + contentRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - contentRect.height - margin);
      }
      content.style.left = `${Math.round(left)}px`;
      content.style.top = `${Math.round(top)}px`;
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

