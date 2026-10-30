    function getHostMode() {
      return [HOST_MODE_OBS, HOST_MODE_WEBSOCKET, HOST_MODE_STANDALONE].includes(hostMode) ? hostMode : HOST_MODE_OBS;
    }

    function isObsMode() {
      return getHostMode() === HOST_MODE_OBS;
    }

    function isWebSocketMode() {
      return getHostMode() === HOST_MODE_WEBSOCKET;
    }

    function isStandaloneMode() {
      return getHostMode() === HOST_MODE_STANDALONE;
    }

    async function refreshLocalServerInfo() {
      if (!(window.BSPDesktop && typeof window.BSPDesktop.getLocalServerInfo === 'function')) return null;
      try {
        localServerInfo = await window.BSPDesktop.getLocalServerInfo();
      } catch (error) {
        localServerInfo = null;
      }
      localServerInfo = applyChosenNetworkHost(localServerInfo);
      const displayUrlEl = document.getElementById('network-display-url');
      if (displayUrlEl) displayUrlEl.value = localServerInfo?.displayUrl || '';
      const programDisplayUrlEl = document.getElementById('program-display-link');
      if (programDisplayUrlEl) programDisplayUrlEl.value = localServerInfo?.displayUrl || '';
      const monitorDisplayUrlEl = document.getElementById('monitor-display-link');
      if (monitorDisplayUrlEl) monitorDisplayUrlEl.value = getLocalMonitorUrl(localServerInfo);
      const smDisplay = document.getElementById('sm-link-display'); if (smDisplay) smDisplay.value = localServerInfo?.displayUrl || '';
      const smMonitor = document.getElementById('sm-link-monitor'); if (smMonitor) smMonitor.value = getLocalMonitorUrl(localServerInfo);
      const smMedia = document.getElementById('sm-link-media'); if (smMedia) smMedia.value = getLocalMediaUrl(localServerInfo);
      const mediaDisplayUrlEl = document.getElementById('media-display-link');
      if (mediaDisplayUrlEl) mediaDisplayUrlEl.value = getLocalMediaUrl(localServerInfo);
      return localServerInfo;
    }

    // This computer can have several network addresses (Wi-Fi, Ethernet). The links use the one picked
    // in the Wireless card, so the other device gets an address it can actually reach.
    const NETWORK_HOST_KEY = 'scripturePod.networkHost.v1';
    function applyChosenNetworkHost(info) {
      const select = document.getElementById('network-host-select');
      if (!info) { if (select) select.innerHTML = ''; return info; }
      const hosts = (info.availableHosts || []).filter((h) => h && h !== '127.0.0.1');
      let chosen = '';
      try { chosen = localStorage.getItem(NETWORK_HOST_KEY) || ''; } catch (e) { /* storage unavailable */ }
      if (!hosts.includes(chosen)) chosen = info.preferredHost && hosts.includes(info.preferredHost) ? info.preferredHost : (hosts[0] || info.preferredHost || '');
      if (select) {
        select.innerHTML = hosts.map((h) => `<option value="${h}">${h}</option>`).join('');
        select.value = chosen;
        select.disabled = hosts.length < 2;
      }
      if (!chosen || !info.displayUrl) return info;
      try {
        const url = new URL(info.displayUrl);
        url.hostname = chosen;
        const relay = url.searchParams.get('relay');
        if (relay) { const r = new URL(relay); r.hostname = chosen; url.searchParams.set('relay', r.toString().replace(/\/$/, '')); }
        return { ...info, preferredHost: chosen, displayUrl: url.toString() };
      } catch (e) { return info; }
    }
    function setNetworkHost(host) {
      try { localStorage.setItem(NETWORK_HOST_KEY, host); } catch (e) { /* storage unavailable */ }
      refreshLocalServerInfo();
    }

    async function refreshLocalDisplayUrl() {
      const info = await refreshLocalServerInfo();
      if (!info) {
        showToast('Local display URL is only available in the desktop app');
        return;
      }
      showToast('Local display URL refreshed');
    }

    async function copyLocalDisplayUrl() {
      const info = localServerInfo || await refreshLocalServerInfo();
      if (!info?.displayUrl) {
        showToast('Local display URL is only available in the desktop app');
        return;
      }
      try {
        if (window.BSPDesktop && typeof window.BSPDesktop.copyText === 'function') {
          await window.BSPDesktop.copyText(info.displayUrl);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(info.displayUrl);
        } else {
          throw new Error('Clipboard unavailable');
        }
        showToast('Display URL copied');
      } catch (error) {
        showToast('Unable to copy display URL');
      }
    }

    function getLocalMonitorUrl(info = localServerInfo) {
      if (!info?.displayUrl) return '';
      try {
        const url = new URL(info.displayUrl);
        url.searchParams.set('role', 'monitor');
        return url.toString();
      } catch (error) {
        return '';
      }
    }

    // Address of the media-only display: an OBS source of its own that shows just the intro, prayer time and outro
    function getLocalMediaUrl(info = localServerInfo) {
      if (!info?.displayUrl) return '';
      try { const url = new URL(info.displayUrl); url.searchParams.set('role', 'media'); return url.toString(); } catch (error) { return ''; }
    }
    async function copyLocalMediaUrl() {
      const info = localServerInfo || await refreshLocalServerInfo();
      const mediaUrl = getLocalMediaUrl(info);
      if (!mediaUrl) { showToast('Media link is only available in the desktop app'); return; }
      try { await window.BSPDesktop.copyText(mediaUrl); showToast('Media link copied'); } catch (error) { showToast('Unable to copy media link'); }
    }

    async function copyLocalMonitorUrl() {
      const info = localServerInfo || await refreshLocalServerInfo();
      const monitorUrl = getLocalMonitorUrl(info);
      if (!monitorUrl) {
        showToast('Monitor URL is only available in the desktop app');
        return;
      }
      try {
        if (window.BSPDesktop && typeof window.BSPDesktop.copyText === 'function') {
          await window.BSPDesktop.copyText(monitorUrl);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(monitorUrl);
        } else {
          throw new Error('Clipboard unavailable');
        }
        showToast('Monitor URL copied');
      } catch (error) {
        showToast('Unable to copy monitor URL');
      }
    }

    function applyHostModeUi() {
      document.body.classList.toggle('obs-isolated', isObsMode());
      document.body.classList.toggle('websocket-mode', isWebSocketMode());
      document.body.classList.toggle('standalone-mode', isStandaloneMode());
    }

    function setHostMode(mode, opts = {}) {
      hostMode = [HOST_MODE_OBS, HOST_MODE_WEBSOCKET, HOST_MODE_STANDALONE].includes(mode) ? mode : HOST_MODE_OBS;
      applyHostModeUi();
      if (!opts.silent) saveToStorageDebounced();
    }


    function bindHostModeInput() {
      const hostModeEl = document.getElementById('host-mode-select');
      if (hostModeEl && !hostModeEl.dataset.bound) {
        hostModeEl.dataset.bound = '1';
        hostModeEl.addEventListener('change', () => setHostMode(hostModeEl.value));
      }
    }



    // ── Other computers on the network ────────────────────────────────────────
    // Computers running Scripture Pod show up here (found by their beacons). Connecting asks one to open this
    // computer's display page full screen; it only accepts when "Receive" is on and the pairing code matches.
    const DEVICE_CODES_KEY = 'scripturePod.deviceCodes.v1';
    const connectedDevices = new Set();
    function loadDeviceCodes() { try { return JSON.parse(localStorage.getItem(DEVICE_CODES_KEY) || '{}'); } catch (e) { return {}; } }
    function saveDeviceCode(id, code) { const all = loadDeviceCodes(); all[id] = code; try { localStorage.setItem(DEVICE_CODES_KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ } }

    async function refreshNetworkDevices() {
      const bridge = window.BSPDesktop;
      const host = document.getElementById('network-device-list');
      if (!bridge || typeof bridge.listDevices !== 'function' || !host) return;
      let devices = [];
      try { devices = await bridge.listDevices(); } catch (e) { devices = []; }
      if (!host.dataset.loaded) { host.dataset.loaded = '1'; host.dataset.signature = ''; }
      const codes = loadDeviceCodes();
      // keep what is being typed: only redraw when the list changed
      const signature = JSON.stringify(devices.map((d) => [d.id, d.name, d.ip, d.receiving, connectedDevices.has(d.id)]));
      if (host.dataset.signature !== signature) {
        host.dataset.signature = signature;
        host.replaceChildren();
        if (!devices.length) {
          const p = document.createElement('p');
          p.className = 'output-route-hint';
          p.textContent = 'No other computers found yet. Open Scripture Pod on another computer on this network.';
          host.appendChild(p);
        }
        devices.forEach((d) => {
          const row = document.createElement('div');
          row.className = 'network-device';
          const info = document.createElement('div');
          info.className = 'network-device-info';
          const name = document.createElement('strong'); name.textContent = d.name || d.ip;
          const meta = document.createElement('span');
          meta.textContent = `${d.ip} · ${connectedDevices.has(d.id) ? 'Connected' : (d.receiving ? 'Ready to receive' : 'Receive is off')}`;
          info.append(name, meta);
          const code = document.createElement('input');
          code.type = 'text'; code.inputMode = 'numeric'; code.maxLength = 6; code.placeholder = 'Code';
          code.className = 'network-device-code'; code.value = codes[d.id] || '';
          code.oninput = () => saveDeviceCode(d.id, code.value.trim());
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'btn';
          const connected = connectedDevices.has(d.id);
          btn.textContent = connected ? 'Disconnect' : 'Connect';
          btn.onclick = () => (connected ? disconnectNetworkDevice(d.id, code.value.trim()) : connectNetworkDevice(d.id, code.value.trim()));
          row.append(info, code, btn);
          host.appendChild(row);
        });
      }
      // a computer that left the network is no longer connected
      [...connectedDevices].forEach((id) => { if (!devices.some((d) => d.id === id)) connectedDevices.delete(id); });
      refreshReceiverUi();
    }

    async function connectNetworkDevice(id, code) {
      const role = document.getElementById('device-role')?.value || 'live';
      if (!code) { showToast('Enter the pairing code shown on that computer'); return; }
      saveDeviceCode(id, code);
      const result = await window.BSPDesktop.connectDevice({ id, code, role });
      if (result && result.ok) { connectedDevices.add(id); showToast('Connected: the display is open on that computer'); }
      else showToast((result && result.error) || 'Could not connect');
      const host = document.getElementById('network-device-list'); if (host) host.dataset.signature = '';
      refreshNetworkDevices();
    }

    async function disconnectNetworkDevice(id, code) {
      const result = await window.BSPDesktop.disconnectDevice({ id, code });
      connectedDevices.delete(id);
      if (!(result && result.ok)) showToast((result && result.error) || 'Could not reach that computer');
      const host = document.getElementById('network-device-list'); if (host) host.dataset.signature = '';
      refreshNetworkDevices();
    }

    async function refreshReceiverUi() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.getReceiver !== 'function') return;
      const r = await bridge.getReceiver().catch(() => null);
      if (!r) return;
      const toggle = document.getElementById('receiver-toggle'); if (toggle) toggle.checked = !!r.enabled;
      const nameEl = document.getElementById('receiver-name'); if (nameEl && document.activeElement !== nameEl) nameEl.value = r.name || '';
      const codeEl = document.getElementById('receiver-code'); if (codeEl) codeEl.value = r.enabled ? r.code : 'Switch Receive on to show the code';
      const stop = document.getElementById('receiver-stop'); if (stop) stop.hidden = !r.enabled;
    }

    async function setReceiverEnabledFromUi(on) {
      const name = document.getElementById('receiver-name')?.value || '';
      await window.BSPDesktop.setReceiver({ enabled: !!on, name });
      refreshReceiverUi();
    }

    async function stopReceivedDisplay() {
      await window.BSPDesktop.closeRemote();
      showToast('The display on this computer is closed');
    }

    (function initNetworkDevices() {
      const start = () => {
        try { const role = localStorage.getItem('scripturePod.deviceRole.v1'); const sel = document.getElementById('device-role'); if (role && sel) sel.value = role; } catch (e) { /* storage unavailable */ }
        refreshNetworkDevices();
        setInterval(() => { if (document.getElementById('outputs-card')?.classList.contains('is-open')) refreshNetworkDevices(); }, 2500);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();

    // ── Any laptop with a browser: pick it here, open the address there ─────────────
    const HOST_LABELS_KEY = 'scripturePod.hostLabels.v1';
    function loadHostLabels() { try { return JSON.parse(localStorage.getItem(HOST_LABELS_KEY) || '{}'); } catch (e) { return {}; } }
    function saveHostLabel(ip, label) {
      const all = loadHostLabels();
      if (label) all[ip] = label; else delete all[ip];
      try { localStorage.setItem(HOST_LABELS_KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
    }
    let scannedHosts = [];
    let browserDisplayInfo = null;
    const browserRole = () => document.getElementById('browser-role')?.value || 'live';

    function browserDisplayUrlFor(info, role) {
      if (!info) return '';
      const list = role === 'monitor' ? info.monitorUrls : (role === 'stage' ? info.stageUrls : (role === 'media' ? info.mediaUrls : info.urls));
      const chosen = (typeof localServerInfo !== 'undefined' && localServerInfo && localServerInfo.preferredHost) || '';
      return (list || []).find((u) => chosen && u.includes(`//${chosen}:`)) || (list || [])[0] || '';
    }
    async function refreshBrowserDisplay() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.getBrowserDisplay !== 'function') return;
      browserDisplayInfo = await bridge.getBrowserDisplay().catch(() => null);
      const el = document.getElementById('browser-display-url');
      if (el) el.value = browserDisplayUrlFor(browserDisplayInfo, browserRole());
      renderNetworkHosts();
      refreshBrowserJoins();
    }
    async function copyBrowserDisplayUrl() {
      const url = document.getElementById('browser-display-url')?.value || '';
      if (!url) return;
      try { await window.BSPDesktop.copyText(url); showToast('Address copied'); } catch (e) { showToast('Could not copy'); }
    }

    async function scanNetworkHosts() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.scanNetwork !== 'function') return;
      const btn = document.getElementById('btn-scan-network');
      const status = document.getElementById('scan-status');
      if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
      showSkeleton(document.getElementById('network-host-list'), 3, 'device');
      try { scannedHosts = await bridge.scanNetwork(); } catch (e) { scannedHosts = []; }
      if (btn) { btn.disabled = false; btn.textContent = 'Scan network for laptops'; }
      if (status) status.textContent = scannedHosts.length ? `${scannedHosts.length} found` : 'Nothing found. Make sure the laptop is awake and on this network.';
      renderNetworkHosts();
    }

    function renderNetworkHosts() {
      const host = document.getElementById('network-host-list');
      if (!host) return;
      host.replaceChildren();
      const url = browserDisplayUrlFor(browserDisplayInfo, browserRole());
      scannedHosts.forEach((h) => {
        const row = document.createElement('div');
        row.className = 'network-device';
        const info = document.createElement('div');
        info.className = 'network-device-info';
        const labels = loadHostLabels();
        const shown = labels[h.ip] || h.name || 'Unknown device';
        const name = document.createElement('strong');
        name.textContent = shown;
        name.title = 'Click to give this device a name you will recognise';
        name.style.cursor = 'text';
        name.onclick = () => {
          const input = document.createElement('input');
          input.type = 'text'; input.value = labels[h.ip] || (h.name || ''); input.maxLength = 40; input.placeholder = 'Name this device';
          input.className = 'network-device-code'; input.style.width = '100%'; input.style.textAlign = 'left';
          const save = () => { saveHostLabel(h.ip, input.value.trim()); renderNetworkHosts(); };
          input.onblur = save;
          input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.onblur = null; renderNetworkHosts(); } };
          name.replaceWith(input); input.focus(); input.select();
        };
        const meta = document.createElement('span');
        meta.textContent = h.selected ? `${h.ip} · Picked: open ${url} on it` : h.ip;
        info.append(name, meta);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn';
        btn.textContent = h.selected ? 'Stop' : 'Use this laptop';
        btn.onclick = async () => {
          const r = await window.BSPDesktop.allowIp({ ip: h.ip, role: browserRole(), allow: !h.selected });
          if (r && r.error) { showToast(r.error); return; }
          h.selected = !h.selected;
          if (h.selected) showToast(`Open ${url} in the browser on ${loadHostLabels()[h.ip] || h.name || h.ip}`);
          renderNetworkHosts(); refreshBrowserJoins();
        };
        row.append(info, btn);
        host.appendChild(row);
      });
    }

    async function refreshBrowserJoins() {
      const bridge = window.BSPDesktop;
      const host = document.getElementById('browser-join-list');
      if (!bridge || typeof bridge.listJoins !== 'function' || !host) return;
      const data = await bridge.listJoins().catch(() => null);
      if (!data) return;
      const joins = (data.joins || []).filter((j) => j.status === 'pending' || (j.status === 'approved' && j.live));
      const signature = JSON.stringify(joins.map((j) => [j.sid, j.status, j.role, j.live]));
      if (host.dataset.signature === signature) return;
      host.dataset.signature = signature;
      host.replaceChildren();
      joins.forEach((j) => {
        const row = document.createElement('div');
        row.className = 'network-device';
        const info = document.createElement('div');
        info.className = 'network-device-info';
        const name = document.createElement('strong'); name.textContent = loadHostLabels()[j.ip] || j.name || j.ip;
        const meta = document.createElement('span');
        meta.textContent = `${j.ip}${loadHostLabels()[j.ip] && j.name ? ' · ' + j.name : ''} · ${j.status === 'pending' ? 'Waiting to be allowed' : 'Showing the ' + (j.role === 'monitor' ? 'monitor' : 'live display')}`;
        info.append(name, meta);
        row.appendChild(info);
        const act = (label, action) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label;
          b.onclick = async () => { await window.BSPDesktop.decideJoin({ sid: j.sid, action, role: browserRole() }); host.dataset.signature = ''; refreshBrowserJoins(); };
          row.appendChild(b);
        };
        if (j.status === 'pending') { act('Allow', 'approve'); act('Deny', 'deny'); } else act('Disconnect', 'revoke');
        host.appendChild(row);
      });
    }

    (function initBrowserDisplay() {
      const start = () => {
        try { const r = localStorage.getItem('scripturePod.browserRole.v1'); const sel = document.getElementById('browser-role'); if (r && sel) sel.value = r; } catch (e) { /* storage unavailable */ }
        refreshBrowserDisplay();
        setInterval(() => { if (document.getElementById('outputs-card')?.classList.contains('is-open')) refreshBrowserJoins(); }, 2000);
        // a laptop waiting to be allowed tells you without opening Outputs
        setInterval(async () => {
          try {
            const data = await window.BSPDesktop.listJoins();
            const waiting = (data.joins || []).filter((j) => j.status === 'pending' && j.live).length;
            const btn = document.getElementById('btn-topbar-outputs');
            if (btn) btn.classList.toggle('has-waiting', waiting > 0);
          } catch (e) { /* bridge unavailable */ }
        }, 4000);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();

    // ── Stage display window on a screen of this computer ───────────────────────────
    async function refreshStageDisplayUi() {
      const bridge = window.BSPDesktop;
      const btn = document.getElementById('btn-stage-display');
      const select = document.getElementById('stage-display-screen');
      if (!bridge || typeof bridge.isStageOpen !== 'function' || !btn) return;
      const open = await bridge.isStageOpen().catch(() => false);
      btn.textContent = open ? 'Close stage display' : 'Open stage display';
      if (select && !select.options.length && typeof bridge.getDisplays === 'function') {
        const displays = await bridge.getDisplays().catch(() => []);
        select.innerHTML = displays.map((d, i) => `<option value="${d.id}">${d.label || 'Screen ' + (i + 1)} (${d.width}×${d.height})${d.isPrimary ? ' · main' : ''}</option>`).join('');
        const external = displays.find((d) => !d.isInternal && !d.isPrimary);
        if (external) select.value = external.id;
      }
    }
    async function toggleStageDisplay() {
      const bridge = window.BSPDesktop;
      if (!bridge) return;
      if (await bridge.isStageOpen().catch(() => false)) await bridge.closeStage();
      else {
        await bridge.openStage({ displayId: document.getElementById('stage-display-screen')?.value || '' });
        // a stage screen opened mid-service shows what is on air straight away
        setTimeout(() => { try { if (typeof sendSyncState === 'function') sendSyncState(); } catch (e) { /* nothing live */ } }, 900);
      }
      setTimeout(refreshStageDisplayUi, 500);
    }
    setInterval(() => { if (document.getElementById('outputs-card')?.classList.contains('is-open')) refreshStageDisplayUi(); }, 2500);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshStageDisplayUi); else refreshStageDisplayUi();

    // ── Stage display options: size and contents ──────────────────────────────────
    const STAGE_CONFIG_KEY = 'scripturePod.stageConfig.v1';
    const STAGE_CONFIG_DEFAULTS = { currentSize: 100, nextSize: 100, showTitle: true, showSection: true, showClock: true, showNext: true,
      fullVerse: true, dimOthers: true, align: 'left', uppercase: false, clock24: false, font: 'Geist', textColor: '#ffffff', bgColor: '#000000', accent: '#3b9eff' };
    const STAGE_CONFIG_FIELDS = [
      { key: 'currentSize', label: 'Words size', type: 'range', min: 50, max: 200, unit: '%' },
      { key: 'nextSize', label: 'Next slide size', type: 'range', min: 50, max: 200, unit: '%' },
      { key: 'fullVerse', label: 'Show the whole verse (off: only the lines on the main screen)', type: 'check' },
      { key: 'dimOthers', label: 'Dim the lines that are not on the main screen', type: 'check' },
      { key: 'showNext', label: 'Show the next section', type: 'check' },
      { key: 'showSection', label: 'Show the section name', type: 'check' },
      { key: 'showTitle', label: 'Show the song title or verse reference', type: 'check' },
      { key: 'showClock', label: 'Show the clock', type: 'check' },
      { key: 'clock24', label: '24-hour clock', type: 'check' },
      { key: 'uppercase', label: 'ALL CAPITALS', type: 'check' },
      { key: 'align', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] },
      { key: 'font', label: 'Font', type: 'select', options: ['Geist', 'Montserrat', 'Source Serif 4', 'Arial', 'Impact'] },
      { key: 'textColor', label: 'Text colour', type: 'color' },
      { key: 'bgColor', label: 'Background colour', type: 'color' },
      { key: 'accent', label: 'Label colour', type: 'color' }
    ];
    function getStageConfig() {
      try { return { ...STAGE_CONFIG_DEFAULTS, ...(JSON.parse(localStorage.getItem(STAGE_CONFIG_KEY) || '{}')) }; } catch (e) { return { ...STAGE_CONFIG_DEFAULTS }; }
    }
    function sendStageConfig() {
      try { broadcastMessage({ type: 'STAGE_CONFIG', proto: 1, sender: 'control', ts: Date.now(), config: getStageConfig() }); } catch (e) { /* not ready */ }
    }
    function setStageConfigValue(key, value) {
      const cfg = getStageConfig();
      cfg[key] = value;
      try { localStorage.setItem(STAGE_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ }
      sendStageConfig();
    }
    function resetStageConfig() {
      try { localStorage.removeItem(STAGE_CONFIG_KEY); } catch (e) { /* storage unavailable */ }
      renderStageOptions();
      sendStageConfig();
    }
    function renderStageOptions() {
      const grid = document.getElementById('stage-options-grid');
      if (!grid) return;
      const cfg = getStageConfig();
      grid.replaceChildren();
      STAGE_CONFIG_FIELDS.forEach((f) => {
        const row = document.createElement('label');
        row.className = 'stage-option-row' + (f.type === 'check' ? ' is-check' : '');
        const text = document.createElement('span'); text.textContent = f.label;
        let input;
        if (f.type === 'select') { input = document.createElement('select'); f.options.forEach((o) => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; input.appendChild(opt); }); input.value = cfg[f.key]; }
        else if (f.type === 'check') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!cfg[f.key]; }
        else { input = document.createElement('input'); input.type = f.type; if (f.type === 'range') { input.min = f.min; input.max = f.max; input.step = 5; } input.value = cfg[f.key]; }
        let readout = null;
        if (f.type === 'range') { readout = document.createElement('output'); readout.textContent = cfg[f.key] + f.unit; }
        const apply = () => {
          const value = f.type === 'check' ? input.checked : (f.type === 'range' ? Number(input.value) : input.value);
          if (readout) readout.textContent = value + f.unit;
          setStageConfigValue(f.key, value);
        };
        input.addEventListener('input', apply); input.addEventListener('change', apply);
        if (f.type === 'check') row.append(input, text); else { row.append(text, input); if (readout) row.appendChild(readout); }
        grid.appendChild(row);
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderStageOptions); else renderStageOptions();

    // ── Identify screens and the test pattern ───────────────────────────────────────
    async function identifyScreens() {
      const r = await window.BSPDesktop.identifyScreens().catch(() => null);
      showToast(r && r.count ? `Showing a number on ${r.count} screen${r.count === 1 ? '' : 's'}` : 'No screens found');
    }
    let testPatternOn = false;
    function toggleTestPattern(force) {
      testPatternOn = typeof force === 'boolean' ? force : !testPatternOn;
      try { broadcastMessage({ type: 'TEST_PATTERN', proto: 1, sender: 'control', ts: Date.now(), on: testPatternOn }); } catch (e) { /* not ready */ }
      const btn = document.getElementById('btn-test-pattern');
      if (btn) { btn.setAttribute('aria-pressed', testPatternOn ? 'true' : 'false'); btn.textContent = testPatternOn ? 'Hide test pattern' : 'Show test pattern'; }
    }

    // ── The network changes ───────────────────────────────────────────────────────
    // The links hold this computer's address, which is read once at start. When Wi-Fi or Ethernet changes (another
    // network, a new address from the router, a cable plugged in), the addresses are read again, the links in the
    // app are rewritten, and the operator is told, since a link already pasted into OBS still has the old address.
    let lastNetworkSig = null;
    let networkWatchBusy = false;
    async function checkNetworkChange() {
      if (networkWatchBusy) return;
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.getLocalServerInfo !== 'function') return;
      networkWatchBusy = true;
      try {
        const info = await bridge.getLocalServerInfo();
        const sig = JSON.stringify([info && info.availableHosts, info && info.preferredHost]);
        if (lastNetworkSig === null) { lastNetworkSig = sig; return; }
        if (sig === lastNetworkSig) return;
        lastNetworkSig = sig;
        const before = localServerInfo && localServerInfo.preferredHost;
        await refreshLocalServerInfo();
        if (typeof updateRemoteShowDetails === 'function') updateRemoteShowDetails();
        const now = localServerInfo && localServerInfo.preferredHost;
        if (typeof showToast === 'function') {
          showToast(before && now && before !== now
            ? `The network changed. The links now use ${now}. A link already pasted into OBS needs the new address.`
            : 'The network changed. The links were updated.');
        }
      } catch (e) { /* the next check tries again */ } finally { networkWatchBusy = false; }
    }
    (function watchNetwork() {
      const start = () => {
        checkNetworkChange();
        setInterval(() => { if (document.visibilityState === 'visible') checkNetworkChange(); }, 5000);
        window.addEventListener('online', checkNetworkChange);
        window.addEventListener('offline', checkNetworkChange);
        window.addEventListener('focus', checkNetworkChange);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();

