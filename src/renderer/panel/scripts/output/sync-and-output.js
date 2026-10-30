    // ===== SYNC (BroadcastChannel) =====
    let connectionTimer = null;
    let syncMirrorDbPromise = null;

    function openSyncMirrorDb() {
      if (syncMirrorDbPromise) return syncMirrorDbPromise;
      syncMirrorDbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(SYNC_MIRROR_DB_NAME, SYNC_MIRROR_DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SYNC_MIRROR_STORE)) {
              db.createObjectStore(SYNC_MIRROR_STORE);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('Failed to open sync mirror DB'));
        } catch (err) {
          reject(err);
        }
      }).catch(err => {
        syncMirrorDbPromise = null;
        return Promise.reject(err);
      });
      return syncMirrorDbPromise;
    }

    function mirrorSyncMessage(msg) {
      if (!msg || (msg.type !== 'UPDATE' && msg.type !== 'CLEAR' && msg.type !== 'SYNC_STATE')) return;
      openSyncMirrorDb().then(db => new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(SYNC_MIRROR_STORE, 'readwrite');
          tx.objectStore(SYNC_MIRROR_STORE).put({
            ts: Date.now(),
            seq: Number(msg.seq || 0),
            msg
          }, SYNC_MIRROR_LAST_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('Failed to mirror sync message'));
        } catch (err) {
          reject(err);
        }
      })).catch(() => {});
    }

    function markDisplayOnline() {
      const bar = document.getElementById('status-bar');
      bar.classList.add('connected');
      isDisplayOnline = true;
      updateStatusText();
      updateProgramDisplayStatus();
      clearTimeout(connectionTimer);
      connectionTimer = setTimeout(() => {
        bar.classList.remove('connected');
        isDisplayOnline = false;
        updateStatusText();
        updateProgramDisplayStatus();
      }, 9000);
    }

    // Top bar button: red when something is on air, blue when only the Preview holds something
    function updateAirIndicator() {
      const el = document.getElementById('air-indicator');
      if (!el) return;
      const onAir = typeof getOnAirPayload === 'function' && !!getOnAirPayload();
      const cued = typeof previewMonitorState !== 'undefined' && previewMonitorState.kind === 'update';
      // Media playing on the stream is live too
      const mediaLive = typeof streamMedia !== 'undefined' && !!streamMedia.playing;
      const state = (onAir || mediaLive) ? 'live' : (cued ? 'preview' : 'idle');
      const sig = state + (mediaLive && !onAir ? ':media' : '');
      if (el.dataset.sig === sig) return;
      el.dataset.sig = sig;
      el.dataset.state = state;
      el.querySelector('.air-indicator-text').textContent = state === 'live' ? 'Live' : (state === 'preview' ? 'Preview' : 'Idle');
      el.title = state === 'live' ? (mediaLive && !onAir ? 'Media is playing on the stream' : 'Something is going out live') : (state === 'preview' ? 'Something is in Preview, not live' : 'Nothing live or in preview');
    }

    function onAirIndicatorClick() {
      const state = document.getElementById('air-indicator')?.dataset.state;
      showToast(state === 'live' ? (typeof streamMedia !== 'undefined' && streamMedia.playing && !(typeof getOnAirPayload === 'function' && getOnAirPayload()) ? 'Media is playing on the stream. M stops it.' : 'On air. Esc clears the output.') : (state === 'preview' ? 'In Preview only. Go live (Space) to send it out.' : 'Nothing is live or in Preview.'));
    }
    setInterval(updateAirIndicator, 400);

    function updateProgramDisplayStatus() {
      updateAirIndicator();
      const dot = document.getElementById('program-display-status-dot');
      const outputState = document.getElementById('program-display-output-state');
      const routeLabel = document.getElementById('program-display-route-label');
      const isPreviewOnly = document.getElementById('btn-preview')?.getAttribute('aria-pressed') === 'true';
      const lowerThirdOnly = document.getElementById('name-role-overlay-show-btn')?.getAttribute('aria-pressed') === 'true';
      if (dot) dot.classList.toggle('connected', !!isDisplayOnline);
      if (outputState) outputState.textContent = isDisplayOnline ? 'Display connected' : 'Display offline';
      if (routeLabel) routeLabel.textContent = isPreviewOnly ? 'Preview' : 'Live';
    }

    function getNameRoleOverlayStyle() {
      const design = document.getElementById('name-role-overlay-design')?.value || 'classic-gms';
      const animation = document.getElementById('name-role-overlay-animation')?.value || 'rise';
      return `${design}-${animation}`;
    }

    function setLowerThirdSettingsPanelCollapsed(panelId, collapsed, opts = {}) {
      const panel = document.getElementById(panelId);
      const body = panel?.querySelector('.name-role-overlay-body');
      const toggle = panel?.querySelector('.name-role-overlay-collapse-btn');
      if (!panel || !body || !toggle) return;
      const isCollapsed = collapsed === true;
      panel.classList.toggle('is-collapsed', isCollapsed);
      body.hidden = isCollapsed;
      toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${panelId === 'name-role-overlay-panel' ? 'Name & Role' : 'Social Engagement'} settings`);
      if (opts.persist === false) return;
      saveState();
      saveToStorageDebounced();
    }


    function getNameRoleOverlaySettings(enabled) {
      return {
        enabled: !!enabled,
        name: String(document.getElementById('name-role-overlay-name')?.value || '').trim(),
        role: String(document.getElementById('name-role-overlay-role')?.value || '').trim(),
        style: getNameRoleOverlayStyle(),
        customDesign: String(document.getElementById('name-role-overlay-design')?.value || '').endsWith('-custom') ? getActiveCustomLtDesign() : null,
        customVars: (String(document.getElementById('name-role-overlay-design')?.value || '').endsWith('-custom') && getActiveCustomLtDesign() && window.SP_LT_EXTRA) ? window.SP_LT_EXTRA.customVars(getActiveCustomLtDesign()) : null,
        primaryColor: document.getElementById('name-role-overlay-primary')?.value || '#90D5FF',
        accentColor: document.getElementById('name-role-overlay-accent')?.value || '#90D5FF',
        logo: document.getElementById('name-role-overlay-logo-preview')?.dataset.logoDataUrl || '',
        logoColor: document.getElementById('name-role-overlay-logo-color')?.value || 'white',
        nameSize: Number(document.getElementById('name-role-overlay-name-size')?.value || 56),
        roleSize: Number(document.getElementById('name-role-overlay-role-size')?.value || 24),
        logoSize: Number(document.getElementById('name-role-overlay-logo-size')?.value || 128),
        scale: Math.max(50, Math.min(200, Number(document.getElementById('name-role-overlay-scale')?.value) || 100)),
        padL: Math.max(0, Math.min(400, Number(document.getElementById('name-role-overlay-pad-l')?.value) || 0)),
        padR: Math.max(0, Math.min(400, Number(document.getElementById('name-role-overlay-pad-r')?.value) || 0)),
        offsetX: Math.max(-40, Math.min(40, Number(document.getElementById('name-role-overlay-offset-x')?.value) || 0)),
        offsetY: Math.max(-40, Math.min(40, Number(document.getElementById('name-role-overlay-offset-y')?.value) || 0)),
        extras: typeof collectNameRoleExtras === 'function' ? collectNameRoleExtras() : {}
      };
    }

    // Every control of the Social engagement overlay that is saved as one block
    const SOCIAL_TEXT_FIELDS = ['instagram', 'facebook', 'youtube', 'x', 'tiktok', 'whatsapp', 'website', 'headline'];
    const SOCIAL_ACTION_FIELDS = ['like', 'comment', 'share', 'subscribe', 'follow'];
    const SOCIAL_SELECT_FIELDS = ['layout', 'theme', 'position', 'motion', 'autohide'];
    let socialAutoHideTimer = null;

    function getSocialEngagementOverlaySettings(enabled) {
      const field = (name) => String(document.getElementById('social-engagement-' + name)?.value || '').trim();
      return {
        enabled: !!enabled,
        socials: {
          instagram: field('instagram'),
          facebook: field('facebook'),
          youtube: field('youtube'),
          x: field('x'),
          tiktok: field('tiktok'),
          whatsapp: field('whatsapp'),
          website: field('website')
        },
        headline: field('headline'),
        layout: field('layout') || 'bar',
        theme: field('theme') || 'solid',
        position: field('position') || 'bottom-center',
        motion: field('motion') || 'pulse',
        autoHideSeconds: Math.max(0, Number(field('autohide')) || 0),
        primaryColor: document.getElementById('social-engagement-primary')?.value || '#90D5FF',
        accentColor: document.getElementById('social-engagement-accent')?.value || '#90D5FF',
        size: Number(document.getElementById('social-engagement-size')?.value || 32),
        bgOpacity: (() => { const el = document.getElementById('social-engagement-bg-opacity'); return el && el.dataset.custom === '1' ? Number(el.value) : null; })(),
        offsetX: Math.max(-40, Math.min(40, Number(document.getElementById('social-engagement-offset-x')?.value) || 0)),
        offsetY: Math.max(-40, Math.min(40, Number(document.getElementById('social-engagement-offset-y')?.value) || 0)),
        actions: {
          like: document.getElementById('social-engagement-like')?.checked === true,
          comment: document.getElementById('social-engagement-comment')?.checked === true,
          share: document.getElementById('social-engagement-share')?.checked === true,
          subscribe: document.getElementById('social-engagement-subscribe')?.checked === true,
          follow: document.getElementById('social-engagement-follow')?.checked === true
        }
      };
    }

    // The saved form of the controls above, restored at startup
    function collectSocialEngagementConfig() {
      const config = { text: {}, actions: {}, select: {} };
      SOCIAL_TEXT_FIELDS.forEach(name => { config.text[name] = String(document.getElementById('social-engagement-' + name)?.value || ''); });
      SOCIAL_ACTION_FIELDS.forEach(name => { config.actions[name] = document.getElementById('social-engagement-' + name)?.checked === true; });
      SOCIAL_SELECT_FIELDS.forEach(name => { config.select[name] = String(document.getElementById('social-engagement-' + name)?.value || ''); });
      return config;
    }

    function restoreSocialEngagementConfig(config) {
      if (!config || typeof config !== 'object') return;
      SOCIAL_TEXT_FIELDS.forEach((name) => {
        const el = document.getElementById('social-engagement-' + name);
        if (el && config.text && config.text[name] != null) el.value = config.text[name];
      });
      SOCIAL_ACTION_FIELDS.forEach((name) => {
        const el = document.getElementById('social-engagement-' + name);
        if (el && config.actions && config.actions[name] != null) el.checked = !!config.actions[name];
      });
      SOCIAL_SELECT_FIELDS.forEach((name) => {
        const el = document.getElementById('social-engagement-' + name);
        if (el && config.select && config.select[name] && [...el.options].some(o => o.value === config.select[name])) el.value = config.select[name];
      });
      // The social lower third now hides itself by default; carry earlier "stays until hidden" saves over once
      try {
        const MIGRATED_KEY = 'scripturePod.socialAutoHide.v1';
        const hide = document.getElementById('social-engagement-autohide');
        if (hide && !localStorage.getItem(MIGRATED_KEY)) {
          if (hide.value === '0') hide.value = '15';
          localStorage.setItem(MIGRATED_KEY, '1');
        }
      } catch (error) { /* storage unavailable */ }
    }

    function socialEngagementHasContent(overlay) {
      return Object.values(overlay.socials).some(Boolean) || Object.values(overlay.actions).some(Boolean) || !!overlay.headline;
    }

    function isLiveLowerThirdOverlayActive(overlayName) {
      const livePayload = lastLiveState?.kind === 'update' ? lastLiveState.payload : null;
      return !!livePayload?.lowerThirdOnly && !!livePayload[overlayName]?.enabled;
    }

    function publishLowerThirdOverlays(opts = {}) {
      const nameRoleEnabled = document.getElementById('name-role-overlay-show-btn')?.getAttribute('aria-pressed') === 'true';
      const socialEnabled = document.getElementById('social-engagement-overlay-show-btn')?.getAttribute('aria-pressed') === 'true';
      const anyEnabled = nameRoleEnabled || socialEnabled;
      const payload = {
        text: '',
        mode: 'full',
        isBible: false,
        fontFamily: "'Montserrat',sans-serif",
        fontWeight: '700',
        fontSizeFull: 48,
        fontSizeLT: 32,
        lineHeightFull: 1.1,
        lineHeightLT: 1.1,
        bgEnabled: false,
        bgType: 'color',
        bgColor: '#000000',
        bgMode: 'solid',
        bgOpacity: 0,
        bgImage: null,
        bgVideo: null,
        lowerThirdOnly: anyEnabled,
        restorePrevious: !anyEnabled,
        nameRoleOverlay: getNameRoleOverlaySettings(nameRoleEnabled),
        socialEngagementOverlay: getSocialEngagementOverlaySettings(socialEnabled)
      };
      const updateLivePosition = opts.positionEdit === true && isPreviewOnlyMode() &&
        isLiveLowerThirdOverlayActive(opts.overlayName);
      if (!isPreviewOnlyMode() || updateLivePosition) postUpdate(payload);
      if (isPreviewOnlyMode()) sendProgramPreview(payload);
    }

    function publishNameRoleOverlay(opts) {
      publishLowerThirdOverlays(opts);
    }

    function publishSocialEngagementOverlay(opts) {
      publishLowerThirdOverlays(opts);
    }

    function setLowerThirdButtonState(button, enabled, title) {
      if (!button) return;
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      button.textContent = enabled ? 'Hide from air' : 'Show on air';
      button.classList.toggle('active', enabled);
      button.title = enabled ? `Hide ${title}` : `Show ${title}`;
    }

    // Test / replay: the example comes in, holds, then goes out, so both the
    // intro and the outro of the chosen animation are seen. Choosing a design or
    // an overlay keeps its example on the Preview instead.
    const LT_TEST_HOLD_MS = 3200;
    let lowerThirdTestTimers = [];

    function playLowerThirdTest(show) {
      lowerThirdTestTimers.forEach(clearTimeout);
      lowerThirdTestTimers = [];
      show(false);                                   // start hidden so the intro plays every time
      lowerThirdTestTimers.push(setTimeout(() => show(true), 120));
      lowerThirdTestTimers.push(setTimeout(() => show(false), 120 + LT_TEST_HOLD_MS));
    }

    function testNameRoleLowerThird() {
      playLowerThirdTest(visible => previewNameRoleLowerThirdExample(visible, { keepTimers: true }));
    }

    function testSocialEngagementLowerThird() {
      playLowerThirdTest(visible => previewSocialEngagementLowerThirdExample(visible, { keepTimers: true }));
    }

    function previewNameRoleLowerThirdExample(visible = true, opts = {}) {
      if (!opts.keepTimers) { lowerThirdTestTimers.forEach(clearTimeout); lowerThirdTestTimers = []; }
      const settings = getNameRoleOverlaySettings(true);
      sendProgramPreview({
        text: '',
        mode: 'full',
        isBible: false,
        fontFamily: "'Montserrat',sans-serif",
        fontWeight: '700',
        fontSizeFull: 48,
        fontSizeLT: 32,
        lineHeightFull: 1.1,
        lineHeightLT: 1.1,
        bgEnabled: false,
        bgType: 'color',
        bgColor: '#000000',
        bgMode: 'solid',
        bgOpacity: 0,
        bgImage: null,
        bgVideo: null,
        lowerThirdOnly: true,
        nameRoleOverlay: {
          ...settings,
          enabled: visible !== false,
          name: settings.name || 'PS Samson',
          role: settings.name ? settings.role : 'Senior Pastor'
        }
      });
      if (!opts.quiet && (!opts.keepTimers || visible)) showToast('Lower-third example sent to preview');
    }

    function previewSocialEngagementLowerThirdExample(visible = true, opts = {}) {
      if (!opts.keepTimers) { lowerThirdTestTimers.forEach(clearTimeout); lowerThirdTestTimers = []; }
      const settings = getSocialEngagementOverlaySettings(true);
      sendProgramPreview({
        text: '',
        mode: 'full',
        isBible: false,
        fontFamily: "'Montserrat',sans-serif",
        fontWeight: '700',
        fontSizeFull: 48,
        fontSizeLT: 32,
        lineHeightFull: 1.1,
        lineHeightLT: 1.1,
        bgEnabled: false,
        bgType: 'color',
        bgColor: '#000000',
        bgMode: 'solid',
        bgOpacity: 0,
        bgImage: null,
        bgVideo: null,
        lowerThirdOnly: true,
        socialEngagementOverlay: {
          ...settings,
          enabled: visible !== false,
          // Your own entries; sample handles and buttons stand in when none are filled in
          ...(socialEngagementHasContent(settings) ? {} : {
            socials: { instagram: '@church', youtube: 'ChurchOnline', website: 'church.org' },
            actions: { like: true, comment: false, share: true, subscribe: true, follow: false },
            headline: 'Join us online'
          })
        }
      });
      if (!opts.keepTimers || visible) showToast('Social lower-third example sent to preview');
    }

    // One thing on the live output at a time: a verse or lyric replaces a lower
    // third, and a lower third replaces the verse or lyric.
    function hideLiveLowerThirds() {
      const nameRole = document.getElementById('name-role-overlay-show-btn');
      const social = document.getElementById('social-engagement-overlay-show-btn');
      const shown = [nameRole, social].filter(button => button && button.getAttribute('aria-pressed') === 'true');
      if (!shown.length) return false;
      shown.forEach(button => setLowerThirdButtonState(button, false, button === nameRole ? 'lower third' : 'social lower third'));
      // The display leaves lower-third mode (restoring the last slide) before the new slide arrives
      publishLowerThirdOverlays();
      handleNameRoleOverlayChange(true);
      handleSocialEngagementOverlayChange(true);
      return true;
    }

    function takeLiveOutputForLowerThird() {
      if (isLive && !isPreviewOnlyMode()) clearOutput({ fade: false });
    }

    let nameRoleAutoHideTimer = null;
    function toggleNameRoleOverlay() {
      const button = document.getElementById('name-role-overlay-show-btn');
      if (!button) return;
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      const overlay = getNameRoleOverlaySettings(enabled);
      if (enabled && !overlay.name) {
        showToast('Enter a name before showing the lower third');
        return;
      }
      if (enabled) {
        setLowerThirdButtonState(document.getElementById('social-engagement-overlay-show-btn'), false, 'social lower third');
        takeLiveOutputForLowerThird();
        if (!(typeof steppedSavedKey !== 'undefined' && steppedSavedKey === overlay.name + '|' + (overlay.role || ''))) rememberSavedName(overlay.name, overlay.role);
      }
      setLowerThirdButtonState(button, enabled, 'lower third');
      clearTimeout(nameRoleAutoHideTimer);
      if (enabled && overlay.extras && overlay.extras.autoHide > 0) {
        nameRoleAutoHideTimer = setTimeout(() => {
          if (button.getAttribute('aria-pressed') === 'true') runWithoutServiceLock(() => toggleNameRoleOverlay());
        }, overlay.extras.autoHide * 1000);
      }
      updateProgramDisplayStatus();
      handleNameRoleOverlayChange(true);
    }

    function toggleSocialEngagementOverlay() {
      const button = document.getElementById('social-engagement-overlay-show-btn');
      if (!button) return;
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      const overlay = getSocialEngagementOverlaySettings(enabled);
      const hasAnyContent = socialEngagementHasContent(overlay);
      if (enabled && !hasAnyContent) {
        showToast('Add a handle, a headline or an action before showing the social lower third');
        return;
      }
      if (enabled) {
        setLowerThirdButtonState(document.getElementById('name-role-overlay-show-btn'), false, 'lower third');
        takeLiveOutputForLowerThird();
      }
      setLowerThirdButtonState(button, enabled, 'social lower third');
      clearTimeout(socialAutoHideTimer);
      if (enabled && overlay.autoHideSeconds > 0) {
        socialAutoHideTimer = setTimeout(() => {
          if (button.getAttribute('aria-pressed') === 'true') (typeof runWithoutServiceLock === 'function' ? runWithoutServiceLock : (f) => f())(() => toggleSocialEngagementOverlay());
        }, overlay.autoHideSeconds * 1000);
      }
      handleSocialEngagementOverlayChange(true);
    }

    // Lower-third design picker: one tab per family and one button per design,
    // built from the <select>, which stays the source of truth. Picking a
    // design also shows it on the Preview monitor.
    let ltDesignPickerFamily = '';

    // Colors for the little design previews: bar, accent edge, name and role
    // text, role background. Only used to draw the picker thumbnails.
    // Design thumbnails render the real lower third: the same CSS the Preview page uses,
    // in a 1920x1080 frame scaled down, with the current colours and name.
    let ltThumbCssCache = '';
    let ltDesignQuery = '';

    function getLtThumbCss() {
      if (ltThumbCssCache) return ltThumbCssCache;
      const page = buildStandaloneDisplayHtml({ preview: true });
      const styles = Array.from(page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(m => m[1]).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const rules = styles.match(/[^{}]*name-role-overlay[^{}]*\{[^{}]*\}/g) || [];
      ltThumbCssCache = rules.join('\n') + '\n' + ((window.SP_LT_EXTRA && window.SP_LT_EXTRA.css) || '');
      return ltThumbCssCache;
    }

    function buildLtThumbDoc() {
      return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${BUNDLED_FONTS_CSS_URL}"><style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:linear-gradient(160deg,#33445f,#10151d)}
body{font-family:'Montserrat','Geist',sans-serif}
*{transition:none!important;animation:none!important}
${getLtThumbCss()}
#name-role-overlay{opacity:1!important;visibility:visible!important}
</style></head><body><div id="name-role-overlay" class="is-visible"><div class="name-role-overlay-card"><span class="name-role-overlay-accent"></span><div class="name-role-overlay-stack"><div class="name-role-overlay-copy-panel"><div class="name-role-overlay-copy"><strong class="name-role-overlay-name"></strong><span class="name-role-overlay-role"></span></div></div></div></div></div></body></html>`;
    }

    function readLtThumbSample() {
      const hex = (id, fallback) => { const v = document.getElementById(id)?.value || ''; return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; };
      return {
        name: document.getElementById('name-role-overlay-name')?.value.trim() || 'PS Samson',
        role: document.getElementById('name-role-overlay-role')?.value.trim() || 'Senior Pastor',
        primary: hex('name-role-overlay-primary', '#90D5FF'),
        accent: hex('name-role-overlay-accent', '#90D5FF')
      };
    }

    // The same legibility rule the output page uses for light backgrounds
    function ltThumbIsLight(color) {
      const rgb = color.slice(1).match(/.{2}/g).map(p => parseInt(p, 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] >= 0.72;
    }

    function paintLtThumb(frame, value, sample) {
      const doc = frame.contentDocument;
      const overlay = doc && doc.getElementById('name-role-overlay');
      if (!overlay) return;
      const isCustomTile = String(value).startsWith('custom:');
      const [layout, theme] = isCustomTile ? ['classic', 'custom'] : String(value).split('-');
      const light = ltThumbIsLight(sample.primary);
      overlay.className = `is-visible style-${layout} theme-${theme} motion-rise${light ? ' is-light-background' : ''}`;
      overlay.style.setProperty('--name-role-primary', sample.primary);
      overlay.style.setProperty('--name-role-accent', sample.accent);
      overlay.style.setProperty('--name-role-foreground', light ? '#101216' : '#ffffff');
      overlay.style.setProperty('--name-role-name-size', '56px');
      overlay.style.setProperty('--name-role-role-size', '24px');
      overlay.querySelector('.name-role-overlay-name').textContent = sample.name;
      overlay.querySelector('.name-role-overlay-role').textContent = sample.role;
      if (window.SP_LT_EXTRA) window.SP_LT_EXTRA.applyCustom(overlay, isCustomTile ? loadCustomLtDesigns().find(d => d.id === String(value).slice(7)) : null, isCustomTile);
      frame.dataset.painted = '1';
    }

    // Crop the 1920x1080 frame to the corner the design sits in, scaled to the tile
    function fitLtThumb(thumb) {
      const frame = thumb.querySelector('iframe');
      const width = thumb.clientWidth;
      if (!frame || !width) return;
      const view = 1100;
      const scale = width / view;
      const layout = thumb.dataset.layout;
      const x = layout === 'right' ? 1920 - view : (layout === 'classic' ? 0 : (1920 - view) / 2);
      const y = 1080 - thumb.clientHeight / scale;
      frame.style.transform = `scale(${scale}) translate(${-x}px, ${-y}px)`;
    }

    function buildLtDesignThumb(value) {
      const [layout] = String(value).startsWith('custom:') ? ['classic'] : String(value).split('-');
      const thumb = document.createElement('span');
      thumb.className = `lt-design-thumb is-${layout}`;
      thumb.dataset.layout = layout;
      const frame = document.createElement('iframe');
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.title = '';
      frame.srcdoc = buildLtThumbDoc();
      frame.addEventListener('load', () => { paintLtThumb(frame, value, readLtThumbSample()); fitLtThumb(thumb); });
      thumb.appendChild(frame);
      thumb.dataset.value = value;
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitLtThumb(thumb)).observe(thumb);
      return thumb;
    }

    function refreshLtThumbs() {
      const sample = readLtThumbSample();
      document.querySelectorAll('#lt-design-picker .lt-design-thumb').forEach((thumb) => {
        const frame = thumb.querySelector('iframe');
        if (frame && frame.dataset.painted) paintLtThumb(frame, thumb.dataset.value, sample);
      });
    }

    function ltDesignOptions(groups) {
      const query = ltDesignQuery.trim().toLowerCase();
      if (!query) {
        const group = groups.find(g => g.label === ltDesignPickerFamily);
        return Array.from(group ? group.children : []).map(o => ({ value: o.value, label: o.textContent }));
      }
      const terms = query.split(/\s+/);
      const out = [];
      groups.forEach(g => Array.from(g.children).forEach((o) => {
        const hay = `${o.textContent} ${g.label} ${o.value}`.toLowerCase();
        if (terms.every(t => hay.includes(t))) out.push({ value: o.value, label: `${o.textContent} · ${g.label}` });
      }));
      return out;
    }

    function renderLtDesignPicker() {
      const select = document.getElementById('name-role-overlay-design');
      const host = document.getElementById('lt-design-picker');
      if (!select || !host) return;
      const groups = Array.from(select.querySelectorAll('optgroup'));
      if (!groups.length) return;
      const current = select.value;
      const currentGroup = groups.find(g => Array.from(g.children).some(o => o.value === current)) || groups[0];
      if (ltDesignPickerFamily !== MY_LT_DESIGNS_LABEL && !groups.some(g => g.label === ltDesignPickerFamily)) ltDesignPickerFamily = currentGroup.label;

      // Toolbar (search, family tabs, count) is built once so the search box keeps focus
      let toolbar = host.querySelector('.lt-design-toolbar');
      let grid = host.querySelector('.lt-design-grid');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'lt-design-toolbar';
        const search = document.createElement('input');
        search.type = 'search';
        search.id = 'lt-design-search';
        search.className = 'lt-design-search';
        search.placeholder = 'Search designs';
        search.setAttribute('aria-label', 'Search lower third designs');
        search.autocomplete = 'off';
        search.addEventListener('input', () => { ltDesignQuery = search.value; renderLtDesignPicker(); });
        const families = document.createElement('div');
        families.className = 'lt-design-families';
        families.setAttribute('role', 'group');
        families.setAttribute('aria-label', 'Design family');
        const count = document.createElement('span');
        count.className = 'lt-design-count';
        toolbar.append(search, families, count);
        grid = document.createElement('div');
        grid.className = 'lt-design-grid';
        grid.setAttribute('role', 'group');
        host.replaceChildren(toolbar, grid);
      }
      const searching = !!ltDesignQuery.trim();
      const familiesEl = toolbar.querySelector('.lt-design-families');
      familiesEl.hidden = searching;
      if (!familiesEl.children.length) {
        groups.forEach((group) => {
          const tab = document.createElement('button');
          tab.type = 'button';
          tab.className = 'lt-design-family';
          tab.textContent = group.label;
          tab.dataset.family = group.label;
          tab.onclick = () => { ltDesignPickerFamily = group.label; renderLtDesignPicker(); };
          familiesEl.appendChild(tab);
        });
        const mine = document.createElement('button');
        mine.type = 'button';
        mine.className = 'lt-design-family';
        mine.textContent = MY_LT_DESIGNS_LABEL;
        mine.dataset.family = MY_LT_DESIGNS_LABEL;
        mine.onclick = () => { ltDesignPickerFamily = MY_LT_DESIGNS_LABEL; renderLtDesignPicker(); };
        familiesEl.appendChild(mine);
      }
      familiesEl.querySelectorAll('.lt-design-family').forEach(tab => {
        tab.setAttribute('aria-pressed', tab.dataset.family === ltDesignPickerFamily ? 'true' : 'false');
      });
      const total = groups.reduce((n, g) => n + g.children.length, 0);
      const options = (!searching && ltDesignPickerFamily === MY_LT_DESIGNS_LABEL) ? customLtDesignOptions() : ltDesignOptions(groups);
      toolbar.querySelector('.lt-design-count').textContent = searching
        ? `${options.length} of ${total} designs`
        : `${total} designs in ${groups.length} families`;
      grid.setAttribute('aria-label', searching ? 'Matching designs' : `${ltDesignPickerFamily} designs`);
      const showingMine = !searching && ltDesignPickerFamily === MY_LT_DESIGNS_LABEL;

      // Rebuild the tiles only when the set shown changes; otherwise just refresh them
      const key = (showingMine ? 'mine:' + JSON.stringify(loadCustomLtDesigns()) + '|' : '') + options.map(o => o.value).join('|');
      if (grid.dataset.key !== key) {
        grid.dataset.key = key;
        if (!options.length) {
          const none = document.createElement('p');
          none.className = 'lt-design-none';
          none.textContent = showingMine ? 'You have not made a design yet.' : 'No designs match.';
          grid.replaceChildren(none);
          if (showingMine) grid.appendChild(buildCreateLtDesignTile());
        } else {
          grid.replaceChildren(...options.map((option) => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'lt-design-tile';
            tile.dataset.value = option.value;
            const label = document.createElement('span');
            label.className = 'lt-design-label';
            label.textContent = option.label;
            tile.append(buildLtDesignThumb(option.value), label);
            if (option.value.startsWith('custom:')) {
              tile.onclick = () => pickCustomLtDesign(option.value.slice(7));
              const edit = document.createElement('span');
              edit.className = 'lt-design-edit'; edit.setAttribute('role', 'button'); edit.title = 'Edit this design'; edit.textContent = 'Edit';
              edit.onclick = (e) => { e.stopPropagation(); openLtDesigner(option.value.slice(7)); };
              tile.appendChild(edit);
            } else tile.onclick = () => pickLtDesign(option.value);
            return tile;
          }));
          if (showingMine) grid.appendChild(buildCreateLtDesignTile());
        }
      } else {
        refreshLtThumbs();
      }
      const activeCustomId = current.endsWith('-custom') ? getActiveCustomLtDesignId() : '';
      grid.querySelectorAll('.lt-design-tile').forEach(tile => {
        const v = tile.dataset.value || '';
        tile.setAttribute('aria-pressed', (v.startsWith('custom:') ? (v.slice(7) === activeCustomId) : v === current) ? 'true' : 'false');
      });
    }

    // Saved names: people shown before, one click refills Name and Role
    const SAVED_NAMES_KEY = 'scripturePod.savedNames.v1';

    function readSavedNames() {
      try {
        const list = JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || '[]');
        return Array.isArray(list) ? list.filter(p => p && p.name) : [];
      } catch (error) {
        return [];
      }
    }

    function writeSavedNames(list) {
      try { localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(list.slice(0, 200))); } catch (error) { /* storage unavailable */ }
    }

    function rememberSavedName(name, role) {
      const clean = String(name || '').trim();
      if (!clean) return;
      const list = readSavedNames().filter(p => !(p.name === clean && (p.role || '') === String(role || '').trim()));
      list.unshift({ name: clean, role: String(role || '').trim() });
      writeSavedNames(list);
      renderSavedNames();
    }

    // The ACI bundle brings its pastors along, so the Overlays tab has them from the start
    const BUNDLED_SAVED_NAMES = [
      { name: 'PS. Samson Arthur Paul', role: 'Senior Pastor' },
      { name: 'Sis. Shiby Samson', role: 'Pastor' }
    ];
    function addBundledSavedNames() {
      const existing = readSavedNames();
      const missing = BUNDLED_SAVED_NAMES.filter((b) => !existing.some((p) => p.name === b.name));
      if (!missing.length) return;
      writeSavedNames([...missing, ...existing]);
      renderSavedNames();
    }

    let savedNamesQuery = '';

    function setSavedNamesQuery(value) {
      savedNamesQuery = String(value || '');
      renderSavedNames();
    }

    function renderSavedNames() {
      const host = document.getElementById('saved-names-list');
      if (!host) return;
      const all = readSavedNames();
      const searchBox = document.getElementById('saved-names-search');
      if (searchBox) searchBox.hidden = all.length < 4 && !savedNamesQuery;
      const terms = savedNamesQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = terms.length
        ? all.filter(p => terms.every(t => `${p.name} ${p.role || ''}`.toLowerCase().includes(t)))
        : all;
      const nameInput = document.getElementById('name-role-overlay-name');
      const roleInput = document.getElementById('name-role-overlay-role');
      if (all.length && !list.length) {
        const none = document.createElement('p');
        none.className = 'saved-names-empty';
        none.textContent = 'No saved names match.';
        host.replaceChildren(none);
        return;
      }
      if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'saved-names-empty';
        empty.textContent = 'Names you put on screen are kept here.';
        host.replaceChildren(empty);
        return;
      }
      host.replaceChildren(...list.map((person) => {
        const row = document.createElement('div');
        row.className = 'saved-name';
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'saved-name-pick';
        const active = nameInput && nameInput.value.trim() === person.name && (roleInput?.value || '').trim() === (person.role || '');
        pick.setAttribute('aria-pressed', active ? 'true' : 'false');
        const name = document.createElement('span');
        name.className = 'saved-name-name';
        name.textContent = person.name;
        const role = document.createElement('span');
        role.className = 'saved-name-role';
        role.textContent = person.role || 'No role';
        pick.append(name, role);
        pick.onclick = () => {
          if (nameInput) nameInput.value = person.name;
          if (roleInput) roleInput.value = person.role || '';
          handleNameRoleOverlayChange();
          previewNameRoleLowerThirdExample();
          renderSavedNames();
        };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'saved-name-remove';
        remove.setAttribute('aria-label', `Remove ${person.name}`);
        remove.textContent = '×';
        remove.onclick = () => {
          writeSavedNames(readSavedNames().filter(p => !(p.name === person.name && (p.role || '') === (person.role || ''))));
          renderSavedNames();
        };
        row.append(pick, remove);
        return row;
      }));
    }

    // Logo: White / Black / Off buttons drive the hidden select
    function setNameRoleOverlayLogoColor(value) {
      const select = document.getElementById('name-role-overlay-logo-color');
      if (!select) return;
      select.value = value;
      syncNameRoleOverlayLogoButtons();
      handleNameRoleOverlayChange();
    }

    function syncNameRoleOverlayLogoButtons() {
      const value = document.getElementById('name-role-overlay-logo-color')?.value || 'white';
      document.querySelectorAll('[data-logo-color]').forEach(button => {
        button.setAttribute('aria-pressed', button.dataset.logoColor === value ? 'true' : 'false');
      });
    }

    function pickLtDesign(value) {
      const select = document.getElementById('name-role-overlay-design');
      if (!select) return;
      select.value = value;
      handleNameRoleOverlayChange();
      previewNameRoleLowerThirdExample();
    }

    function handleNameRoleOverlayChange(visibilityChanged = false, positionEdit = false) {
      renderLtDesignPicker();
      syncNameRoleOverlayLogoButtons();
      renderSavedNames();
      const nameInput = document.getElementById('name-role-overlay-name');
      const roleInput = document.getElementById('name-role-overlay-role');
      const enabledButton = document.getElementById('name-role-overlay-show-btn');
      const logoPreview = document.getElementById('name-role-overlay-logo-preview');
      const name = String(nameInput?.value || '').trim();
      const role = String(roleInput?.value || '').trim();
      const enabled = enabledButton?.getAttribute('aria-pressed') === 'true';
      if (!appState) appState = buildDefaultAppState();
      if (!appState.settings) appState.settings = getUiSnapshot();
      appState.settings.socialEngagementOverlayEnabled = document.getElementById('social-engagement-overlay-show-btn')?.getAttribute('aria-pressed') === 'true';
      appState.settings.nameRoleOverlayName = name;
      appState.settings.nameRoleOverlayRole = role;
      appState.settings.nameRoleOverlayEnabled = enabled;
      appState.settings.nameRoleOverlayStyle = getNameRoleOverlayStyle();
      appState.settings.nameRoleOverlayPrimaryColor = document.getElementById('name-role-overlay-primary')?.value || '#90D5FF';
      appState.settings.nameRoleOverlayAccentColor = document.getElementById('name-role-overlay-accent')?.value || '#90D5FF';
      appState.settings.nameRoleOverlayLogo = logoPreview?.dataset.logoDataUrl || '';
      appState.settings.nameRoleOverlayLogoColor = document.getElementById('name-role-overlay-logo-color')?.value || 'white';
      appState.settings.nameRoleOverlayNameSize = document.getElementById('name-role-overlay-name-size')?.value || '56';
      appState.settings.nameRoleOverlayRoleSize = document.getElementById('name-role-overlay-role-size')?.value || '24';
      appState.settings.nameRoleOverlayLogoSize = document.getElementById('name-role-overlay-logo-size')?.value || '128';
      appState.settings.nameRoleOverlayScale = document.getElementById('name-role-overlay-scale')?.value || '100';
      appState.settings.nameRoleOverlayPadLeft = document.getElementById('name-role-overlay-pad-l')?.value || '0';
      appState.settings.nameRoleOverlayPadRight = document.getElementById('name-role-overlay-pad-r')?.value || '0';
      appState.settings.nameRoleOverlayOffsetX = String(document.getElementById('name-role-overlay-offset-x')?.value || '0');
      appState.settings.nameRoleOverlayOffsetY = String(document.getElementById('name-role-overlay-offset-y')?.value || '0');
      appState.settings.nameRoleOverlayExtras = typeof collectNameRoleExtras === 'function' ? collectNameRoleExtras() : {};
      document.getElementById('name-role-overlay-offset-x-value').textContent = `${appState.settings.nameRoleOverlayOffsetX}%`;
      const scaleValueEl = document.getElementById('name-role-overlay-scale-value');
      if (scaleValueEl) scaleValueEl.textContent = `${appState.settings.nameRoleOverlayScale}%`;
      document.getElementById('name-role-overlay-offset-y-value').textContent = `${appState.settings.nameRoleOverlayOffsetY}%`;
      saveState();
      saveToStorageDebounced();
      if (enabled) {
        if (!name) {
          enabledButton?.setAttribute('aria-pressed', 'false');
          if (enabledButton) enabledButton.textContent = 'Show on air';
          appState.settings.nameRoleOverlayEnabled = false;
          saveState();
          saveToStorageDebounced();
          showToast('Enter a name before showing the lower third');
          publishNameRoleOverlay({ positionEdit });
          return;
        }
        publishNameRoleOverlay({ positionEdit, overlayName: 'nameRoleOverlay' });
      } else if (visibilityChanged) {
        publishNameRoleOverlay();
      } else if (isPreviewOnlyMode()) previewCurrentSelection();
      else if (isLive && livePointer) pushLiveUpdate();
      if (!enabled && !visibilityChanged) scheduleNameRoleExamplePreview();
    }

    // In the Overlays tab, a change to the look is drawn in the preview by itself: a new animation plays through once,
    // anything else (font, colours, size, design) refreshes the example that is showing
    let nameRoleExampleTimer = 0;
    let lastNameRoleAnimation = null;
    function scheduleNameRoleExamplePreview() {
      const animation = document.getElementById('name-role-overlay-animation')?.value || 'rise';
      const animationChanged = lastNameRoleAnimation !== null && lastNameRoleAnimation !== animation;
      lastNameRoleAnimation = animation;
      if (!document.body.classList.contains('overlays-workspace-active')) return;
      if ((document.body.dataset.overlay || 'name-role') !== 'name-role') return;
      clearTimeout(nameRoleExampleTimer);
      nameRoleExampleTimer = setTimeout(() => {
        if (animationChanged) testNameRoleLowerThird();
        else previewNameRoleLowerThirdExample(true, { quiet: true });
      }, 150);
    }

    function handleSocialEngagementOverlayChange(visibilityChanged = false, positionEdit = false) {
      const enabledButton = document.getElementById('social-engagement-overlay-show-btn');
      const enabled = enabledButton?.getAttribute('aria-pressed') === 'true';
      const payload = getSocialEngagementOverlaySettings(enabled);
      if (!appState) appState = buildDefaultAppState();
      if (!appState.settings) appState.settings = getUiSnapshot();
      appState.settings.nameRoleOverlayEnabled = document.getElementById('name-role-overlay-show-btn')?.getAttribute('aria-pressed') === 'true';
      appState.settings.nameRoleOverlaySocialsEnabled = Object.values(payload.socials).some(Boolean);
      appState.settings.nameRoleOverlayInstagram = payload.socials.instagram;
      appState.settings.nameRoleOverlayFacebook = payload.socials.facebook;
      appState.settings.nameRoleOverlayWebsite = payload.socials.website;
      appState.settings.nameRoleOverlayLike = payload.actions.like;
      appState.settings.nameRoleOverlayShare = payload.actions.share;
      appState.settings.nameRoleOverlaySubscribe = payload.actions.subscribe;
      appState.settings.socialEngagementOverlayEnabled = enabled;
      appState.settings.socialEngagementConfig = collectSocialEngagementConfig();
      appState.settings.socialEngagementOverlayPrimaryColor = payload.primaryColor;
      appState.settings.socialEngagementOverlayAccentColor = payload.accentColor;
      appState.settings.socialEngagementOverlaySize = String(payload.size);
      appState.settings.socialEngagementOverlaySizeVersion = 2;
      appState.settings.socialEngagementBgOpacity = payload.bgOpacity === null ? '' : String(payload.bgOpacity);
      { const out = document.getElementById('social-engagement-bg-opacity-value'); if (out) out.textContent = payload.bgOpacity === null ? 'Theme' : `${payload.bgOpacity}%`; }
      appState.settings.socialEngagementOverlayOffsetX = String(payload.offsetX);
      appState.settings.socialEngagementOverlayOffsetY = String(payload.offsetY);
      document.getElementById('social-engagement-offset-x-value').textContent = `${payload.offsetX}%`;
      document.getElementById('social-engagement-offset-y-value').textContent = `${payload.offsetY}%`;
      saveState();
      saveToStorageDebounced();
      if (enabled) {
        const hasAnyContent = socialEngagementHasContent(payload);
        if (!hasAnyContent) {
          enabledButton?.setAttribute('aria-pressed', 'false');
          if (enabledButton) enabledButton.textContent = 'Show on air';
          appState.settings.nameRoleOverlaySocialsEnabled = false;
          appState.settings.socialEngagementOverlayEnabled = false;
          saveState();
          saveToStorageDebounced();
          publishSocialEngagementOverlay({ positionEdit });
          return;
        }
        publishSocialEngagementOverlay({ positionEdit, overlayName: 'socialEngagementOverlay' });
      } else if (visibilityChanged) {
        publishSocialEngagementOverlay();
      } else if (isPreviewOnlyMode()) previewCurrentSelection();
      else if (isLive && livePointer) pushLiveUpdate();
    }

    async function handleNameRoleOverlayLogoChange(input) {
      const file = input?.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        showToast('Choose a PNG, JPEG, or WebP logo');
        input.value = '';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        showToast('Logo image must be smaller than 8 MB');
        input.value = '';
        return;
      }
      let bitmap = null;
      try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 520 / bitmap.width, 220 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to process logo image');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/webp';
        const logoDataUrl = canvas.toDataURL(mimeType, 0.88);
        const preview = document.getElementById('name-role-overlay-logo-preview');
        const removeButton = document.getElementById('name-role-overlay-logo-remove');
        if (preview) {
          preview.dataset.logoDataUrl = logoDataUrl;
          preview.src = logoDataUrl;
          preview.hidden = false;
        }
        if (removeButton) removeButton.hidden = false;
        handleNameRoleOverlayChange();
      } catch (error) {
        showToast('Unable to load church logo');
      } finally {
        bitmap?.close();
        input.value = '';
      }
    }

    function removeNameRoleOverlayLogo() {
      const preview = document.getElementById('name-role-overlay-logo-preview');
      const removeButton = document.getElementById('name-role-overlay-logo-remove');
      if (preview) {
        preview.dataset.logoDataUrl = '';
        preview.removeAttribute('src');
        preview.hidden = true;
      }
      if (removeButton) removeButton.hidden = true;
      handleNameRoleOverlayChange();
    }

    const RELAY_MEDIA_UNSET = Symbol('relay-media-unset');
    let lastRelayBgImage = RELAY_MEDIA_UNSET;
    let lastRelayBgVideo = RELAY_MEDIA_UNSET;
    let backgroundVideoPreloadTimer = null;
    const backgroundMediaUrlCache = new Map();
    const BACKGROUND_MEDIA_URL_CACHE_LIMIT = 4;
    const backgroundMediaPending = new Map();
    let syncStateMediaPending = false;

    function cacheBackgroundMediaForOutput(source) {
      if (typeof source !== 'string' || !source.startsWith('data:')) return Promise.resolve(source);
      if (!(window.BSPDesktop && typeof window.BSPDesktop.cacheBackgroundMedia === 'function')) return Promise.resolve(source);
      if (backgroundMediaUrlCache.has(source)) {
        const cachedUrl = backgroundMediaUrlCache.get(source);
        backgroundMediaUrlCache.delete(source);
        backgroundMediaUrlCache.set(source, cachedUrl);
        return Promise.resolve(cachedUrl);
      }
      if (backgroundMediaPending.has(source)) return backgroundMediaPending.get(source);
      const pending = window.BSPDesktop.cacheBackgroundMedia(source).then((result) => {
        if (!result?.url) throw new Error('Background media URL was not returned');
        backgroundMediaUrlCache.set(source, result.url);
        while (backgroundMediaUrlCache.size > BACKGROUND_MEDIA_URL_CACHE_LIMIT) {
          backgroundMediaUrlCache.delete(backgroundMediaUrlCache.keys().next().value);
        }
        if (isLive) scheduleLiveUpdate();
        return result.url;
      }).finally(() => {
        backgroundMediaPending.delete(source);
      });
      backgroundMediaPending.set(source, pending);
      return pending;
    }

    function getOutputMediaSource(source) {
      if (typeof source !== 'string' || !source.startsWith('data:')) return source;
      return backgroundMediaUrlCache.get(source) || null;
    }

    function mapOutputMessageMedia(message) {
      if (message.type === 'UPDATE' || message.type === 'PRELOAD_BACKGROUND') {
        const mapped = { ...message };
        ['bgImage', 'bgVideo'].forEach((key) => {
          if (typeof mapped[key] === 'string' && mapped[key].startsWith('data:')) {
            mapped[key] = getOutputMediaSource(mapped[key]);
          }
        });
        return mapped;
      }
      if (message.type === 'SYNC_STATE' && message.state?.kind === 'update' && message.state.payload) {
        return {
          ...message,
          state: {
            ...message.state,
            payload: mapOutputMessageMedia({ type: 'UPDATE', ...message.state.payload })
          }
        };
      }
      return message;
    }

    function compactRelayMedia(message) {
      if (message.type === 'CLEAR' || (message.type === 'SYNC_STATE' && message.state?.kind === 'clear')) {
        lastRelayBgImage = RELAY_MEDIA_UNSET;
        lastRelayBgVideo = RELAY_MEDIA_UNSET;
        return message;
      }
      if (message.type === 'PRELOAD_BACKGROUND') {
        if (Object.prototype.hasOwnProperty.call(message, 'bgVideo')) lastRelayBgVideo = message.bgVideo;
        return message;
      }
      if (message.type === 'SYNC_STATE' && message.state?.kind === 'update' && message.state.payload) {
        lastRelayBgImage = message.state.payload.bgImage ?? null;
        lastRelayBgVideo = message.state.payload.bgVideo ?? null;
        return message;
      }
      if (message.type !== 'UPDATE') return message;
      const compacted = { ...message };
      ['bgImage', 'bgVideo'].forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(message, key)) return;
        const previous = key === 'bgImage' ? lastRelayBgImage : lastRelayBgVideo;
        if (message[key] === previous) {
          delete compacted[key];
        } else if (key === 'bgImage') {
          lastRelayBgImage = message[key];
        } else {
          lastRelayBgVideo = message[key];
        }
      });
      return compacted;
    }

    async function sendBackgroundVideoPreload(opts = {}) {
      const backgroundState = opts.backgroundState || null;
      const bgType = backgroundState?.bgType || document.getElementById('bg-type')?.value;
      if (bgType !== 'video') return;
      const source = document.getElementById('bg-video-source')?.value || 'upload';
      const videoData = backgroundState
        ? String(backgroundState.bgVideo || '').trim()
        : (source === 'upload'
            ? bgVideoUploadDataUrl
            : String(document.getElementById('bg-video-url')?.value || '').trim());
      if (!videoData) return;
      let videoUrl = videoData;
      try {
        videoUrl = await cacheBackgroundMediaForOutput(videoData);
      } catch (error) {
        console.error('Background video registration failed', error);
        showToast('Background video could not be prepared for display');
        return;
      }
      const savedLiveVideoMatches = lastLiveState?.kind === 'update' &&
        lastLiveState.payload?.bgType === 'video' &&
        lastLiveState.payload.bgVideo === videoData;
      const resumeSavedLiveVideo = savedLiveVideoMatches &&
        lastLiveState.payload.bgEnabled !== false &&
        Number(lastLiveState.payload.bgOpacity ?? 1) > 0;
      broadcastMessage({
        type: 'PRELOAD_BACKGROUND',
        bgVideo: videoUrl,
        bgVideoLoop: backgroundState?.bgVideoLoop != null
          ? !!backgroundState.bgVideoLoop
          : !!document.getElementById('bg-video-loop')?.checked,
        bgVideoSpeed: Number(backgroundState?.bgVideoSpeed ?? document.getElementById('bg-video-speed')?.value ?? 1),
        resume: resumeSavedLiveVideo
      });
      if (savedLiveVideoMatches) sendSyncState();
      else if (isLive && livePointer) scheduleLiveUpdate();
    }

    function scheduleBackgroundVideoPreload() {
      clearTimeout(backgroundVideoPreloadTimer);
      backgroundVideoPreloadTimer = setTimeout(sendBackgroundVideoPreload, 500);
    }

    function nextSeq() {
      messageSeq += 1;
      return messageSeq;
    }

    function sendSyncState(opts = {}) {
      if (typeof sendMonitorClock === 'function') setTimeout(sendMonitorClock, 0);
      if (typeof sendStageConfig === 'function') setTimeout(sendStageConfig, 0);
      // Only what is on air goes out: a verse left over from an earlier session (or from
      // before the versions on screen changed) must not appear when a display connects
      const onAir = typeof getOnAirPayload === 'function' ? getOnAirPayload() : (lastLiveState && lastLiveState.kind === 'update' ? lastLiveState.payload : null);
      const state = onAir
        ? { kind: 'update', payload: forMonitor({ ...onAir }) }
        : { kind: 'clear' };
      const payload = state.payload;
      const activeMedia = payload?.bgEnabled && Number(payload.bgOpacity ?? 1) > 0
        ? (payload.bgType === 'video' ? payload.bgVideo : (payload.bgType === 'image' ? payload.bgImage : null))
        : null;
      const canCacheMedia = window.BSPDesktop && typeof window.BSPDesktop.cacheBackgroundMedia === 'function';
      if (!opts.skipMediaCache && canCacheMedia && typeof activeMedia === 'string' &&
          activeMedia.startsWith('data:') && !backgroundMediaUrlCache.has(activeMedia)) {
        if (syncStateMediaPending) return;
        syncStateMediaPending = true;
        cacheBackgroundMediaForOutput(activeMedia).then(() => {
          syncStateMediaPending = false;
          sendSyncState();
        }).catch((error) => {
          syncStateMediaPending = false;
          console.error('Live background registration failed during display sync', error);
          sendSyncState({ skipMediaCache: true });
        });
        return;
      }
      const msg = {
        type: 'SYNC_STATE',
        proto: 1,
        sender: 'control',
        ts: Date.now(),
        seq: nextSeq(),
        state
      };
      const outputMessage = mapOutputMessageMedia(msg);
      broadcastMessage(outputMessage);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: 'bsp-panel-parent', message: outputMessage }, '*');
        }
      } catch (_) {}
    }

    function getLibraryCounts() {
      const songCount = Array.isArray(songs) ? songs.length : 0;
      const bibleCount = bibles ? Object.keys(bibles).length : 0;
      return { songCount, bibleCount };
    }

    function queueRelayStatePush(opts = {}) {
      if (isRestoringBackup || isApplyingRemoteState || !stateReady) return;
      if (opts.includeSongs) relayStateIncludeSongs = true;
      if (opts.includeBibles) relayStateIncludeBibles = true;
      if (relayStateTimer) return;
      relayStateTimer = setTimeout(() => {
        relayStateTimer = null;
        sendRelayStatePush({
          includeSongs: relayStateIncludeSongs,
          includeBibles: relayStateIncludeBibles
        });
      }, 700);
    }

    function sendRelayStatePush({ includeSongs = false, includeBibles = false, bumpUpdatedAt = true } = {}) {
      if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) return false;
      if (isRestoringBackup || isApplyingRemoteState || !stateReady) return false;
      syncAppStateFromUi();
      const counts = getLibraryCounts();
      const updatedAt = bumpUpdatedAt ? Date.now() : (appStateUpdatedAt || Date.now());
      appStateUpdatedAt = Math.max(appStateUpdatedAt || 0, updatedAt);
      const payload = {
        type: 'STATE_PUSH',
        proto: 1,
        sender: 'control',
        clientId: relayClientId,
        ts: Date.now(),
        stateUpdatedAt: updatedAt,
        appState,
        songCount: counts.songCount,
        bibleCount: counts.bibleCount
      };
      if (includeSongs) {
        payload.songRecords = songs.map(song => buildSongRecord(song, { isNew: false }));
      }
      relayStateIncludeSongs = false;
      relayStateIncludeBibles = false;
      if (includeBibles) {
        // Unloaded versions are read from storage so the other panel gets the
        // whole library, never an empty placeholder
        getAllBibleRecordsForSync()
          .then((records) => { payload.bibleRecords = records; relaySend(payload); })
          .catch(() => {});
        return true;
      }
      relaySend(payload);
      return true;
    }

    function requestRelayState() {
      if (!stateReady || isRestoringBackup) {
        relayStateRequestPending = true;
        return;
      }
      if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) {
        relayStateRequestPending = true;
        return;
      }
      relayStateRequestPending = false;
      const counts = getLibraryCounts();
      relaySend({
        type: 'STATE_REQUEST',
        proto: 1,
        sender: 'control',
        clientId: relayClientId,
        ts: Date.now(),
        stateUpdatedAt: appStateUpdatedAt || 0,
        hasLibrary: (counts.songCount > 0 || counts.bibleCount > 0),
        songCount: counts.songCount,
        bibleCount: counts.bibleCount
      });
    }

    function flushRelayStateQueue() {
      if (relayStateIncludeSongs || relayStateIncludeBibles) {
        queueRelayStatePush({ includeSongs: relayStateIncludeSongs, includeBibles: relayStateIncludeBibles });
      }
      if (relayStateRequestPending) requestRelayState();
    }

    function handleRelayStateRequest(d) {
      if (!d || d.sender !== 'control') return;
      if (d.clientId && d.clientId === relayClientId) return;
      if (!stateReady || isRestoringBackup || isApplyingRemoteState) return;
      const counts = getLibraryCounts();
      const localHasLibrary = (counts.songCount > 0 || counts.bibleCount > 0);
      if (!localHasLibrary) return;
      const requesterHasLibrary = !!d.hasLibrary || Number(d.songCount || 0) > 0 || Number(d.bibleCount || 0) > 0;
      const requestUpdatedAt = Number(d.stateUpdatedAt || 0);
      const localUpdatedAt = Number(appStateUpdatedAt || 0);
      if (requestUpdatedAt && localUpdatedAt && requestUpdatedAt > localUpdatedAt) return;
      if (requesterHasLibrary && requestUpdatedAt && localUpdatedAt && requestUpdatedAt >= localUpdatedAt) return;
      sendRelayStatePush({
        includeSongs: counts.songCount > 0,
        includeBibles: counts.bibleCount > 0,
        bumpUpdatedAt: false
      });
    }

    function handleRelayStatePush(d) {
      if (!d || d.sender !== 'control') return;
      if (d.clientId && d.clientId === relayClientId) return;
      if (!stateReady || isRestoringBackup) {
        relayStateRequestPending = true;
        return;
      }
      if (!d.appState && !d.songRecords && !d.bibleRecords) return;
      const incomingUpdatedAt = Number(d.stateUpdatedAt || 0);
      const localUpdatedAt = Number(appStateUpdatedAt || 0);
      const incomingHasLibrary =
        (Array.isArray(d.songRecords) ? d.songRecords.length : 0) > 0 ||
        (Array.isArray(d.bibleRecords) ? d.bibleRecords.length : 0) > 0 ||
        Number(d.songCount || 0) > 0 ||
        Number(d.bibleCount || 0) > 0;
      const localCounts = getLibraryCounts();
      const localHasLibrary = localCounts.songCount > 0 || localCounts.bibleCount > 0;

      if (!incomingHasLibrary && !localHasLibrary) {
        requestRelayState();
        return;
      }
      if (!localHasLibrary && incomingHasLibrary) {
        applyRelayState(d);
        return;
      }
      if (incomingUpdatedAt && localUpdatedAt && incomingUpdatedAt <= localUpdatedAt) return;
      applyRelayState(d);
    }

    function applyRelayState(payload) {
      if (relayStateApplying) return;
      relayStateApplying = true;
      isApplyingRemoteState = true;
      if (payload.stateUpdatedAt) {
        appStateUpdatedAt = payload.stateUpdatedAt;
      }
      const stateValue = payload.appState || null;
      let songRecords = Array.isArray(payload.songRecords) ? payload.songRecords : null;
      let bibleRecords = Array.isArray(payload.bibleRecords) ? payload.bibleRecords : null;
      if (!songRecords) {
        songRecords = songs.map(song => buildSongRecord(song, { isNew: false }));
      }
      if (!bibleRecords) {
        bibleRecords = Object.keys(bibles).map(name => buildBibleRecord(name, bibles[name] || [], { isNew: false }));
      }
      applyLoadedState(stateValue, songRecords, bibleRecords, { runInit: false, stateUpdatedAt: payload.stateUpdatedAt || 0 });
      saveState();
      const tasks = [];
      if (stateValue) {
        tasks.push(dbSetAppState(stateValue, { updatedAt: payload.stateUpdatedAt || Date.now() }));
      }
      if (Array.isArray(payload.songRecords)) {
        tasks.push(dbClearStore(STORE_SONGS).then(() => dbPutMany(STORE_SONGS, songRecords)));
      }
      if (Array.isArray(payload.bibleRecords)) {
        tasks.push(dbClearStore(STORE_BIBLES).then(() => dbPutMany(STORE_BIBLES, bibleRecords)));
      }
      Promise.all(tasks).catch(() => {}).finally(() => {
        relayStateApplying = false;
        isApplyingRemoteState = false;
        if (payload.stateUpdatedAt) {
          appStateUpdatedAt = payload.stateUpdatedAt;
        } else if (!appStateUpdatedAt) {
          appStateUpdatedAt = Date.now();
        }
      });
    }

    function handleSyncMessage(d) {
      if (!d) return;
      if (d.type === 'PING') {
        if (d.__remoteMeta && d.__remoteMeta.viaRelay) {
          relaySend({ type: 'PONG', ts: Date.now() });
        }
        return;
      }
      if (d.type === 'PONG' || d.type === 'HELLO') {
        markDisplayOnline();
        if (d.type === 'PONG' && d.__remoteMeta && d.__remoteMeta.viaRelay) {
          remoteShowPendingPingAt = 0;
          remoteShowLastHeartbeatAt = Date.now();
          setRemoteShowConnectionState('connected');
          updateRelayUi();
        }
        if (d.type === 'HELLO') {
          if (!stateReady) {
            pendingHello = true;
          } else {
            sendSyncState();
            sendBackgroundVideoPreload();
          }
        }
        return;
      }
      if (d.type === 'STATE_REQUEST') {
        handleRelayStateRequest(d);
        return;
      }
      if (d.type === 'STATE_PUSH') {
        handleRelayStatePush(d);
      }
    }

    // Lyrics: the live outputs (main screen window, stream feed window, Program panel) are a lower
    // third; Preview and every monitor link (the LAN display address) show the lyrics full screen
    function isSongPayload(p) {
      return !!p && p.isBible === false && !p.lowerThirdOnly && !p.restorePrevious && typeof p.text === 'string';
    }
    // Each variant uses its own background opacity slider (LT Opacity for the live display, Full for monitors)
    // (the slider is read directly: its inline oninput runs before the handler that updates the variable)
    const pctToOpacity = (v) => Math.max(0, Math.min(100, Number(v))) / 100;
    const sliderPct = (id, fallback) => { const v = parseInt(document.getElementById(id)?.value, 10); return Number.isNaN(v) ? fallback : v; };
    function forOutput(p) {
      if (!isSongPayload(p)) return p;
      const out = { ...p, mode: 'lt', forceLt: true };
      out.bgOpacity = pctToOpacity(sliderPct('bg-opacity-lt', bgOpacityLT));
      return out;
    }
    function forMonitor(p) {
      if (!isSongPayload(p)) return p;
      const out = { ...p, mode: 'full', forceLt: false };
      out.bgOpacity = pctToOpacity(sliderPct('bg-opacity-full', bgOpacityFull));
      return out;
    }
    function mapMessagePayload(msg, fn) {
      if (msg && msg.type === 'UPDATE') return fn(msg);
      if (msg && msg.type === 'SYNC_STATE' && msg.state && msg.state.payload) return { ...msg, state: { ...msg.state, payload: fn(msg.state.payload) } };
      return msg;
    }

    // What the worship team's stage screen shows: the slide on screen now, the one after it, and where we are
    function buildStageInfo(item, cursor, linesOverride, page) {
      try {
        const isBible = !!(livePointer && livePointer.kind === 'bible');
        const plain = (html) => { const d = document.createElement('div'); d.innerHTML = String(html || ''); return (d.innerText || d.textContent || '').replace(/[ \t]+\n/g, '\n').trim(); };
        const pages = getPagesFromItem(item, isBible, linesOverride) || [];
        const cur = pages[cursor] || page || null;
        const base = {
          title: (item && item.title) || '',
          ref: isBible && cur ? getBibleRefForPage(item, cur.raw, cur.verseCount) : '',
          section: cur && cur.tag ? String(cur.tag) : '',
          position: `${Math.min(pages.length, cursor + 1)}/${pages.length}`
        };
        // The stage screen shows the whole verse or section, not just the lines on the main screen:
        // the lines on air are bright, the rest of the section is dimmer, and the next section is shown below
        if (!isBible && cur) {
          const sections = getPagesFromItem(item, false, 9999) || [];
          const curRows = String(cur.raw || '').split('\n').filter((l) => l.trim());
          const idx = sections.findIndex((s) => s.tag === cur.tag && String(s.raw || '').includes(curRows.join('\n')));
          if (idx >= 0) {
            const rows = String(sections[idx].raw || '').split('\n').filter((l) => l.trim());
            const start = Math.max(0, rows.findIndex((_, k) => rows.slice(k, k + curRows.length).join('\n') === curRows.join('\n')));
            const next = sections[idx + 1] || null;
            return { ...base, current: rows.join('\n'), lines: rows, activeStart: start, activeEnd: start + curRows.length - 1,
              next: plain(next && next.text), nextSection: next && next.tag ? String(next.tag) : '' };
          }
        }
        const nextPage = pages[cursor + 1] || null;
        return { ...base, current: plain(cur && cur.text), next: plain(nextPage && nextPage.text) };
      } catch (e) { return null; }
    }

    function broadcastMessage(rawMsg) {
      // Something going on air takes over from media on the stream, so the monitors and the stream show it, not the media
      if (rawMsg && rawMsg.type === 'UPDATE' && typeof streamMedia !== 'undefined' && streamMedia.playing && typeof stopStreamMediaPlayback === 'function') stopStreamMediaPlayback();
      // Live display (stream feed, display link, Program): lyrics as a lower third on a transparent page.
      // Monitor feeds (HDMI main screen, monitor link, Preview): lyrics full screen, with the clock.
      // Messages that differ between the two are tagged with an audience; the pages ignore the other one.
      const differs = !!rawMsg && (rawMsg.type === 'UPDATE' || rawMsg.type === 'SYNC_STATE');
      const tag = (m, audience) => (differs && m ? { ...m, audience } : m);
      const monitorMsg = tag(mapOutputMessageMedia(mapMessagePayload(rawMsg, forMonitor)), 'monitor');
      const liveMsg = differs ? tag(mapOutputMessageMedia(mapMessagePayload(rawMsg, forOutput)), 'live') : monitorMsg;
      const sendBoth = (fn) => { fn(liveMsg); if (differs) fn(monitorMsg); };
      const isMedia = rawMsg && (rawMsg.type === 'MEDIA_PLAY' || rawMsg.type === 'MEDIA_STOP');
      if (channel && !isMedia) sendBoth((m) => channel.postMessage(m));
      sendBoth((m) => {
        const relayMessage = compactRelayMedia(m);
        relaySend(relayMessage);
        if (window.BSPDesktop && typeof window.BSPDesktop.sendWebSocketOutputMessage === 'function') {
          window.BSPDesktop.sendWebSocketOutputMessage(relayMessage).catch(() => {});
        }
      });
      mirrorSyncMessage(liveMsg);
      const desktop = window.BSPDesktop && typeof window.BSPDesktop.sendOutputMessage === 'function' ? window.BSPDesktop : null;
      if (desktop) {
        if (rawMsg && (rawMsg.type === 'UPDATE' || rawMsg.type === 'CLEAR' || rawMsg.type === 'SYNC_STATE')) {
          // The stream feed is the live output; the HDMI main screen is a monitor
          desktop.sendOutputMessage(liveMsg, 'feed').catch(() => {});
          desktop.sendOutputMessage(monitorMsg, 'output').catch(() => {});
          desktop.sendOutputMessage(monitorMsg, 'stage').catch(() => {});
        } else if (rawMsg && (rawMsg.type === 'TEST_PATTERN' || rawMsg.type === 'EXTRA_OVERLAYS')) {
          desktop.sendOutputMessage(rawMsg).catch(() => {});
        } else if (rawMsg && (rawMsg.type === 'MEDIA_PLAY' || rawMsg.type === 'MEDIA_STOP')) {
          desktop.sendOutputMessage(rawMsg, 'feed').catch(() => {});
        } else if (rawMsg && rawMsg.type === 'STAGE_CONFIG') {
          desktop.sendOutputMessage(rawMsg, 'stage').catch(() => {});
        } else if (rawMsg && rawMsg.type === 'CLOCK') {
          desktop.sendOutputMessage(monitorMsg, 'output').catch(() => {});
        }
      }
    }

    // Clock on the monitors (output window and monitor links), never on the stream feed
    const MONITOR_CLOCK_KEY = 'scripturePod.monitorClock.v1';
    let monitorClock = { enabled: false, format: '12', corner: 'tr' };
    try { Object.assign(monitorClock, JSON.parse(localStorage.getItem(MONITOR_CLOCK_KEY) || '{}')); } catch (e) { /* storage unavailable */ }

    function sendMonitorClock() {
      broadcastMessage({ type: 'CLOCK', proto: 1, sender: 'control', ts: Date.now(), enabled: !!monitorClock.enabled, format: monitorClock.format, corner: monitorClock.corner });
    }

    function syncMonitorClockUi() {
      const on = !!monitorClock.enabled;
      const btn = document.getElementById('btn-monitor-clock');
      if (btn) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.textContent = on ? 'Hide clock' : 'Show clock'; }
      const state = document.getElementById('monitor-clock-state');
      if (state) state.textContent = on ? 'On' : 'Off';
      document.getElementById('monitor-clock-12')?.setAttribute('aria-pressed', monitorClock.format === '12' ? 'true' : 'false');
      document.getElementById('monitor-clock-24')?.setAttribute('aria-pressed', monitorClock.format === '24' ? 'true' : 'false');
      const corner = document.getElementById('monitor-clock-corner');
      if (corner && corner.value !== monitorClock.corner) corner.value = monitorClock.corner;
    }

    function saveMonitorClock() {
      try { localStorage.setItem(MONITOR_CLOCK_KEY, JSON.stringify(monitorClock)); } catch (e) { /* storage unavailable */ }
      syncMonitorClockUi();
      sendMonitorClock();
    }

    function toggleMonitorClock() { monitorClock.enabled = !monitorClock.enabled; saveMonitorClock(); }
    function setMonitorClockOption(key, value) { monitorClock[key] = value; saveMonitorClock(); }
    setTimeout(() => { syncMonitorClockUi(); sendMonitorClock(); }, 1500);

    function pingDisplays() {
      if (channel) channel.postMessage({ type: 'PING' });
      relaySend({ type: 'PING' });
    }

    if (channel) {
      channel.onmessage = (e) => {
        handleSyncMessage(e.data || {});
      };
    }
    if (window.BSPDesktop && typeof window.BSPDesktop.onOutputReady === 'function') {
      window.BSPDesktop.onOutputReady(() => {
        markDisplayOnline();
        if (typeof sendMonitorClock === 'function') setTimeout(sendMonitorClock, 400);
        if (typeof queueStandaloneSyncBurst === 'function') queueStandaloneSyncBurst();
      });
    }
    setInterval(pingDisplays, 4000);
    // The app's own output and feed windows are not reached by the pings (they are fed directly),
    // so ask the app whether one is open
    if (window.BSPDesktop && typeof window.BSPDesktop.isOutputOpen === 'function') {
      setInterval(async () => {
        try {
          if (await window.BSPDesktop.isOutputOpen() || await window.BSPDesktop.isFeedOpen()) markDisplayOnline();
          else if (typeof window.BSPDesktop.relayClientCount === 'function') {
            // Any receiver on the relay (OBS source, monitor link, another computer); the panel's own socket is one of them
            const own = typeof relaySocket !== 'undefined' && relaySocket && relaySocket.readyState === WebSocket.OPEN ? 1 : 0;
            if ((await window.BSPDesktop.relayClientCount()) - own > 0) markDisplayOnline();
          }
        } catch (e) { /* bridge unavailable */ }
      }, 3000);
    }

    // Click the Display Online pill: lists which displays are connected
    const displayListState = { timer: null };
    async function collectConnectedDisplays() {
      const B = window.BSPDesktop;
      const rows = [];
      if (!B) return rows;
      const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { return fallback; } };
      if (typeof B.isOutputOpen === 'function' && await safe(() => B.isOutputOpen(), false)) rows.push({ key: 'w:output', label: 'output', name: 'Main screen window', meta: 'This computer', close: () => B.closeOutput() });
      if (typeof B.isFeedOpen === 'function' && await safe(() => B.isFeedOpen(), false)) rows.push({ key: 'w:feed', label: 'feed', name: 'Stream feed window', meta: 'This computer', close: () => B.closeFeed() });
      if (typeof B.isStageOpen === 'function' && await safe(() => B.isStageOpen(), false)) rows.push({ key: 'w:stage', label: 'stage', name: 'Stage display window', meta: 'This computer', close: () => B.closeStage() });
      // The background wall (looping video), with the name of what is playing
      if (typeof B.isWallOpen === 'function' && await safe(() => B.isWallOpen(), false)) {
        rows.push({ key: 'w:wall', label: 'wall', name: 'Wall/LED', meta: typeof bgWall !== 'undefined' && bgWall.playingName ? bgWall.playingName : 'This computer', close: () => stopBgWall() });
      }
      let browserCount = 0;
      if (typeof B.listJoins === 'function') {
        const r = await safe(() => B.listJoins(), null);
        ((r && r.joins) || []).filter((j) => j.live && j.status === 'approved').forEach((j) => {
          browserCount++;
          const role = { monitor: 'Monitor', stage: 'Stage' }[j.role] || 'Live';
          rows.push({ key: 'b:' + j.sid, sid: j.sid, kind: 'browser', role: j.role || 'live', name: j.name || j.ip, meta: `Browser · ${role} · ${j.ip}`, close: () => B.decideJoin({ sid: j.sid, action: 'revoke' }), closeLabel: 'Disconnect' });
        });
      }
      if (typeof B.listDevices === 'function' && typeof connectedDevices !== 'undefined') {
        const devices = await safe(() => B.listDevices(), []);
        (devices || []).filter((d) => connectedDevices.has(d.id)).forEach((d) => rows.push({ key: 'c:' + d.id, kind: 'computer', name: d.name || d.ip, meta: `Computer · ${d.ip}`, close: () => disconnectNetworkDevice(d.id, (loadDeviceCodes()[d.id]) || ''), closeLabel: 'Disconnect' }));
      }
      // Links opened in a browser or in OBS say which link they are: Display, Monitor, Stage or Media
      let linkCount = 0;
      if (typeof B.relayClients === 'function') {
        const LINK_NAMES = { live: 'Display link', monitor: 'Monitor link', stage: 'Stage link', media: 'Media link' };
        const seen = {};
        ((await safe(() => B.relayClients(), [])) || []).filter((c) => !c.sid).forEach((c) => {
          linkCount++;
          seen[c.role] = (seen[c.role] || 0) + 1;
          const label = LINK_NAMES[c.role] || 'Display link';
          rows.push({ key: 'l:' + c.id, kind: 'link', link: true, role: c.role, name: seen[c.role] > 1 ? `${label} ${seen[c.role]}` : label, meta: `Browser or OBS · ${c.ip}` });
        });
      }
      if (typeof B.relayClientCount === 'function') {
        const own = typeof relaySocket !== 'undefined' && relaySocket && relaySocket.readyState === WebSocket.OPEN ? 1 : 0;
        const other = Math.max(0, (await safe(() => B.relayClientCount(), 0)) - own - browserCount - linkCount);
        if (other > 0) rows.push({ name: other === 1 ? 'Another receiver' : `${other} other receivers`, meta: 'OBS source, monitor link or similar' });
      }
      return rows;
    }
    // Screens blacked out one by one: a window gets the message directly, a browser display by its session id
    const blankedDisplays = new Set();
    function setDisplayBlank(row, on) {
      // The wall has its own window and its own blank state
      if (row.label === 'wall' && typeof toggleBgWallBlank === 'function') { if (!!bgWall.blank !== !!on) toggleBgWallBlank(); return; }
      if (on) blankedDisplays.add(row.key); else blankedDisplays.delete(row.key);
      const msg = { type: 'BLANK_SCREEN', proto: 1, sender: 'control', ts: Date.now(), on: !!on };
      if (row.label && window.BSPDesktop && typeof window.BSPDesktop.sendOutputMessage === 'function') {
        window.BSPDesktop.sendOutputMessage(msg, row.label).catch(() => {});
      } else if (row.sid) {
        relaySend({ ...msg, sid: row.sid });
      }
    }
    // Which screen each output is on, and moving one output to another screen without touching the rest
    const OUTPUT_SLOTS = [
      { label: 'output', name: 'Main screen', open: 'openOutput', isOpen: 'isOutputOpen', select: 'output-screen-select', extra: { fullscreen: true } },
      { label: 'feed', name: 'Stream feed', open: 'openFeed', isOpen: 'isFeedOpen', select: 'stream-feed-display', extra: {} },
      { label: 'stage', name: 'Stage display', open: 'openStage', isOpen: 'isStageOpen', select: 'stage-display-screen', extra: {} }
    ];
    function slotScreenId(slot) {
      const rec = screenWatch.opened[slot.label];
      if (rec && rec.arg && rec.arg.displayId != null && rec.arg.displayId !== '') return String(rec.arg.displayId);
      const sel = document.getElementById(slot.select);
      return sel && sel.value && sel.value !== 'auto' ? String(sel.value) : '';
    }
    async function moveOutputToScreen(slot, screenId) {
      const B = window.BSPDesktop;
      if (slot.isWall) { if (screenId) { await setBgWallScreen(screenId); showToast(slot.name + ' moved'); } return; }
      if (!B || typeof B[slot.open] !== 'function' || !screenId) return;
      const sel = document.getElementById(slot.select);
      if (sel) { sel.value = screenId; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      const keep = (screenWatch.opened[slot.label] && screenWatch.opened[slot.label].arg) || {};
      await B[slot.open]({ ...slot.extra, ...keep, displayId: screenId });
      showToast(slot.name + ' moved');
    }
    async function collectScreenSection() {
      const B = window.BSPDesktop;
      if (!B || typeof B.getDisplays !== 'function') return null;
      let screens = [];
      try { screens = (await B.getDisplays()) || []; } catch (e) { return null; }
      const slots = [];
      for (const slot of OUTPUT_SLOTS) {
        let open = false;
        try { open = typeof B[slot.isOpen] === 'function' ? !!(await B[slot.isOpen]()) : false; } catch (e) { /* bridge unavailable */ }
        slots.push({ slot, open, screenId: slotScreenId(slot) });
      }
      // The background wall can be moved too
      if (typeof bgWall !== 'undefined' && typeof B.isWallOpen === 'function') {
        let wallOpen = false;
        try { wallOpen = !!(await B.isWallOpen()); } catch (e) { /* bridge unavailable */ }
        slots.push({ slot: { label: 'wall', name: 'Wall/LED', isWall: true }, open: wallOpen, screenId: String(bgWall.screenId || '') });
      }
      return { screens, slots };
    }
    function renderScreenSection(card, data) {
      if (!data || !data.screens.length) return;
      const wrap = document.createElement('div');
      wrap.className = 'display-list-screens';
      const h = document.createElement('h3');
      h.textContent = 'Screens';
      wrap.appendChild(h);
      data.screens.forEach((scr, i) => {
        const row = document.createElement('div');
        row.className = 'display-list-row';
        const dot = document.createElement('span'); dot.className = 'display-list-dot is-screen';
        const txt = document.createElement('div');
        const n = document.createElement('strong');
        n.textContent = scr.label || ('Screen ' + (i + 1));
        const on = data.slots.filter((x) => x.open && x.screenId === String(scr.id)).map((x) => x.slot.name);
        const m = document.createElement('small');
        m.textContent = `${scr.width}×${scr.height}${scr.isPrimary ? ' · Main' : ''}${scr.isInternal ? ' · Built-in' : ''} · ${on.length ? on.join(', ') : 'nothing on it'}`;
        txt.append(n, m);
        row.append(dot, txt);
        wrap.appendChild(row);
      });
      const h2 = document.createElement('h3');
      h2.textContent = 'Move an output';
      wrap.appendChild(h2);
      data.slots.forEach(({ slot, open, screenId }) => {
        const row = document.createElement('div');
        row.className = 'display-list-move';
        const lab = document.createElement('span');
        lab.textContent = slot.name + (open ? '' : ' (off)');
        const sel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = open ? 'Choose screen…' : 'Open on…';
        sel.appendChild(blank);
        data.screens.forEach((scr, i) => {
          const o = document.createElement('option');
          o.value = String(scr.id);
          o.textContent = scr.label || ('Screen ' + (i + 1));
          sel.appendChild(o);
        });
        sel.value = open ? screenId : '';
        sel.onchange = async () => { if (sel.value) { await moveOutputToScreen(slot, sel.value); setTimeout(renderDisplayList, 400); } };
        row.append(lab, sel);
        wrap.appendChild(row);
      });
      if (typeof window.BSPDesktop.identifyScreens === 'function') {
        const id = document.createElement('button');
        id.type = 'button';
        id.className = 'display-list-identify';
        id.textContent = 'Identify screens';
        id.onclick = () => window.BSPDesktop.identifyScreens();
        wrap.appendChild(id);
      }
      card.appendChild(wrap);
    }
    async function renderDisplayList() {
      const card = document.getElementById('display-list-card');
      if (!card || !card.classList.contains('is-open')) return;
      // Leave a menu alone while it is being used
      if (card.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
      const rows = await collectConnectedDisplays();
      const screenData = await collectScreenSection();
      const isBlanked = (r) => (r.key === 'w:wall' ? !!(typeof bgWall !== 'undefined' && bgWall.blank) : blankedDisplays.has(r.key));
      const sig = JSON.stringify([rows.map((r) => [r.key, r.name, r.meta, isBlanked(r)]), screenData && [screenData.screens.map((x) => x.id), screenData.slots.map((x) => [x.open, x.screenId])]]);
      if (card.dataset.sig === sig) return;
      card.dataset.sig = sig;
      card.textContent = '';
      const h = document.createElement('h3');
      h.textContent = rows.length ? `Connected displays (${rows.length})` : 'No displays connected';
      card.appendChild(h);
      if (!rows.length) {
        const p = document.createElement('p');
        p.textContent = 'Open the output from Outputs, or open a display address in a browser.';
        card.appendChild(p);
      }
      rows.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'display-list-row';
        const dot = document.createElement('span'); dot.className = 'display-list-dot';
        const txt = document.createElement('div');
        const n = document.createElement('strong'); n.textContent = r.name;
        const m = document.createElement('small'); m.textContent = r.meta;
        txt.append(n, m);
        row.append(dot, txt);
        if (r.key) {
          const actions = document.createElement('div');
          actions.className = 'display-list-actions';
          const blanked = isBlanked(r);
          const blank = document.createElement('button');
          blank.type = 'button';
          blank.textContent = blanked ? 'Show' : 'Blank';
          blank.title = blanked ? 'Show this screen again' : 'Black out just this screen';
          blank.onclick = () => { setDisplayBlank(r, !blanked); renderDisplayList(); };
          actions.appendChild(blank);
          if (typeof r.close === 'function') {
            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = r.closeLabel || 'Close';
            close.onclick = () => confirmIfLocked('Close ' + r.name + '?', 'It stops showing on that screen.', async () => { try { await r.close(); } catch (e) { /* already gone */ } blankedDisplays.delete(r.key); setTimeout(renderDisplayList, 300); });
            actions.appendChild(close);
          }
          row.appendChild(actions);
        }
        card.appendChild(row);
      });
      renderScreenSection(card, screenData);
    }
    function setDisplayListOpen(open) {
      let card = document.getElementById('display-list-card');
      if (!card) {
        card = document.createElement('div');
        card.id = 'display-list-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', 'Connected displays');
        document.body.appendChild(card);
      }
      card.classList.toggle('is-open', open);
      delete card.dataset.sig;
      clearInterval(displayListState.timer);
      if (open) {
        const bar = document.getElementById('status-bar').getBoundingClientRect();
        card.style.top = `${Math.round(bar.bottom + 8)}px`;
        card.style.left = `${Math.max(8, Math.min(Math.round(bar.left), window.innerWidth - 328))}px`;
        renderDisplayList();
        displayListState.timer = setInterval(renderDisplayList, 2000);
      }
    }
    (function initDisplayList() {
      const setup = () => {
        const bar = document.getElementById('status-bar');
        if (!bar) return;
        bar.setAttribute('role', 'button');
        bar.setAttribute('tabindex', '0');
        bar.setAttribute('aria-haspopup', 'true');
        const toggle = () => setDisplayListOpen(!document.getElementById('display-list-card')?.classList.contains('is-open'));
        bar.addEventListener('click', toggle);
        bar.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        document.addEventListener('mousedown', (e) => {
          const c = document.getElementById('display-list-card');
          if (!c || !c.classList.contains('is-open') || c.contains(e.target) || e.target.closest('#status-bar')) return;
          setDisplayListOpen(false);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDisplayListOpen(false); });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
    })();

    // When a screen drops: the window on it is closed (so the show never lands on the wrong screen), the
    // operator is told, and the window comes back by itself when the screen does. Browser displays are reported too.
    const screenWatch = { opened: {}, dropped: {}, browsers: {}, busy: false };
    (function wrapScreenWindows() {
      const B = window.BSPDesktop;
      if (!B) return;
      [['openOutput', 'closeOutput', 'output'], ['openFeed', 'closeFeed', 'feed'], ['openStage', 'closeStage', 'stage']].forEach(([open, close, label]) => {
        if (typeof B[open] === 'function') {
          const original = B[open].bind(B);
          B[open] = (arg) => { screenWatch.opened[label] = { open, arg: arg || {} }; delete screenWatch.dropped[label]; return original(arg); };
        }
        if (typeof B[close] === 'function') {
          const original = B[close].bind(B);
          B[close] = (arg) => { if (!screenWatch.closingForDrop) { delete screenWatch.opened[label]; delete screenWatch.dropped[label]; } return original(arg); };
        }
      });
    })();
    const SCREEN_LABELS = { output: 'Live output', feed: 'Monitor feed', stage: 'Stage display' };
    async function checkScreens() {
      const B = window.BSPDesktop;
      if (!B || screenWatch.busy || typeof B.getDisplays !== 'function') return;
      screenWatch.busy = true;
      try {
        const screens = await B.getDisplays();
        const ids = new Set((screens || []).map((d) => String(d.id)));
        const isOpen = { output: B.isOutputOpen, feed: B.isFeedOpen, stage: B.isStageOpen };
        for (const label of Object.keys(screenWatch.opened)) {
          const rec = screenWatch.opened[label];
          const want = rec.arg && rec.arg.displayId != null && rec.arg.displayId !== '' ? String(rec.arg.displayId) : '';
          if (!want || want === 'auto') continue;
          const present = ids.has(want);
          const open = typeof isOpen[label] === 'function' ? await isOpen[label].call(B) : false;
          if (open && !present) {
            screenWatch.closingForDrop = true;
            try { await B[rec.open === 'openOutput' ? 'closeOutput' : rec.open === 'openFeed' ? 'closeFeed' : 'closeStage'](); } finally { screenWatch.closingForDrop = false; }
            screenWatch.dropped[label] = rec;
            showToast(SCREEN_LABELS[label] + ': that screen was disconnected. It reopens when the screen is back.');
          } else if (!open && present && screenWatch.dropped[label]) {
            const again = screenWatch.dropped[label];
            delete screenWatch.dropped[label];
            await B[again.open](again.arg);
            showToast(SCREEN_LABELS[label] + ': the screen is back, reopened.');
          }
        }
        if (typeof B.listJoins === 'function') {
          const r = await B.listJoins();
          const seen = {};
          ((r && r.joins) || []).filter((j) => j.status === 'approved').forEach((j) => {
            seen[j.sid] = true;
            const was = screenWatch.browsers[j.sid];
            const name = j.name || j.ip;
            if (was && was.live && !j.live) showToast('Browser display lost: ' + name);
            else if (was && !was.live && j.live) showToast('Browser display back: ' + name);
            screenWatch.browsers[j.sid] = { live: !!j.live, name };
          });
          Object.keys(screenWatch.browsers).forEach((sid) => { if (!seen[sid]) delete screenWatch.browsers[sid]; });
        }
      } catch (e) { /* the app bridge is not ready */ }
      screenWatch.busy = false;
    }
    setInterval(checkScreens, 4000);

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function scheduleLiveUpdate() {
      if (isRestoringBackup) return;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!isLive || !livePointer) return;
        if (pushLiveUpdate()) return;
        // If tab/context switches made the pointer stale, recover from loaded Bible item.
        if (livePointer.kind === 'bible' && recoverLiveBiblePointerFromCurrentItem()) {
          pushLiveUpdate();
        }
      });
    }

    function postUpdate(payload) {
      if (isRestoringBackup) return;
      const viewport = getEmbeddedDisplayViewport();
      const msg = {
        type: 'UPDATE',
        proto: 1,
        sender: 'control',
        ts: Date.now(),
        seq: nextSeq(),
        displayViewportWidth: viewport.width,
        displayViewportHeight: viewport.height,
        ...payload
      };
      const outputMessage = mapOutputMessageMedia(msg);
      broadcastMessage(outputMessage);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: 'bsp-panel-parent', message: outputMessage }, '*');
        }
      } catch (_) {}
      // A small update (for example background video loop/speed) carries no verse: fold it into
      // the stored state instead of replacing it, or later syncs would send an empty page
      const isPartial = typeof payload.text !== 'string' && !payload.lowerThirdOnly && !payload.restorePrevious;
      const prevLive = lastLiveState && lastLiveState.kind === 'update' ? lastLiveState.payload : null;
      if (isPartial && prevLive) {
        lastLiveState = { kind: 'update', payload: { ...prevLive, ...payload, seq: prevLive.seq } };
        if (embeddedProgramDisplayState.kind === 'update' && embeddedProgramDisplayState.payload) {
          embeddedProgramDisplayState = { kind: 'update', payload: { ...embeddedProgramDisplayState.payload, ...payload, seq: embeddedProgramDisplayState.payload.seq } };
        }
        return;
      }
      embeddedProgramDisplayState = { kind: 'update', payload: forOutput(outputMessage) };
      // Record what is on air first: the standalone output sync below only shows on-air content
      lastLiveState = { kind: 'update', payload: msg };
      if (appState && appState.live) appState.live.lastLiveState = lastLiveState;
      syncEmbeddedProgramDisplay();
      syncStandaloneOutputDirect();
      schedulePersistAppState();
      setProgramMonitorOnAir(true);
      schedulePreviewMonitorRefresh();
      if (sidebarTab === 'schedule') setTimeout(renderFocusedMainPanel, 0);
    }

    function postClear(opts = {}) {
      if (isRestoringBackup) return;
      const msg = {
        type: 'CLEAR',
        proto: 1,
        sender: 'control',
        ts: Date.now(),
        seq: nextSeq()
      };
      if (opts.transitionDuration != null) msg.transitionDuration = opts.transitionDuration;
      if (opts.fade != null) msg.fade = !!opts.fade;
      broadcastMessage(msg);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: 'bsp-panel-parent', message: msg }, '*');
        }
      } catch (_) {}
      embeddedProgramDisplayState = { kind: 'clear' };
      syncEmbeddedProgramDisplay();
      syncStandaloneOutputDirect();
      lastLiveState = { kind: 'clear' };
      if (appState && appState.live) appState.live.lastLiveState = lastLiveState;
      schedulePersistAppState();
      setProgramMonitorOnAir(false);
      schedulePreviewMonitorRefresh();
      if (sidebarTab === 'schedule') setTimeout(renderFocusedMainPanel, 0);
    }


    function captureLiveRenderUiSnapshot() {
      const liveSettingsTab = (livePointer && livePointer.kind === 'songs') ? 'songs' : 'bible';
      const liveProjection = (typeof getProjectionSettingsSnapshotForTab === 'function')
        ? getProjectionSettingsSnapshotForTab(liveSettingsTab)
        : {};
      const pickNumber = (value, fallback) => {
        if (value == null || value === '') return Number(fallback);
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : Number(fallback);
      };
      return {
        fontFamily: liveProjection.fontFamily || document.getElementById('font-family')?.value || '',
        fontWeight: liveProjection.fontWeight || document.getElementById('font-weight')?.value || '700',
        fontSizeFull: pickNumber(liveProjection.fontSizeFull, document.getElementById('font-size-val')?.value || DEFAULT_SONG_FULL_FONT),
        lineHeightFull: pickNumber(liveProjection.lineHeightFull, document.getElementById('line-height-full')?.value || 1.1),
        lineHeightLT: pickNumber(liveProjection.lineHeightLT, document.getElementById('line-height-lt')?.value || 1.1),
        fullRefTextTransform: liveProjection.fullRefTextTransform || document.getElementById('full-ref-text-transform')?.value || fullRefTextTransform || 'uppercase',
        ltRefTextTransform: liveProjection.ltRefTextTransform || document.getElementById('lt-ref-text-transform')?.value || ltRefTextTransform || 'uppercase',
        refFontSize: pickNumber(liveProjection.refFontSize, document.getElementById('ref-font-size-val')?.value || 32),
        refPositionFull: liveProjection.refPositionFull || document.getElementById('ref-position-full')?.value || 'top',
        transitionType: document.getElementById('song-transition-type')?.value || 'fade',
        animateBgTransitions: !!document.getElementById('animate-bg-transitions')?.checked,
        showVersion: liveProjection.showVersion != null ? !!liveProjection.showVersion : !!document.getElementById('show-version')?.checked,
        textColor: liveProjection.textColor || document.getElementById('text-color')?.value || '#FFFFFF',
        refColor: liveProjection.refColor || document.getElementById('ref-color')?.value || '#ffffff',
        refBgColor: liveProjection.refBgColor || document.getElementById('ref-bg-color')?.value || '#FFFFFF',
        showVerseNos: liveProjection.showVerseNos != null ? !!liveProjection.showVerseNos : !!document.getElementById('show-verse-nos')?.checked,
        nameRoleOverlay: {
          enabled: document.getElementById('name-role-overlay-show-btn')?.getAttribute('aria-pressed') === 'true',
          name: String(document.getElementById('name-role-overlay-name')?.value || '').trim(),
          role: String(document.getElementById('name-role-overlay-role')?.value || '').trim(),
          style: getNameRoleOverlayStyle(),
          customDesign: String(document.getElementById('name-role-overlay-design')?.value || '').endsWith('-custom') ? getActiveCustomLtDesign() : null,
        customVars: (String(document.getElementById('name-role-overlay-design')?.value || '').endsWith('-custom') && getActiveCustomLtDesign() && window.SP_LT_EXTRA) ? window.SP_LT_EXTRA.customVars(getActiveCustomLtDesign()) : null,
          primaryColor: document.getElementById('name-role-overlay-primary')?.value || '#90D5FF',
          accentColor: document.getElementById('name-role-overlay-accent')?.value || '#90D5FF',
          logo: document.getElementById('name-role-overlay-logo-preview')?.dataset.logoDataUrl || '',
          nameSize: Number(document.getElementById('name-role-overlay-name-size')?.value || 56),
          roleSize: Number(document.getElementById('name-role-overlay-role-size')?.value || 24),
          logoSize: Number(document.getElementById('name-role-overlay-logo-size')?.value || 128),
          scale: Math.max(50, Math.min(200, Number(document.getElementById('name-role-overlay-scale')?.value) || 100)),
        padL: Math.max(0, Math.min(400, Number(document.getElementById('name-role-overlay-pad-l')?.value) || 0)),
        padR: Math.max(0, Math.min(400, Number(document.getElementById('name-role-overlay-pad-r')?.value) || 0)),
          offsetX: Math.max(-40, Math.min(40, Number(document.getElementById('name-role-overlay-offset-x')?.value) || 0)),
          offsetY: Math.max(-40, Math.min(40, Number(document.getElementById('name-role-overlay-offset-y')?.value) || 0))
        },
        autoResizeFull: liveProjection.autoResizeFull || document.getElementById('auto-resize-full')?.value || 'shrink',
        autoResizeLT: liveProjection.autoResizeLT || document.getElementById('auto-resize-lt')?.value || 'shrink',
        ltWidthPct: pickNumber(liveProjection.ltWidthPct, document.getElementById('lt-width-pct')?.value || 100),
        ltScalePct: pickNumber(liveProjection.ltScalePct, document.getElementById('lt-scale-pct')?.value || 100),
        ltOffsetX: pickNumber(liveProjection.ltOffsetX, document.getElementById('lt-offset-x')?.value || 0),
        ltOffsetY: pickNumber(liveProjection.ltOffsetY, document.getElementById('lt-offset-y')?.value || 0),
        ltBorderRadius: pickNumber(liveProjection.ltBorderRadius, document.getElementById('lt-border-radius')?.value || 0),
        padLR: pickNumber(document.getElementById('pad-lr-lt')?.value, 5),
        padLRFull: pickNumber(document.getElementById('pad-lr-full')?.value, 5),
        padLRLT: pickNumber(document.getElementById('pad-lr-lt')?.value, 5)
      };
    }

    function pushLiveUpdate(opts = {}) {
      if (typeof normalizeDualVersionIds === 'function') normalizeDualVersionIds();
      const previewOnly = opts.previewOnly === true;
      const missingVersions = getMissingBibleVersionsInUse();
      if (missingVersions.length) {
        if (previewOnly) {
          // Preview is not on air: show it now, refresh once the version is in
          ensureBiblesLoaded(missingVersions).then(() => { refreshAfterBibleLoad(); schedulePreviewMonitorRefresh(); });
        } else {
          ensureBiblesLoaded(missingVersions).then(() => { refreshAfterBibleLoad(); pushLiveUpdate(opts); });
          return true;
        }
      }
      if (!previewOnly && document.getElementById('btn-preview')?.getAttribute('aria-pressed') === 'true') return false;
      if ((!isLive && !previewOnly) || !livePointer) return false;
      if (!previewOnly) hideLiveLowerThirds();
      const effectiveLiveLinesPerPage = Math.max(1, Number(liveLinesPerPage) || Number(linesPerPage) || 1);
      const liveBgState = getEffectiveLiveBackgroundState();
      const effectiveLiveRatio = liveRatio || activeRatio || 'full';
      const liveTextTransforms = getEffectiveLiveTextTransformState();
      const ui = captureLiveRenderUiSnapshot();
      const activeFullRefTextTransform = ui.fullRefTextTransform || 'uppercase';
      const activeLtRefTextTransform = ui.ltRefTextTransform || 'uppercase';
      let liveItem = null;
      if (livePointer.source === 'schedule') {
        liveItem = schedule[livePointer.index];
      } else if (livePointer.kind === 'bible') {
        liveItem = (bibles[livePointer.version] ? bibles[livePointer.version][livePointer.index] : null);
      } else {
        liveItem = songs[livePointer.index];
      }
      if (!liveItem) return false;
      const pages = getPagesFromItem(liveItem, livePointer.kind === 'bible', effectiveLiveLinesPerPage);
      if (!pages.length) return false;
      liveLineCursor = Math.max(0, Math.min(liveLineCursor, pages.length - 1));
      const p = pages[liveLineCursor]; if (!p) return false;
      const mode = effectiveLiveRatio;
      const fontFamily = ui.fontFamily;
      const fontWeight = ui.fontWeight;
      const scheduleFontOverride = (livePointer.source === 'schedule' && liveItem && Number.isFinite(liveItem.fontSizeSnapshot))
        ? Number(liveItem.fontSizeSnapshot)
        : null;
      let fontSizeFull = (scheduleFontOverride != null)
        ? scheduleFontOverride
        : ui.fontSizeFull;
      const fontSizeLT = (mode === 'custom') ? ltFontCustom : ((liveKind === 'bible') ? ltFontBible : ltFontSongs);
      const lineHeightFull = ui.lineHeightFull;
      const lineHeightLT = ui.lineHeightLT;
      const refFontSize = ui.refFontSize;
      const refPositionFull = ui.refPositionFull;
      const refAlignFull = fullRefHAlign || 'center';
      const verseAlignFull = fullHAlign || 'center';
      const bgEnabled = !!liveBgState.bgEnabled;
      const bgType = liveBgState.bgType || 'color';
      const bgOpacity = Number.isFinite(liveBgState.bgOpacity) ? liveBgState.bgOpacity : 1;
      const bgY = Number(liveBgState.bgY || 0);
      const bgColor = liveBgState.bgColor || '#000000';
      bgGradientShadow = liveBgState.bgGradientShadow || '#AD0000';
      bgGradientHighlight = liveBgState.bgGradientHighlight || '#000000';
      const bgModeValue = liveBgState.bgMode || bgMode;
      const bgImage = liveBgState.bgImage || null;
      const bgVideo = liveBgState.bgVideo || null;
      const bgVideoLoop = !!liveBgState.bgVideoLoop;
      const bgVideoSpeed = Number.isFinite(liveBgState.bgVideoSpeed) ? liveBgState.bgVideoSpeed : 1;
      const bgBlur = Number.isFinite(liveBgState.bgBlur) ? liveBgState.bgBlur : 0;
      const bgEdgeFix = !!liveBgState.bgEdgeFix;
      const transitionType = ui.transitionType;
      const transitionDuration = getCurrentTransitionDuration();
      const animateBgTransitions = ui.animateBgTransitions;
      const outputBackgroundMedia = bgEnabled
        ? (bgType === 'video' ? bgVideo : (bgType === 'image' ? bgImage : null))
        : null;
      if (!previewOnly && window.BSPDesktop && typeof window.BSPDesktop.cacheBackgroundMedia === 'function' &&
          typeof outputBackgroundMedia === 'string' &&
          outputBackgroundMedia.startsWith('data:') &&
          !backgroundMediaUrlCache.has(outputBackgroundMedia)) {
        cacheBackgroundMediaForOutput(outputBackgroundMedia).catch((error) => {
          console.error('Live background registration failed', error);
          showToast('Background media could not be prepared for display');
        });
        return false;
      }
      const textXRaw = 0;
      const textYRaw = 1080;
      const padLRFullRaw = Number.isFinite(ui.padLRFull) ? ui.padLRFull : (Number.isFinite(ui.padLR) ? ui.padLR : 5);
      const padLRLTRaw = Number.isFinite(ui.padLRLT) ? ui.padLRLT : (Number.isFinite(ui.padLR) ? ui.padLR : 5);
      const padBRaw = 0;
      const showVersion = ui.showVersion;
      const textColor = ui.textColor;
      const refColor = ui.refColor;
      const refBgColor = ui.refBgColor;
      const verseShadowStyle = verseShadowEnabled ?
        'text-shadow:0 10px 28px rgba(0,0,0,0.55);' :
        'text-shadow:none;';
      const showVerseNos = ui.showVerseNos;
      let verseRaw = p.text;
      if (!showVerseNos) {
        verseRaw = verseRaw.replace(/<span class="jo-verse-sup">.*?<\/span>\s*/g, '');
      }
      let verseHtml = convertHighlightsToHtml(verseRaw);

      let fontSizeAdjusted = fontSizeLT;
      let lineHeightAdjusted = lineHeightLT;
      let fontSizeFullAdjusted = fontSizeFull;
      let lineHeightFullAdjusted = lineHeightFull;
      const useCustomStyle = effectiveLiveRatio === 'custom';
      const baseStyle = ltStyles[ltStyle] || ltStyles['custom'] || {};
      const pendingChanges = (tempStyleChanges && editingStyleId === ltStyle) ? tempStyleChanges : null;
      const styleData = useCustomStyle
        ? (pendingChanges ? { ...baseStyle, ...pendingChanges } : baseStyle)
        : (ltStyles['custom'] || {});
      const autoResize = (useCustomStyle && styleData.autoResize) ? styleData.autoResize : 'none';
      const autoResizeFull = ui.autoResizeFull;
      const autoResizeLT = ui.autoResizeLT;
      const textX = useCustomStyle ? 0 : textXRaw;
      const textY = useCustomStyle ? 860 : textYRaw;
      const padLRFull = useCustomStyle ? 0 : padLRFullRaw;
      const padLRLT = useCustomStyle ? 0 : padLRLTRaw;
      const padLR = mode === 'full' ? padLRFull : padLRLT;
      const padB = useCustomStyle ? 0 : padBRaw;
      const verseCount = p.verseCount || 1;
      const longVerseSourceFontSize = scheduleFontOverride ?? fontSizeFull;
      const primaryRawText = p.raw || '';
      let dynamicHeight = getLtBgHeightPct(verseCount);
      let dualSecondaryRaw = '';
      const storedDualSnapshot = (liveItem && liveItem.dualSnapshot) ? liveItem.dualSnapshot : null;
      const globalDualActive = dualVersionModeEnabled && !!dualVersionSecondaryId && !useCustomStyle &&
        livePointer.kind === 'bible';
      const isStoredDualActive = !!storedDualSnapshot;
      const dualActive = isStoredDualActive || globalDualActive;
      const shouldAutoReduceForDual = globalDualActive && !isStoredDualActive && livePointer.source !== 'schedule';
      const dualMeasurementRaw = shouldAutoReduceForDual
        ? resolveDualSecondaryRawForMeasurement(storedDualSnapshot, dualVersionSecondaryId, livePointer, liveLineCursor, liveItem)
        : '';
      const prefitDualSecondaryRaw = dualMeasurementRaw || (storedDualSnapshot ? (storedDualSnapshot.raw || '') : '');
      const singleBibleFullMaxFont = (typeof SINGLE_BIBLE_FULL_MAX_FONT === 'number') ? SINGLE_BIBLE_FULL_MAX_FONT : 60;
      const singleBibleLtMaxFont = (typeof SINGLE_BIBLE_LT_MAX_FONT === 'number') ? SINGLE_BIBLE_LT_MAX_FONT : 30;
      const dualBibleFullMaxFont = (typeof DUAL_BIBLE_FULL_MAX_FONT === 'number') ? DUAL_BIBLE_FULL_MAX_FONT : 37;
      const dualBibleLtMaxFont = (typeof DUAL_BIBLE_LT_MAX_FONT === 'number') ? DUAL_BIBLE_LT_MAX_FONT : 23;
      const ltRefSize = ltRefFontSize || refFontSize;
      const allowLtRefBg = true;
      const ltRefAlignValue = (ltHAlignBible === 'justify')
        ? 'left'
        : (['left', 'right', 'center'].includes(ltHAlignBible) ? ltHAlignBible : 'center');

      if (autoResize !== 'none' && mode !== 'full') {
        const lines = (p.raw || "").split('\n').length;
        if (autoResize === 'shrink' && lines > 2) {
          fontSizeAdjusted = Math.max(24, fontSizeLT - (lines - 2) * 3);
          lineHeightAdjusted = Math.max(1.0, lineHeightLT - (lines - 2) * 0.1);
        } else if (autoResize === 'grow' && lines < 2) {
          fontSizeAdjusted = Math.min(80, fontSizeLT + (2 - lines) * 5);
        }
      }

      if (mode !== 'full' && livePointer.kind === 'bible') {
        const bibleLtMaxFont = dualActive ? dualBibleLtMaxFont : singleBibleLtMaxFont;
        fontSizeAdjusted = Math.min(fontSizeAdjusted, bibleLtMaxFont);
      }

      const isBibleLtVerse = livePointer && livePointer.kind === 'bible';
      const activeBibleContent = getIsBibleItem(currentItem) || (livePointer && livePointer.kind === 'bible');
      const shouldAutoExpandBibleLtHeight = !useCustomStyle &&
        mode !== 'full' &&
        effectiveLiveLinesPerPage <= 4 &&
        isBibleLtVerse &&
        activeBibleContent;
      if (shouldAutoExpandBibleLtHeight) {
        const baseWidth = (styleCanvasBaseSize && styleCanvasBaseSize.width) ? styleCanvasBaseSize.width : 1920;
        const padValue = Number.isFinite(ui.padLRLT) ? ui.padLRLT : ui.padLR;
        const sidePadPct = Math.max(0, Math.min(45, padValue));
        const textWidthPx = Math.max(240, (baseWidth * (1 - (2 * (sidePadPct / 100)))) - 20);
        const displayLines = estimateWrappedLineCount(getAutoResizeMeasureText(p.raw, true), textWidthPx, fontSizeAdjusted, fontFamily, fontWeight);
        const targetLines = Math.max(effectiveLiveLinesPerPage, displayLines);
        dynamicHeight = Math.max(dynamicHeight, calculateLtHeightPctFromLines(targetLines));
      }
      if (dualActive && mode !== 'full' && prefitDualSecondaryRaw) {
        const dualLines = getDualModeLineTarget(primaryRawText, prefitDualSecondaryRaw);
        const dualHeightPct = calculateLtHeightPctFromLines(dualLines, 2);
        dynamicHeight = Math.max(dynamicHeight, dualHeightPct);
      }
      if (!useCustomStyle && mode !== 'full' && autoResizeLT !== 'none') {
        const baseWidth = (styleCanvasBaseSize && styleCanvasBaseSize.width) ? styleCanvasBaseSize.width : 1920;
        const baseHeight = (styleCanvasBaseSize && styleCanvasBaseSize.height) ? styleCanvasBaseSize.height : 1080;
        const isBibleLT = livePointer.kind === 'bible';
        const ltText = getAutoResizeMeasureText(p.raw, isBibleLT);
        const sidePadPct = isBibleLT ? (padLRLT || 0) : (padLRLT || 5);
        const maxWidthPx = Math.max(240, (baseWidth * (1 - (2 * sidePadPct / 100))) - 20);
        const ltHeightPx = Math.max(120, baseHeight * (dynamicHeight / 100));
        const availableHeightPx = Math.max(120, ltHeightPx - 20);
        const minSize = 18;
        const maxSize = isBibleLT
          ? (dualActive ? dualBibleLtMaxFont : singleBibleLtMaxFont)
          : 120;
        const fitsAt = (sizePt) => {
          const lines = estimateWrappedLineCount(ltText, maxWidthPx, sizePt, fontFamily, fontWeight);
          const height = estimateFullTextHeightPx(lines, sizePt, lineHeightAdjusted, isBibleLT, refFontSize);
          return height <= availableHeightPx;
        };
        if (autoResizeLT === 'shrink') {
          if (!fitsAt(fontSizeAdjusted)) {
            let lo = minSize;
            let hi = Math.max(minSize, Math.floor(fontSizeAdjusted));
            let best = null;
            while (lo <= hi) {
              const mid = Math.floor((lo + hi) / 2);
              if (fitsAt(mid)) {
                best = mid;
                lo = mid + 1;
              } else {
                hi = mid - 1;
              }
            }
            fontSizeAdjusted = Math.max(minSize, best != null ? best : minSize);
          }
        } else if (autoResizeLT === 'grow') {
          let lo = minSize;
          let hi = Math.floor(maxSize);
          let best = null;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (fitsAt(mid)) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          if (best != null) {
            fontSizeAdjusted = Math.max(minSize, best);
          } else {
            fontSizeAdjusted = minSize;
          }
        }
      }

      const isBibleFull = (mode === 'full') && livePointer.kind === 'bible';
      const longVerseFullKey = isBibleFull ? `${livePointer.version}#${liveLineCursor}` : null;
      if (mode === 'full') {
        const baseWidth = (styleCanvasBaseSize && styleCanvasBaseSize.width) ? styleCanvasBaseSize.width : 1920;
        const baseHeight = (styleCanvasBaseSize && styleCanvasBaseSize.height) ? styleCanvasBaseSize.height : 1080;
        const fullText = getAutoResizeMeasureText(p.raw, isBibleFull);
        const dualFullText = dualMeasurementRaw
          || ((storedDualSnapshot && storedDualSnapshot.raw) ? getAutoResizeMeasureText(storedDualSnapshot.raw, true) : '');
        // Match the 20px horizontal margins used in full-screen HTML.
        const maxWidthPx = Math.max(320, baseWidth - 40);
        handleLongVerseFullFontState(false, longVerseFullKey, 0.8, longVerseSourceFontSize);
        fontSizeFull = Number(document.getElementById('font-size-val').value || DEFAULT_BIBLE_FULL_FONT);
        if (isBibleFull) {
          const bibleFullMaxFont = dualActive ? dualBibleFullMaxFont : singleBibleFullMaxFont;
          fontSizeFull = Math.min(fontSizeFull, bibleFullMaxFont);
        }
        fontSizeFullAdjusted = fontSizeFull;
        const availableHeightPx = Math.max(200, baseHeight - 40);
        const minSize = 24;
        const maxSize = isBibleFull
          ? (dualActive ? dualBibleFullMaxFont : singleBibleFullMaxFont)
          : 200;
        const isDualFull = !!(dualActive && dualFullText);
        const measureFullHeightAt = (sizePt) => {
          const primaryLines = estimateWrappedLineCount(fullText, maxWidthPx, sizePt, fontFamily, fontWeight);
          const primaryHeight = estimateFullTextHeightPx(primaryLines, sizePt, lineHeightFull, isBibleFull, refFontSize);
          if (!isDualFull) return primaryHeight;
          const secondaryLines = estimateWrappedLineCount(dualFullText, maxWidthPx, sizePt, fontFamily, fontWeight);
          const secondaryHeight = estimateFullTextHeightPx(secondaryLines, sizePt, lineHeightFull, true, refFontSize);
          const dualSeparatorHeightPx = Math.max(24, sizePt * (96 / 72) * 0.9);
          return primaryHeight + secondaryHeight + dualSeparatorHeightPx;
        };
        if (autoResizeFull === 'shrink') {
          const fitsAt = (sizePt) => {
            return measureFullHeightAt(sizePt) <= availableHeightPx;
          };
          if (!fitsAt(fontSizeFull)) {
            let lo = minSize;
            let hi = Math.floor(fontSizeFull);
            let best = null;
            while (lo <= hi) {
              const mid = Math.floor((lo + hi) / 2);
              if (fitsAt(mid)) {
                best = mid;
                lo = mid + 1;
              } else {
                hi = mid - 1;
              }
            }
            fontSizeFullAdjusted = Math.max(minSize, best != null ? best : minSize);
          }
        } else if (autoResizeFull === 'grow') {
          const fitsAt = (sizePt) => {
            return measureFullHeightAt(sizePt) <= availableHeightPx;
          };
          let lo = minSize;
          let hi = Math.floor(maxSize);
          let best = null;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (fitsAt(mid)) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          if (best != null) {
            fontSizeFullAdjusted = Math.max(minSize, best);
          } else {
            fontSizeFullAdjusted = minSize;
          }
        }
      } else {
        handleLongVerseFullFontState(false, longVerseFullKey);
      }

      let bibleVer = '';
      let songTextPair = null;
      if (livePointer.kind === 'bible') {
        let bibleRef = getBibleRefForPage(liveItem, p.raw, p.verseCount);
        bibleVer = formatBibleVersionLabel(liveItem.version || "");
        if (livePointer.source === 'schedule' && liveItem && typeof liveItem.title === 'string') {
          const suffix = liveItem.version ? ` (${formatBibleVersionLabel(liveItem.version)})` : '';
          const baseTitle = liveItem.title.replace(/\s*\([^)]*\)\s*$/, '');
          bibleRef = baseTitle.trim() || bibleRef;
          if (suffix && bibleRef.endsWith(suffix)) {
            bibleVer = '';
          }
        }
        const verText = (showVersion && bibleVer) ? ` (${bibleVer})` : "";
        const referenceLabel = `${bibleRef}${verText}`;
        const ltRefSize = ltRefFontSize || refFontSize;
        const allowLtRefBg = true;
        const ltRefAlignValue = (ltHAlignBible === 'justify')
          ? 'left'
          : (['left', 'right', 'center'].includes(ltHAlignBible) ? ltHAlignBible : 'center');

        let primarySegment = '';
        if (mode === 'full') {
          primarySegment = buildFullBibleSegment({
            referenceLabel,
            verseHtml,
            refSize: refFontSize,
            refColor,
            refBgColor,
            verseAlign: verseAlignFull,
            refAlign: refAlignFull,
            verseShadowStyle,
            refPosition: refPositionFull,
            refTextTransform: activeFullRefTextTransform
          });
        } else if (useCustomStyle) {
          primarySegment = `<div class="jo-body" style="padding-left:60px;${verseShadowStyle}">${verseHtml}</div>`;
        } else {
          primarySegment = buildLtBibleSegment({
            referenceLabel,
            verseHtml,
            refSize: ltRefSize,
            refColor,
            refBgColor,
            alignValue: ltRefAlignValue,
            verseShadowStyle,
            allowBackground: allowLtRefBg,
            padding: '3px 16px',
            borderRadius: '5px',
            refTextTransform: activeLtRefTextTransform
          });
        }
        outHtml = primarySegment;
      } else {
        songTextPair = getProjectedSongTextPair(liveItem, liveLineCursor, effectiveLiveLinesPerPage);
        const songPrimaryHtml = songTextPair.primaryHtml || verseHtml;
        if (mode !== 'full' && useCustomStyle) {
          outHtml = `<div class="jo-body" style="padding-left:60px;${verseShadowStyle}">${songPrimaryHtml}</div>`;
        } else if (mode === 'full') {
          outHtml = `<div class="jo-body" style="text-align:center;${verseShadowStyle}">${songPrimaryHtml}</div>`;
        } else {
          outHtml = `<div class="jo-body" style="${verseShadowStyle}">${songPrimaryHtml}</div>`;
        }
      }
      let dualSectionHtml = '';
      if (dualActive) {
        let secondarySegment = '';
        if (storedDualSnapshot) {
          dualSecondaryRaw = storedDualSnapshot.raw || '';
          const secondaryLabel = storedDualSnapshot.referenceLabel || '';
          const secondaryText = storedDualSnapshot.text || '';
          secondarySegment = (mode === 'full')
            ? buildFullBibleSegment({
              referenceLabel: secondaryLabel,
              verseHtml: secondaryText,
              refSize: refFontSize,
              refColor,
              refBgColor,
              verseAlign: verseAlignFull,
              refAlign: refAlignFull,
              verseShadowStyle,
              refPosition: refPositionFull,
              refTextTransform: activeFullRefTextTransform
            })
            : buildLtBibleSegment({
              referenceLabel: secondaryLabel,
              verseHtml: secondaryText,
              refSize: ltRefSize,
              refColor,
              refBgColor,
              alignValue: ltRefAlignValue,
              verseShadowStyle,
              allowBackground: allowLtRefBg,
              padding: '3px 16px',
              borderRadius: '5px',
              refTextTransform: activeLtRefTextTransform
            });
        } else {
          const secondaryList = bibles[dualVersionSecondaryId];
          const chapterIndexForSecondary = getDualBibleChapterIndex(liveItem, livePointer);
          const secondaryItem = (secondaryList && chapterIndexForSecondary != null)
            ? secondaryList[chapterIndexForSecondary]
            : (secondaryList ? secondaryList[livePointer.index] : null);
          if (secondaryItem) {
            const secondaryPages = getPagesFromItem(secondaryItem, true, effectiveLiveLinesPerPage);
            const secondaryPage = secondaryPages[Math.min(liveLineCursor, Math.max(0, secondaryPages.length - 1))] || secondaryPages[0];
            if (secondaryPage) {
              dualSecondaryRaw = secondaryPage.raw || '';
              let secondText = secondaryPage.text;
              if (!showVerseNos) {
                secondText = secondText.replace(/<span class="jo-verse-sup">.*?<\/span>\s*/g, '');
              }
              secondText = convertHighlightsToHtml(secondText);
              const secondaryRef = getBibleRefForPage(secondaryItem, secondaryPage.raw, secondaryPage.verseCount);
              const secondaryVersionLabel = formatBibleVersionLabel(secondaryItem.version || "");
              const secondaryVerText = (showVersion && secondaryVersionLabel) ? ` (${secondaryVersionLabel})` : "";
              const secondaryLabel = `${secondaryRef}${secondaryVerText}`;
              secondarySegment = (mode === 'full')
                ? buildFullBibleSegment({
                  referenceLabel: secondaryLabel,
                  verseHtml: secondText,
                  refSize: refFontSize,
                  refColor,
                  refBgColor,
                  verseAlign: verseAlignFull,
                  refAlign: refAlignFull,
                  verseShadowStyle,
                  refPosition: refPositionFull,
                  refTextTransform: activeFullRefTextTransform
                })
                : buildLtBibleSegment({
                  referenceLabel: secondaryLabel,
                  verseHtml: secondText,
                  refSize: ltRefSize,
                  refColor,
                  refBgColor,
                  alignValue: ltRefAlignValue,
                  verseShadowStyle,
                  allowBackground: allowLtRefBg,
                  padding: '3px 16px',
                  borderRadius: '5px',
                  refTextTransform: activeLtRefTextTransform
                });
            }
          }
        }
        if (secondarySegment) {
          dualSectionHtml = `<div class="dual-secondary-wrapper">${secondarySegment}</div>`;
        }
      }
      // tertiary support (display a third version underneath secondary)
      let tertiarySectionHtml = '';
      const storedTertiarySnapshot = (liveItem && liveItem.tertiarySnapshot) ? liveItem.tertiarySnapshot : null;
      const globalTertiaryActive = dualVersionModeEnabled && !!dualVersionTertiaryId && !useCustomStyle && livePointer.kind === 'bible';
      if (globalTertiaryActive || storedTertiarySnapshot) {
        let tertiarySegment = '';
        if (storedTertiarySnapshot) {
          const tertiaryRaw = storedTertiarySnapshot.raw || '';
          const tertiaryLabel = storedTertiarySnapshot.referenceLabel || '';
          const tertiaryText = storedTertiarySnapshot.text || '';
          tertiarySegment = (mode === 'full')
            ? buildFullBibleSegment({
              referenceLabel: tertiaryLabel,
              verseHtml: tertiaryText,
              refSize: refFontSize,
              refColor,
              refBgColor,
              verseAlign: verseAlignFull,
              refAlign: refAlignFull,
              verseShadowStyle,
              refPosition: refPositionFull,
              refTextTransform: activeFullRefTextTransform
            })
            : buildLtBibleSegment({
              referenceLabel: tertiaryLabel,
              verseHtml: tertiaryText,
              refSize: ltRefSize,
              refColor,
              refBgColor,
              alignValue: ltRefAlignValue,
              verseShadowStyle,
              allowBackground: allowLtRefBg,
              padding: '3px 16px',
              borderRadius: '5px',
              refTextTransform: activeLtRefTextTransform
            });
        } else {
          const tertiaryList = bibles[dualVersionTertiaryId];
          const chapterIndexForTertiary = getDualBibleChapterIndex(liveItem, livePointer);
          const tertiaryItem = (tertiaryList && chapterIndexForTertiary != null)
            ? tertiaryList[chapterIndexForTertiary]
            : (tertiaryList ? tertiaryList[livePointer.index] : null);
          if (tertiaryItem) {
            const tertiaryPages = getPagesFromItem(tertiaryItem, true, effectiveLiveLinesPerPage);
            const tertiaryPage = tertiaryPages[Math.min(liveLineCursor, Math.max(0, tertiaryPages.length - 1))] || tertiaryPages[0];
            if (tertiaryPage) {
              let thirdText = tertiaryPage.text;
              if (!showVerseNos) {
                thirdText = thirdText.replace(/<span class="jo-verse-sup">.*?<\/span>\s*/g, '');
              }
              thirdText = convertHighlightsToHtml(thirdText);
              const tertiaryRef = getBibleRefForPage(tertiaryItem, tertiaryPage.raw, tertiaryPage.verseCount);
              const tertiaryVersionLabel = formatBibleVersionLabel(tertiaryItem.version || "");
              const tertiaryVerText = (showVersion && tertiaryVersionLabel) ? ` (${tertiaryVersionLabel})` : "";
              const tertiaryLabel = `${tertiaryRef}${tertiaryVerText}`;
              tertiarySegment = (mode === 'full')
                ? buildFullBibleSegment({
                  referenceLabel: tertiaryLabel,
                  verseHtml: thirdText,
                  refSize: refFontSize,
                  refColor,
                  refBgColor,
                  verseAlign: verseAlignFull,
                  refAlign: refAlignFull,
                  verseShadowStyle,
                  refPosition: refPositionFull,
                  refTextTransform: activeFullRefTextTransform
                })
                : buildLtBibleSegment({
                  referenceLabel: tertiaryLabel,
                  verseHtml: thirdText,
                  refSize: ltRefSize,
                  refColor,
                  refBgColor,
                  alignValue: ltRefAlignValue,
                  verseShadowStyle,
                  allowBackground: allowLtRefBg,
                  padding: '3px 16px',
                  borderRadius: '5px',
                  refTextTransform: activeLtRefTextTransform
                });
            }
          }
        }
        if (tertiarySegment) {
          tertiarySectionHtml = `<div class="triple-tertiary-wrapper">${tertiarySegment}</div>`;
        }
      }
      if (dualSectionHtml) {
        outHtml = `<div class="dual-primary-block">${outHtml}</div>${dualSectionHtml}${tertiarySectionHtml}`;
      }
      const payload = {
        text: outHtml,
        mode,
        isBible: livePointer.kind === 'bible',
        fontFamily,
        fontWeight,
        fontSizeFull: fontSizeFullAdjusted,
        fontSizeLT: fontSizeAdjusted,
        lineHeightFull: lineHeightFullAdjusted,
        lineHeightLT: lineHeightAdjusted,
        ltWidthPct: ui.ltWidthPct,
        ltScalePct: ui.ltScalePct,
        ltOffsetX: ui.ltOffsetX,
        ltOffsetY: ui.ltOffsetY,
        ltBorderRadius: ui.ltBorderRadius,
        linesPerPage: effectiveLiveLinesPerPage,
        ltBgHeightPct: dynamicHeight,
        bgEnabled,
        bgType,
        bgColor,
        bgMode: bgModeValue,
        bgGradientShadow,
        bgGradientHighlight,
        bgGradientAngle: liveBgState.bgGradientAngle || 135,
        bgGradientShape: liveBgState.bgGradientShape || 'radial',
        bgImage,
        bgVideo,
        bgVideoLoop,
        bgVideoSpeed,
        bgOpacity,
        bgBlur,
        bgEdgeFix,
        bgY,
        textX,
        textY,
        padLR,
        padLRFull,
        padLRLT,
        padB,
        fullTextTransform: liveTextTransforms.full || 'uppercase',
        ltTextTransform: liveTextTransforms.lt || 'uppercase',
        ltStyle: useCustomStyle ? ltStyle : 'custom',
        styleData: useCustomStyle ? styleData : null,
        customFonts,
        transitionType,
        transitionDuration,
        animateBgTransitions,
        textColor,
        bibleRef: livePointer.kind === 'bible' ? getBibleRefForPage(liveItem, p.raw, p.verseCount) : '',
        bibleVersion: (showVersion && livePointer.kind === 'bible') ? bibleVer : '',
        verseCount: p.verseCount || 0,
        stage: buildStageInfo(liveItem, liveLineCursor, effectiveLiveLinesPerPage, p),
        lineCount: (p.raw || "").split('\n').length,
        autoAdjustLtHeight: autoAdjustLtHeight,
        hAlignFull: fullHAlign,
        vAlignFull: fullVAlign,
        // Lower third alignment (songs and bible variants)
        hAlignLT: ltHAlignSongs,
        vAlignLT: ltVAlignSongs,
        ltAnchorMode,
        hAlignLTBible: ltHAlignBible,
        vAlignLTBible: ltVAlignBible,
        hAlignLTBibleVerse: ltHAlignBibleVerse,
        autoResizeFull: ui.autoResizeFull || 'none',
        refPositionFull: refPositionFull,
        autoResizeLT: autoResizeLT,
        dualVersionMode: !!dualSectionHtml,
        dualVersionSecondaryId: dualVersionSecondaryId || null,
        dualVersionTertiaryId: dualVersionTertiaryId || null,
        dualVersionPrimaryId: (livePointer.kind === 'bible') ? livePointer.version : null,
        nameRoleOverlay: ui.nameRoleOverlay
      };
      if (previewOnly) return sendProgramPreview(payload);
      postUpdate(payload);
      return true;
    }
