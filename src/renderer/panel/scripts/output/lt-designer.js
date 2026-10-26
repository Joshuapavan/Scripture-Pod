    // ── Lower-third designer: make your own Name & Role design ───────────────────────
    // A design is a small set of choices (colours, shape, font …) saved on this computer. It appears under
    // "My designs" in the design picker, and is drawn by the same lower-third styles as the built-in ones.
    const MY_LT_DESIGNS_LABEL = 'My designs';
    const CUSTOM_LT_KEY = 'scripturePod.customLtDesigns.v1';
    const CUSTOM_LT_ACTIVE_KEY = 'scripturePod.customLtActive.v1';

    function loadCustomLtDesigns() {
      try { const v = JSON.parse(localStorage.getItem(CUSTOM_LT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function saveCustomLtDesigns(list) {
      try { localStorage.setItem(CUSTOM_LT_KEY, JSON.stringify(list.slice(0, 100))); } catch (e) { showToast('Could not save the design'); }
    }
    function getActiveCustomLtDesignId() {
      try { return localStorage.getItem(CUSTOM_LT_ACTIVE_KEY) || ''; } catch (e) { return ''; }
    }
    function getActiveCustomLtDesign() {
      const list = loadCustomLtDesigns();
      return list.find((d) => d.id === getActiveCustomLtDesignId()) || list[0] || null;
    }
    function customLtDesignOptions() {
      return loadCustomLtDesigns().map((d) => ({ value: 'custom:' + d.id, label: d.name || 'My design' }));
    }

    function buildCreateLtDesignTile() {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'lt-design-tile lt-design-create';
      tile.innerHTML = '<span class="lt-design-create-plus">+</span><span class="lt-design-label">Create your own</span>';
      tile.onclick = () => openLtDesigner(null);
      return tile;
    }

    // Use a saved design: the Left/Right/Centered/Band layout stays as it was
    function pickCustomLtDesign(id) {
      try { localStorage.setItem(CUSTOM_LT_ACTIVE_KEY, id); } catch (e) { /* storage unavailable */ }
      const select = document.getElementById('name-role-overlay-design');
      if (!select) return;
      const layout = String(select.value || 'classic-gms').split('-')[0];
      select.value = `${layout}-custom`;
      handleNameRoleOverlayChange();
      previewNameRoleLowerThirdExample();
    }

    // ── The designer window ──
    const LT_DESIGNER_FIELDS = [
      { group: 'Name layer', fields: [
        { key: 'nameBg', label: 'Background', type: 'color' }, { key: 'nameFg', label: 'Text', type: 'color' },
        { key: 'nameBgOpacity', label: 'Background opacity', type: 'range', min: 0, max: 100, unit: '%' } ] },
      { group: 'Role layer', fields: [
        { key: 'roleBg', label: 'Background', type: 'color' }, { key: 'roleFg', label: 'Text', type: 'color' },
        { key: 'roleBgOpacity', label: 'Background opacity', type: 'range', min: 0, max: 100, unit: '%' },
        { key: 'roleIndent', label: 'Indent', type: 'range', min: 0, max: 200, unit: 'px' } ] },
      { group: 'Shape', fields: [
        { key: 'radius', label: 'Rounded corners', type: 'range', min: 0, max: 40, unit: 'px' },
        { key: 'skew', label: 'Slant', type: 'range', min: -20, max: 20, unit: '°' },
        { key: 'padding', label: 'Inner space', type: 'range', min: 0, max: 150, unit: '%' },
        { key: 'gap', label: 'Gap between layers', type: 'range', min: 0, max: 40, unit: 'px' },
        { key: 'shadow', label: 'Shadow', type: 'check' } ] },
      { group: 'Edges', fields: [
        { key: 'accentWidth', label: 'Accent bar on the left', type: 'range', min: 0, max: 24, unit: 'px' },
        { key: 'accentColor', label: 'Accent colour', type: 'color' },
        { key: 'borderWidth', label: 'Border', type: 'range', min: 0, max: 10, unit: 'px' },
        { key: 'borderColor', label: 'Border colour', type: 'color' } ] },
      { group: 'Text', fields: [
        { key: 'font', label: 'Font', type: 'select', options: ['Montserrat', 'Geist', 'Source Serif 4', 'Georgia', 'Arial', 'Impact'] },
        { key: 'weight', label: 'Weight', type: 'select', options: ['400', '500', '600', '700', '800', '900'] },
        { key: 'caseStyle', label: 'Capitals', type: 'select', options: ['upper', 'lower', 'title', 'none'], labels: { upper: 'ALL CAPITALS', lower: 'all lowercase', title: 'Each Word', none: 'As typed' } },
        { key: 'letterSpacing', label: 'Letter spacing', type: 'range', min: -2, max: 12, unit: '' } ] }
    ];
    let ltDesignerDraft = null;
    let ltDesignerEditingId = null;

    function ensureLtDesignerModal() {
      let modal = document.getElementById('ltDesignerModal');
      if (modal) return modal;
      modal = document.createElement('div');
      modal.id = 'ltDesignerModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `<div class="modal-content lt-designer" role="dialog" aria-modal="true" aria-labelledby="lt-designer-title">
        <div class="lt-designer-head"><h3 id="lt-designer-title">Create your own lower third</h3>
          <input type="text" id="lt-designer-name" maxlength="40" placeholder="Name this design" aria-label="Design name"></div>
        <div class="lt-designer-body"><div class="lt-designer-controls" id="lt-designer-controls"></div>
          <div class="lt-designer-preview"><div class="lt-designer-stage" id="lt-designer-stage"><iframe id="lt-designer-frame" title="Preview" tabindex="-1"></iframe></div>
            <p class="output-route-hint">Preview. Your name and role from the Text fields are used here. Name and role are separate layers, so each can have its own colours.</p></div></div>
        <div class="lt-designer-foot"><button type="button" class="btn" id="lt-designer-delete">Delete</button><span style="flex:1"></span>
          <button type="button" class="btn" id="lt-designer-cancel">Cancel</button><button type="button" class="btn lt-designer-save" id="lt-designer-save">Save design</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('#lt-designer-cancel').onclick = () => closeModal('ltDesignerModal');
      modal.querySelector('#lt-designer-save').onclick = saveLtDesignerDraft;
      modal.querySelector('#lt-designer-delete').onclick = deleteLtDesignerDesign;
      modal.querySelector('#lt-designer-name').oninput = (e) => { ltDesignerDraft.name = e.target.value; };
      const frame = modal.querySelector('#lt-designer-frame');
      frame.srcdoc = buildLtThumbDoc();
      frame.addEventListener('load', () => paintLtDesignerPreview());
      const fit = () => { const stage = modal.querySelector('#lt-designer-stage'); if (stage && stage.clientWidth) frame.style.transform = `scale(${stage.clientWidth / 1920})`; };
      if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(modal.querySelector('#lt-designer-stage'));
      modal._fit = fit;
      return modal;
    }

    function paintLtDesignerPreview() {
      const frame = document.getElementById('lt-designer-frame');
      const doc = frame && frame.contentDocument;
      const overlay = doc && doc.getElementById('name-role-overlay');
      if (!overlay || !ltDesignerDraft) return;
      const sample = readLtThumbSample();
      overlay.className = 'is-visible style-classic theme-custom motion-rise';
      overlay.style.setProperty('--name-role-name-size', '56px');
      overlay.style.setProperty('--name-role-role-size', '30px');
      overlay.querySelector('.name-role-overlay-name').textContent = sample.name;
      overlay.querySelector('.name-role-overlay-role').textContent = sample.role;
      window.SP_LT_EXTRA.applyCustom(overlay, ltDesignerDraft, true);
    }

    function renderLtDesignerControls() {
      const host = document.getElementById('lt-designer-controls');
      if (!host) return;
      host.replaceChildren();
      LT_DESIGNER_FIELDS.forEach((group) => {
        const section = document.createElement('section');
        const h = document.createElement('h4'); h.textContent = group.group; section.appendChild(h);
        group.fields.forEach((f) => {
          const row = document.createElement('label'); row.className = 'lt-designer-row';
          const text = document.createElement('span'); text.textContent = f.label; row.appendChild(text);
          let input;
          if (f.type === 'select') {
            input = document.createElement('select');
            f.options.forEach((o) => { const opt = document.createElement('option'); opt.value = o; opt.textContent = (f.labels && f.labels[o]) || o; input.appendChild(opt); });
            input.value = String(ltDesignerDraft[f.key]);
          } else if (f.type === 'check') {
            input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!ltDesignerDraft[f.key];
          } else {
            input = document.createElement('input'); input.type = f.type;
            if (f.type === 'range') { input.min = f.min; input.max = f.max; input.step = 1; }
            input.value = ltDesignerDraft[f.key];
          }
          let readout = null;
          if (f.type === 'range') { readout = document.createElement('output'); readout.textContent = ltDesignerDraft[f.key] + (f.unit || ''); }
          const apply = () => {
            ltDesignerDraft[f.key] = f.type === 'check' ? input.checked : (f.type === 'range' ? Number(input.value) : input.value);
            if (readout) readout.textContent = input.value + (f.unit || '');
            paintLtDesignerPreview();
          };
          input.addEventListener('input', apply); input.addEventListener('change', apply);
          row.appendChild(input); if (readout) row.appendChild(readout);
          section.appendChild(row);
        });
        host.appendChild(section);
      });
    }

    function openLtDesigner(id) {
      const modal = ensureLtDesignerModal();
      const existing = id ? loadCustomLtDesigns().find((d) => d.id === id) : null;
      ltDesignerEditingId = existing ? existing.id : null;
      ltDesignerDraft = window.SP_LT_EXTRA.normalizeCustom(existing || null);
      ltDesignerDraft.name = existing ? existing.name : 'My design';
      modal.querySelector('#lt-designer-name').value = ltDesignerDraft.name;
      modal.querySelector('#lt-designer-delete').style.display = existing ? '' : 'none';
      renderLtDesignerControls();
      openModal('ltDesignerModal');
      setTimeout(() => { if (modal._fit) modal._fit(); paintLtDesignerPreview(); }, 60);
    }

    function saveLtDesignerDraft() {
      const name = String(ltDesignerDraft.name || '').trim().slice(0, 40) || 'My design';
      const list = loadCustomLtDesigns();
      const design = { ...window.SP_LT_EXTRA.normalizeCustom(ltDesignerDraft), name, id: ltDesignerEditingId || createId('ltd', name) };
      const at = list.findIndex((d) => d.id === design.id);
      if (at >= 0) list[at] = design; else list.unshift(design);
      saveCustomLtDesigns(list);
      closeModal('ltDesignerModal');
      ltDesignPickerFamily = MY_LT_DESIGNS_LABEL;
      pickCustomLtDesign(design.id);
      showToast(`Saved “${name}”`);
    }

    function deleteLtDesignerDesign() {
      if (!ltDesignerEditingId) return;
      const list = loadCustomLtDesigns().filter((d) => d.id !== ltDesignerEditingId);
      saveCustomLtDesigns(list);
      if (getActiveCustomLtDesignId() === ltDesignerEditingId) { try { localStorage.removeItem(CUSTOM_LT_ACTIVE_KEY); } catch (e) { /* storage unavailable */ } }
      closeModal('ltDesignerModal');
      renderLtDesignPicker();
      handleNameRoleOverlayChange();
      showToast('Design deleted');
    }
