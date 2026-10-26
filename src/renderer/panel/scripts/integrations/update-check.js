    // ── Update notice ─────────────────────────────────────────────────────────────
    // Looks at the newest published release (once a day, and on request in Settings). When a newer
    // version exists a bar offers to open its download page. The new version is installed by the user.
    const UPDATE_CHECK_KEY = 'scripturePod.updateCheck.v1';
    function parseReleaseTag(tag) {
      const m = String(tag || '').match(/^v?(\d+)\.(\d+)\.(\d+)(?:-build\.(\d+))?/);
      return m ? { v: [Number(m[1]), Number(m[2]), Number(m[3])], build: Number(m[4] || 0) } : null;
    }
    function isNewerRelease(latest, current) {
      for (let i = 0; i < 3; i++) { if (latest.v[i] !== current.v[i]) return latest.v[i] > current.v[i]; }
      return latest.build > current.build;
    }
    async function checkForUpdate(manual = false) {
      const bridge = window.BSPDesktop;
      const status = document.getElementById('update-check-status');
      if (!bridge || typeof bridge.checkUpdate !== 'function') { if (manual) showToast('Checking for updates needs the desktop app'); return; }
      if (status && manual) status.textContent = 'Checking…';
      try {
        const info = await bridge.getAppInfo();
        const latest = await bridge.checkUpdate();
        const a = parseReleaseTag(latest.tag), b = parseReleaseTag(`v${info.version}-build.${info.build}`);
        try { localStorage.setItem(UPDATE_CHECK_KEY, String(Date.now())); } catch (e) { /* storage unavailable */ }
        if (a && b && isNewerRelease(a, b)) {
          showUpdateBar(latest);
          if (status) status.textContent = `Version ${latest.tag.replace(/^v/, '')} is available`;
        } else if (status) status.textContent = `You have the latest version (${info.version})`;
      } catch (e) {
        if (status) status.textContent = manual ? ((e && e.message) || 'Could not check for updates') : '';
      }
    }
    // The bar offers to download the new version inside the app, with progress, then to open the installer
    function showUpdateBar(latest) {
      if (document.getElementById('update-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'update-bar';
      bar.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.textContent = `A new version is available: ${String(latest.name || latest.tag)}`;
      const get = document.createElement('button');
      get.type = 'button'; get.className = 'btn';
      const later = document.createElement('button');
      later.type = 'button'; later.className = 'btn'; later.textContent = 'Later';
      later.onclick = () => bar.remove();
      const hasAsset = !!(latest.asset && latest.asset.url);
      get.textContent = hasAsset ? 'Download' : 'Open download page';
      get.onclick = async () => {
        if (!hasAsset) { window.BSPDesktop.openReleasePage(latest.url).catch(() => {}); return; }
        get.disabled = true; later.hidden = true;
        const started = await window.BSPDesktop.startUpdateDownload({ url: latest.asset.url, name: latest.asset.name, size: latest.asset.size }).catch((e) => ({ error: (e && e.message) || 'Download failed' }));
        if (started && started.error) { text.textContent = started.error; get.disabled = false; later.hidden = false; return; }
        const timer = setInterval(async () => {
          const p = await window.BSPDesktop.getUpdateProgress().catch(() => null);
          if (!p) return;
          if (p.state === 'downloading') {
            const pct = p.total ? Math.min(99, Math.floor((p.received / p.total) * 100)) : 0;
            text.textContent = `Downloading ${latest.asset.name}… ${p.total ? pct + '%' : Math.round(p.received / 1048576) + ' MB'}`;
          } else if (p.state === 'done') {
            clearInterval(timer);
            text.textContent = 'Downloaded to your Downloads folder. Close the app, then open the installer.';
            get.disabled = false; get.textContent = 'Open installer';
            get.onclick = () => window.BSPDesktop.openDownloadedUpdate({}).catch(() => {});
            const show = document.createElement('button');
            show.type = 'button'; show.className = 'btn'; show.textContent = 'Show in folder';
            show.onclick = () => window.BSPDesktop.openDownloadedUpdate({ reveal: true }).catch(() => {});
            bar.insertBefore(show, later); later.hidden = false; later.textContent = 'Close';
          } else if (p.state === 'error') {
            clearInterval(timer);
            text.textContent = p.error || 'The download failed';
            get.disabled = false; get.textContent = 'Try again'; later.hidden = false;
          }
        }, 500);
      };
      bar.append(text, get, later);
      document.body.appendChild(bar);
    }
    (function initUpdateCheck() {
      const start = () => {
        let last = 0;
        try { last = Number(localStorage.getItem(UPDATE_CHECK_KEY)) || 0; } catch (e) { /* storage unavailable */ }
        if (Date.now() - last > 24 * 3600 * 1000) setTimeout(() => checkForUpdate(false), 30000);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
