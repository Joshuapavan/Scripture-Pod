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
    function showUpdateBar(latest) {
      if (document.getElementById('update-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'update-bar';
      bar.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.textContent = `A new version is available: ${String(latest.name || latest.tag)}`;
      const get = document.createElement('button');
      get.type = 'button'; get.className = 'btn'; get.textContent = 'Download';
      get.onclick = () => window.BSPDesktop.openReleasePage(latest.url).catch(() => {});
      const later = document.createElement('button');
      later.type = 'button'; later.className = 'btn'; later.textContent = 'Later';
      later.onclick = () => bar.remove();
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
