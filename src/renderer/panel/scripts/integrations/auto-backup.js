    // ── Automatic backups to a folder ─────────────────────────────────────────────
    // The same backup as Export Backup, written by itself into a folder you choose (a Dropbox, Drive or
    // OneDrive folder gives an off-computer copy). Only the newest few files are kept.
    const AUTO_BACKUP_KEY = 'scripturePod.autoBackup.v1';
    function getAutoBackupSettings() {
      try {
        const v = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '{}');
        return { enabled: !!v.enabled, folder: String(v.folder || ''), interval: ['launch', 'daily', 'weekly'].includes(v.interval) ? v.interval : 'daily', keep: [5, 10, 20, 50].includes(Number(v.keep)) ? Number(v.keep) : 10, last: Number(v.last) || 0 };
      } catch (e) { return { enabled: false, folder: '', interval: 'daily', keep: 10, last: 0 }; }
    }
    function setAutoBackupSettings(next) {
      try { localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
    }

    function describeLastBackup(s) {
      if (!s.last) return 'No backup yet';
      const d = new Date(s.last);
      return `Last backup: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    function refreshAutoBackupUi() {
      const s = getAutoBackupSettings();
      const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
      set('auto-backup-enabled', (el) => { el.checked = s.enabled; });
      set('auto-backup-folder', (el) => { el.value = s.folder; });
      set('auto-backup-interval', (el) => { el.value = s.interval; });
      set('auto-backup-keep', (el) => { el.value = String(s.keep); });
      set('auto-backup-status', (el) => { el.textContent = describeLastBackup(s); });
    }
    function saveAutoBackupSettings() {
      const s = getAutoBackupSettings();
      s.enabled = !!document.getElementById('auto-backup-enabled')?.checked;
      s.interval = document.getElementById('auto-backup-interval')?.value || 'daily';
      s.keep = Number(document.getElementById('auto-backup-keep')?.value) || 10;
      if (s.enabled && !s.folder) { showToast('Choose a folder first'); s.enabled = false; }
      setAutoBackupSettings(s);
      refreshAutoBackupUi();
    }
    async function chooseAutoBackupFolder() {
      if (!window.BSPDesktop || typeof window.BSPDesktop.pickFolder !== 'function') { showToast('Choosing a folder needs the desktop app'); return; }
      const r = await window.BSPDesktop.pickFolder().catch(() => null);
      if (!r || !r.path) return;
      const s = getAutoBackupSettings();
      s.folder = r.path; s.enabled = true;
      setAutoBackupSettings(s);
      refreshAutoBackupUi();
      runAutoBackup(true);
    }

    let autoBackupRunning = false;
    function autoBackupDue(s) {
      if (!s.enabled || !s.folder) return false;
      const age = Date.now() - s.last;
      return s.interval === 'launch' ? !s.last || s.last < autoBackupLaunchAt : age >= (s.interval === 'weekly' ? 7 : 1) * 24 * 3600 * 1000;
    }
    const autoBackupLaunchAt = Date.now();
    async function runAutoBackup(manual = false) {
      const s = getAutoBackupSettings();
      if (autoBackupRunning) return;
      if (!window.BSPDesktop || typeof window.BSPDesktop.writeBackupFile !== 'function') return;
      if (!manual && !autoBackupDue(s)) return;
      if (!s.folder) { showToast('Choose a folder first'); return; }
      autoBackupRunning = true;
      try {
        const built = await buildBackupJson();
        const result = await window.BSPDesktop.writeBackupFile({ folder: s.folder, filename: formatBackupFilename(new Date()), contents: built.json, keep: s.keep });
        if (result && result.ok) {
          s.last = Date.now(); setAutoBackupSettings(s);
          if (manual) showToast('Backup saved to the folder');
        } else if (manual) showToast((result && result.error) || 'The backup could not be saved');
      } catch (e) {
        if (manual) showToast('The backup could not be saved: ' + (e && e.message ? e.message : e));
      } finally { autoBackupRunning = false; refreshAutoBackupUi(); }
    }

    (function initAutoBackup() {
      const start = () => {
        refreshAutoBackupUi();
        // after the library has loaded, then every half hour
        setTimeout(() => runAutoBackup(false), 20000);
        setInterval(() => runAutoBackup(false), 30 * 60 * 1000);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
