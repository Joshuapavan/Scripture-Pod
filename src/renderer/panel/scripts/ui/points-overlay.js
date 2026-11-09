    // ── Overlays > Points ─────────────────────────────────────────────────────────────
    // The pastor says a point and the operator shows it. The points are typed once, one per line, and kept on this
    // computer. Showing one uses the Name & Role lower third (src/shared/points.js has the text rules).
    const POINTS_KEY = 'scripturePod.points.v1';
    const pointsState = { v: 2, text: '', label: '', numbered: false, of: false, index: -1 };
    try {
      const saved = JSON.parse(localStorage.getItem(POINTS_KEY) || '{}');
      // The first version put "Point 1" under every point; that line is now off unless it is asked for
      if (saved && saved.v !== 2) { delete saved.label; delete saved.numbered; delete saved.of; }
      Object.assign(pointsState, saved);
    } catch (e) { /* storage unavailable */ }

    function savePointsState() {
      try { localStorage.setItem(POINTS_KEY, JSON.stringify(pointsState)); } catch (e) { /* storage unavailable */ }
    }
    function currentPoints() { return window.SP_POINTS.parsePoints(pointsState.text); }
    function pointRole(index, total) {
      return window.SP_POINTS.roleFor(index, total, { label: pointsState.label, numbered: pointsState.numbered, of: pointsState.of });
    }
    function pointIsOnAir() {
      return typeof activePointOverlay !== 'undefined' && !!activePointOverlay && document.getElementById('name-role-overlay-show-btn')?.getAttribute('aria-pressed') === 'true';
    }

    function renderPoints() {
      const list = currentPoints();
      const host = document.getElementById('points-list');
      if (!host) return;
      const onAir = pointIsOnAir();
      host.textContent = '';
      list.forEach((text, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'points-item';
        b.setAttribute('role', 'listitem');
        const shown = onAir && i === pointsState.index;
        b.setAttribute('aria-pressed', shown ? 'true' : 'false');
        b.classList.toggle('is-current', i === pointsState.index);
        const n = document.createElement('span'); n.className = 'points-item-n'; n.textContent = String(i + 1);
        const t = document.createElement('span'); t.className = 'points-item-text'; t.textContent = text;
        b.append(n, t);
        b.onclick = () => showPoint(i);
        host.appendChild(b);
      });
      const empty = document.getElementById('points-empty');
      if (empty) empty.hidden = list.length > 0;
      const btn = document.getElementById('points-show-btn');
      if (btn) {
        btn.setAttribute('aria-pressed', onAir ? 'true' : 'false');
        btn.textContent = onAir ? 'Hide from air' : 'Show on air';
        btn.classList.toggle('active', onAir);
      }
    }

    function loadPointsInputs() {
      const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
      set('points-input', (el) => { el.value = pointsState.text; });
      set('points-label', (el) => { el.value = pointsState.label; });
      set('points-numbered', (el) => { el.checked = !!pointsState.numbered; });
      set('points-of', (el) => { el.checked = !!pointsState.of; });
      renderPoints();
    }

    // The Preview shows the point the operator is about to show, in the chosen look (never on air from here)
    function previewPointExample() {
      const list = currentPoints();
      const i = window.SP_POINTS.clampIndex(pointsState.index >= 0 ? pointsState.index : 0, list.length);
      if (pointIsOnAir()) return;
      const sample = i >= 0 ? { text: list[i], role: pointRole(i, list.length) } : { text: 'Trust God in every season', role: pointRole(0, 3) };
      const before = activePointOverlay;
      activePointOverlay = sample;
      try { previewNameRoleLowerThirdExample(true, { quiet: true }); } finally { activePointOverlay = before; }
    }

    function onPointsEdited() {
      pointsState.text = document.getElementById('points-input')?.value || '';
      pointsState.label = document.getElementById('points-label')?.value ?? '';
      pointsState.numbered = !!document.getElementById('points-numbered')?.checked;
      pointsState.of = !!document.getElementById('points-of')?.checked;
      const list = currentPoints();
      pointsState.index = window.SP_POINTS.clampIndex(pointsState.index, list.length);
      savePointsState();
      // A point already on air follows the edit (a fixed word, or a changed label)
      if (pointIsOnAir() && pointsState.index >= 0) showPoint(pointsState.index, true);
      else { renderPoints(); if ((document.body.dataset.overlay || '') === 'points') previewPointExample(); }
    }

    function showPoint(index, quiet) {
      const list = currentPoints();
      if (!list.length) { showToast('Type your points first'); return; }
      const i = window.SP_POINTS.clampIndex(index, list.length);
      pointsState.index = i;
      savePointsState();
      showPointOnAir({ text: list[i], role: pointRole(i, list.length) });
      renderPoints();
      if (!quiet && !pointIsOnAir()) { /* the lock may be waiting for confirmation: the list updates when it shows */ }
    }

    // Next and previous go one point on; with nothing shown yet they start at the first point
    function stepPoint(delta) {
      const list = currentPoints();
      if (!list.length) { showToast('Type your points first'); return; }
      const start = pointsState.index < 0 ? (delta > 0 ? -1 : list.length) : pointsState.index;
      const next = start + delta;
      if (next < 0 || next >= list.length) { showToast(next < 0 ? 'That is the first point' : 'That was the last point'); return; }
      showPoint(next);
    }

    function togglePointOnAir() {
      if (pointIsOnAir()) { toggleNameRoleOverlay(); return; }
      const list = currentPoints();
      showPoint(pointsState.index >= 0 ? pointsState.index : 0);
    }

    // The list shows which point is on air whenever the lower third goes on or off
    (function watchPointsOnAir() {
      const btn = document.getElementById('name-role-overlay-show-btn');
      if (btn && typeof MutationObserver === 'function') new MutationObserver(renderPoints).observe(btn, { attributes: true, attributeFilter: ['aria-pressed'] });
      // The lower third's own script is loaded after this one: draw the list once everything is there
      if (document.readyState === 'complete') loadPointsInputs();
      else window.addEventListener('load', loadPointsInputs);
    })();
