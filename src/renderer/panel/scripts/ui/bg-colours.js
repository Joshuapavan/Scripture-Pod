    // ── Background colours: ready-made themes and the colour of the movement ──────────────
    // The gradient has an edge colour (bg-color-shadow) and a glow colour (bg-color-highlight); those two inputs
    // in the top bar stay the source of truth. The labelled pickers here, and the theme buttons, set them.
    const BG_COLOUR_THEMES = [
      { name: 'Crimson', edge: '#3a0a0a', glow: '#c0392b' },
      { name: 'Royal blue', edge: '#0a1440', glow: '#3a6fd8' },
      { name: 'Forest', edge: '#06261a', glow: '#2e9e6a' },
      { name: 'Sunset', edge: '#3a0f33', glow: '#f0803c' },
      { name: 'Violet', edge: '#1a0a3a', glow: '#8e5bd6' },
      { name: 'Gold', edge: '#2a1c05', glow: '#d9a53a' },
      { name: 'Teal', edge: '#052a30', glow: '#2bb5c0' },
      { name: 'Rose', edge: '#3a0f22', glow: '#e0608a' },
      { name: 'Slate', edge: '#0d1117', glow: '#4a5568' },
      { name: 'Midnight', edge: '#000000', glow: '#16213e' }
    ];

    function bgColourEl(which) { return document.getElementById(which === 'shadow' ? 'bg-color-shadow' : 'bg-color-highlight'); }

    // Copies the two gradient colours into the labelled pickers
    function syncBgColourPickers() {
      const edge = bgColourEl('shadow')?.value, glow = bgColourEl('highlight')?.value;
      const e = document.getElementById('bg-edge-pick'), g = document.getElementById('bg-glow-pick');
      if (e && edge && e.value !== edge) e.value = edge;
      if (g && glow && g.value !== glow) g.value = glow;
      const sw = document.querySelectorAll('#bg-presets .bg-preset');
      sw.forEach((b, i) => b.classList.toggle('is-current', !!edge && !!glow && BG_COLOUR_THEMES[i].edge.toLowerCase() === edge.toLowerCase() && BG_COLOUR_THEMES[i].glow.toLowerCase() === glow.toLowerCase()));
    }

    function setBgGradientColours(edge, glow) {
      const a = bgColourEl('shadow'), b = bgColourEl('highlight');
      if (a) a.value = edge;
      if (b) b.value = glow;
      // A theme is for a gradient: switch to it if the background is solid
      if (typeof setBgModeFromPicker === 'function' && document.getElementById('bg-mode-solid')?.classList.contains('active')) setBgModeFromPicker('gradient');
      else if (typeof onAnyControlChange === 'function') onAnyControlChange();
      syncBgColourPickers();
    }

    function applyBgColourTheme(i) {
      const t = BG_COLOUR_THEMES[i];
      if (t) setBgGradientColours(t.edge, t.glow);
    }

    function onBgColourPick(which, value) {
      const el = bgColourEl(which);
      if (!el) return;
      el.value = value;
      if (typeof onAnyControlChange === 'function') onAnyControlChange();
      syncBgColourPickers();
    }

    // The movement's own colour: off ("auto") means it follows the glow colour
    function onBgMotionColour() {
      const auto = document.getElementById('bg-motion-color-auto')?.checked !== false;
      const pick = document.getElementById('bg-motion-color');
      if (pick) pick.disabled = auto;
      if (typeof onAnyControlChange === 'function') onAnyControlChange();
    }

    // Used when a saved setting is loaded: '' is auto, a hex colour is the chosen one
    function setBgMotionColourInputs(value) {
      const auto = !/^#[0-9a-f]{6}$/i.test(value || '');
      const box = document.getElementById('bg-motion-color-auto'), pick = document.getElementById('bg-motion-color');
      if (box) box.checked = auto;
      if (pick) { pick.disabled = auto; if (!auto) pick.value = value; }
    }

    (function buildBgColourThemes() {
      const host = document.getElementById('bg-presets');
      if (!host) return;
      BG_COLOUR_THEMES.forEach((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bg-preset';
        b.title = t.name;
        b.setAttribute('aria-label', t.name);
        b.style.background = `radial-gradient(circle at 35% 30%, ${t.glow} 0, ${t.edge} 100%)`;
        b.onclick = () => applyBgColourTheme(i);
        host.appendChild(b);
      });
      // Keep the labelled pickers in step when the originals change or a profile is loaded
      document.addEventListener('input', (e) => { if (e.target && (e.target.id === 'bg-color-shadow' || e.target.id === 'bg-color-highlight')) syncBgColourPickers(); }, true);
      document.addEventListener('change', (e) => { if (e.target && (e.target.id === 'bg-color-shadow' || e.target.id === 'bg-color-highlight')) syncBgColourPickers(); }, true);
      window.addEventListener('load', () => { syncBgColourPickers(); setInterval(syncBgColourPickers, 1500); });
    })();
