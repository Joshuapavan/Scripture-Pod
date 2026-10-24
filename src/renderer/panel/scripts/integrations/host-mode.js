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


