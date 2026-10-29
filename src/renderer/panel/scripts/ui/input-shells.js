    // ── Inputs inside a box of their own ────────────────────────────────────────────
    // Every input draws its own border, so a field that sits inside a bordered wrapper (a search box with an icon,
    // a field with a button beside it) showed two boxes, one inside the other. An input that fills a small bordered
    // wrapper is marked here, and its own border goes: the wrapper is the field. Nothing needs to be listed per field.
    const INPUT_KINDS = /^(text|search|number|url|email|password|tel)$/;
    function markInputShells(root) {
      (root || document).querySelectorAll('input:not(.in-shell)').forEach((input) => {
        if (!INPUT_KINDS.test(input.type || 'text')) return;
        // The wrapper can be the parent, or a level or two up (a stepper keeps its input in an inner span)
        let box = input.parentElement, found = false;
        for (let depth = 0; box && box !== document.body && depth < 3 && !found; depth++, box = box.parentElement) {
          const cs = getComputedStyle(box);
          const bordered = ['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none');
          const r = box.getBoundingClientRect();
          // Only a field-sized wrapper around this one input: not a card or a panel that happens to hold an input
          if (r.height > 64 && depth === 0) break;
          if (!bordered || !r.height || r.height > 64) continue;
          if (box.querySelectorAll('input:not([type="hidden"]), select, textarea').length !== 1) break;
          if (input.getBoundingClientRect().width < r.width * 0.2) continue;
          found = true;
        }
        if (!found) return;
        input.classList.add('in-shell');
      });
    }
    let inputShellTimer = 0;
    function scheduleInputShells() { clearTimeout(inputShellTimer); inputShellTimer = setTimeout(() => markInputShells(), 120); }
    document.addEventListener('focusin', (e) => { if (e.target && e.target.tagName === 'INPUT') markInputShells(e.target.parentElement && e.target.parentElement.parentElement); });
    if (typeof MutationObserver === 'function') new MutationObserver(scheduleInputShells).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', scheduleInputShells);
    scheduleInputShells();
    // Fields in a panel that was hidden cannot be measured until it shows, so look again now and then
    setInterval(() => { if (document.visibilityState === 'visible') markInputShells(); }, 2000);
