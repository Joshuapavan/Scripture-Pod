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
      }, 3000);
    }

    function updateProgramDisplayStatus() {
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

    function toggleLowerThirdSettingsPanel(panelId) {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      setLowerThirdSettingsPanelCollapsed(panelId, !panel.classList.contains('is-collapsed'));
    }

    function getNameRoleOverlaySettings(enabled) {
      return {
        enabled: !!enabled,
        name: String(document.getElementById('name-role-overlay-name')?.value || '').trim(),
        role: String(document.getElementById('name-role-overlay-role')?.value || '').trim(),
        style: getNameRoleOverlayStyle(),
        primaryColor: document.getElementById('name-role-overlay-primary')?.value || '#90D5FF',
        accentColor: document.getElementById('name-role-overlay-accent')?.value || '#90D5FF',
        logo: document.getElementById('name-role-overlay-logo-preview')?.dataset.logoDataUrl || '',
        logoColor: document.getElementById('name-role-overlay-logo-color')?.value || 'white',
        nameSize: Number(document.getElementById('name-role-overlay-name-size')?.value || 56),
        roleSize: Number(document.getElementById('name-role-overlay-role-size')?.value || 24),
        logoSize: Number(document.getElementById('name-role-overlay-logo-size')?.value || 128),
        offsetX: Math.max(-40, Math.min(40, Number(document.getElementById('name-role-overlay-offset-x')?.value) || 0)),
        offsetY: Math.max(-40, Math.min(40, Number(document.getElementById('name-role-overlay-offset-y')?.value) || 0))
      };
    }

    function getSocialEngagementOverlaySettings(enabled) {
      return {
        enabled: !!enabled,
        socials: {
          instagram: String(document.getElementById('social-engagement-instagram')?.value || '').trim(),
          facebook: String(document.getElementById('social-engagement-facebook')?.value || '').trim(),
          website: String(document.getElementById('social-engagement-website')?.value || '').trim()
        },
        primaryColor: document.getElementById('social-engagement-primary')?.value || '#90D5FF',
        accentColor: document.getElementById('social-engagement-accent')?.value || '#90D5FF',
        size: Number(document.getElementById('social-engagement-size')?.value || 32),
        offsetX: Math.max(-40, Math.min(40, Number(document.getElementById('social-engagement-offset-x')?.value) || 0)),
        offsetY: Math.max(-40, Math.min(40, Number(document.getElementById('social-engagement-offset-y')?.value) || 0)),
        actions: {
          like: document.getElementById('social-engagement-like')?.checked === true,
          share: document.getElementById('social-engagement-share')?.checked === true,
          subscribe: document.getElementById('social-engagement-subscribe')?.checked === true
        }
      };
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
        sceneLayers: [],
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
      button.textContent = enabled ? 'Hide Lower Third' : 'Show Lower Third';
      button.classList.toggle('active', enabled);
      button.title = enabled ? `Hide ${title}` : `Show ${title}`;
    }

    function previewNameRoleLowerThirdExample() {
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
          name: settings.name || 'PS. Samson Arthur Paul',
          role: settings.name ? settings.role : 'Senior Pastor'
        }
      });
      showToast('Lower-third example sent to preview');
    }

    function previewSocialEngagementLowerThirdExample() {
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
          socials: {
            instagram: '@church',
            facebook: 'facebook.com/church',
            website: 'church.org'
          },
          actions: {
            like: true,
            share: true,
            subscribe: true
          }
        }
      });
      showToast('Social lower-third example sent to preview');
    }

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
      }
      setLowerThirdButtonState(button, enabled, 'lower third');
      updateProgramDisplayStatus();
      handleNameRoleOverlayChange(true);
    }

    function toggleSocialEngagementOverlay() {
      const button = document.getElementById('social-engagement-overlay-show-btn');
      if (!button) return;
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      const overlay = getSocialEngagementOverlaySettings(enabled);
      const hasAnyContent = Object.values(overlay.socials).some(Boolean) || Object.values(overlay.actions).some(Boolean);
      if (enabled && !hasAnyContent) {
        showToast('Enter a social handle or enable an action before showing the social lower third');
        return;
      }
      if (enabled) {
        setLowerThirdButtonState(document.getElementById('name-role-overlay-show-btn'), false, 'lower third');
      }
      setLowerThirdButtonState(button, enabled, 'social lower third');
      handleSocialEngagementOverlayChange(true);
    }

    // Lower-third design picker: one tab per family and one button per design,
    // built from the <select>, which stays the source of truth. Picking a
    // design also shows it on the Preview monitor.
    let ltDesignPickerFamily = '';

    function renderLtDesignPicker() {
      const select = document.getElementById('name-role-overlay-design');
      const host = document.getElementById('lt-design-picker');
      if (!select || !host) return;
      const groups = Array.from(select.querySelectorAll('optgroup'));
      if (!groups.length) return;
      const current = select.value;
      const currentGroup = groups.find(g => Array.from(g.children).some(o => o.value === current)) || groups[0];
      if (!groups.some(g => g.label === ltDesignPickerFamily)) ltDesignPickerFamily = currentGroup.label;

      const families = document.createElement('div');
      families.className = 'lt-design-families';
      families.setAttribute('role', 'group');
      families.setAttribute('aria-label', 'Design family');
      groups.forEach((group) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'lt-design-family';
        tab.textContent = group.label;
        tab.setAttribute('aria-pressed', group.label === ltDesignPickerFamily ? 'true' : 'false');
        tab.onclick = () => {
          ltDesignPickerFamily = group.label;
          renderLtDesignPicker();
        };
        families.appendChild(tab);
      });

      const grid = document.createElement('div');
      grid.className = 'lt-design-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', `${ltDesignPickerFamily} designs`);
      const group = groups.find(g => g.label === ltDesignPickerFamily);
      Array.from(group ? group.children : []).forEach((option) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'lt-design-tile';
        tile.textContent = option.textContent;
        tile.setAttribute('aria-pressed', option.value === current ? 'true' : 'false');
        tile.onclick = () => pickLtDesign(option.value);
        grid.appendChild(tile);
      });
      host.replaceChildren(families, grid);
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
      appState.settings.nameRoleOverlayOffsetX = String(document.getElementById('name-role-overlay-offset-x')?.value || '0');
      appState.settings.nameRoleOverlayOffsetY = String(document.getElementById('name-role-overlay-offset-y')?.value || '0');
      document.getElementById('name-role-overlay-offset-x-value').textContent = `${appState.settings.nameRoleOverlayOffsetX}%`;
      document.getElementById('name-role-overlay-offset-y-value').textContent = `${appState.settings.nameRoleOverlayOffsetY}%`;
      saveState();
      saveToStorageDebounced();
      if (enabled) {
        if (!name) {
          enabledButton?.setAttribute('aria-pressed', 'false');
          if (enabledButton) enabledButton.textContent = 'Show Lower Third';
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
      appState.settings.socialEngagementOverlayPrimaryColor = payload.primaryColor;
      appState.settings.socialEngagementOverlayAccentColor = payload.accentColor;
      appState.settings.socialEngagementOverlaySize = String(payload.size);
      appState.settings.socialEngagementOverlaySizeVersion = 2;
      appState.settings.socialEngagementOverlayOffsetX = String(payload.offsetX);
      appState.settings.socialEngagementOverlayOffsetY = String(payload.offsetY);
      document.getElementById('social-engagement-offset-x-value').textContent = `${payload.offsetX}%`;
      document.getElementById('social-engagement-offset-y-value').textContent = `${payload.offsetY}%`;
      saveState();
      saveToStorageDebounced();
      if (enabled) {
        const hasAnyContent = Object.values(payload.socials).some(Boolean) || Object.values(payload.actions).some(Boolean);
        if (!hasAnyContent) {
          enabledButton?.setAttribute('aria-pressed', 'false');
          if (enabledButton) enabledButton.textContent = 'Show Lower Third';
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
      const sceneLayers = getOutputSceneLayers();
      const state = (lastLiveState && lastLiveState.kind === 'update')
        ? { kind: 'update', payload: { ...lastLiveState.payload, sceneLayers } }
        : { kind: 'clear', sceneLayers };
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
      if (includeBibles) {
        payload.bibleRecords = Object.keys(bibles).map(name => buildBibleRecord(name, bibles[name] || [], { isNew: false }));
      }
      relaySend(payload);
      relayStateIncludeSongs = false;
      relayStateIncludeBibles = false;
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

    function broadcastMessage(msg) {
      const outputMessage = mapOutputMessageMedia(msg);
      if (channel) channel.postMessage(outputMessage);
      const relayMessage = compactRelayMedia(outputMessage);
      relaySend(relayMessage);
      if (window.BSPDesktop && typeof window.BSPDesktop.sendWebSocketOutputMessage === 'function') {
        window.BSPDesktop.sendWebSocketOutputMessage(relayMessage).catch(() => {});
      }
      mirrorSyncMessage(outputMessage);
    }

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
        if (typeof queueStandaloneSyncBurst === 'function') queueStandaloneSyncBurst();
      });
    }
    setInterval(pingDisplays, 5000);

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
        sceneLayers: getOutputSceneLayers(),
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
      embeddedProgramDisplayState = { kind: 'update', payload: outputMessage };
      syncEmbeddedProgramDisplay();
      syncStandaloneOutputDirect();
      syncLsProjectionPreview();
      lastLiveState = { kind: 'update', payload: msg };
      if (appState && appState.live) appState.live.lastLiveState = lastLiveState;
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
        seq: nextSeq(),
        sceneLayers: getOutputSceneLayers()
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
      syncLsProjectionPreview();
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
          primaryColor: document.getElementById('name-role-overlay-primary')?.value || '#90D5FF',
          accentColor: document.getElementById('name-role-overlay-accent')?.value || '#90D5FF',
          logo: document.getElementById('name-role-overlay-logo-preview')?.dataset.logoDataUrl || '',
          nameSize: Number(document.getElementById('name-role-overlay-name-size')?.value || 56),
          roleSize: Number(document.getElementById('name-role-overlay-role-size')?.value || 24),
          logoSize: Number(document.getElementById('name-role-overlay-logo-size')?.value || 128),
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
      const previewOnly = opts.previewOnly === true;
      if (!previewOnly && document.getElementById('btn-preview')?.getAttribute('aria-pressed') === 'true') return false;
      if ((!isLive && !previewOnly) || !livePointer) return false;
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
        const songSecondaryHtml = songTextPair.secondaryHtml || '';
        const bilingualSettings = getSongBilingualSettings();
        if (mode !== 'full' && useCustomStyle) {
          outHtml = `<div class="jo-body" style="padding-left:60px;${verseShadowStyle}">${songPrimaryHtml}</div>`;
        } else if (mode === 'full') {
          outHtml = `<div class="jo-body" style="text-align:center;${verseShadowStyle}">${songPrimaryHtml}</div>`;
        } else {
          outHtml = `<div class="jo-body" style="${verseShadowStyle}">${songPrimaryHtml}</div>`;
        }
        if (songTextPair.bilingualEnabled && songSecondaryHtml) {
          outHtml = buildStackedSongBilingualHtml(outHtml, songSecondaryHtml, bilingualSettings.secondaryFontScale);
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
        bilingualEnabled: livePointer.kind === 'songs' && !!(songTextPair &&
          songTextPair.bilingualEnabled),
        translatedText: livePointer.kind === 'songs' ? ((songTextPair && songTextPair.secondaryHtml) || '') : '',
        secondaryFontScale: getSongBilingualSettings().secondaryFontScale,
        nameRoleOverlay: ui.nameRoleOverlay
      };
      if (previewOnly) return sendProgramPreview(payload);
      postUpdate(payload);
      return true;
    }
