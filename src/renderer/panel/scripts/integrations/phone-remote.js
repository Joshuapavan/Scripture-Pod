    // ── Phone remote ──────────────────────────────────────────────────────────────
    // A page served by this app (/remote.html) lets a phone on the same network press Next, Previous,
    // Go live and Clear. The commands wait in the app, and this panel picks them up and runs them.
    // The phone also sees what is on screen now and what comes next.
    let phoneRemoteTimer = null;
    let phoneRemoteLastState = '';

    // What the phone shows: the slide on air now and the next one, taken from the last live update
    function remoteStateNow() {
      try {
        const p = lastLiveState && lastLiveState.kind === 'update' ? lastLiveState.payload : null;
        const st = p && p.stage ? p.stage : null;
        if (isLive && st) return { live: true, title: [st.title, st.ref].filter(Boolean).join(' · '), current: st.current || '', next: st.next || '' };
        return { live: false, title: currentItem ? (currentItem.title || '') : '', current: '', next: '' };
      } catch (e) { return { live: false, title: '', current: '', next: '' }; }
    }

    async function runPhoneRemoteTick() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.pollRemote !== 'function') return;
      const actions = await bridge.pollRemote().catch(() => []);
      (actions || []).forEach((id) => { try { if (typeof runShortcutAction === 'function') runShortcutAction(id); } catch (e) { console.error('Remote action failed', id, e); } });
      const state = JSON.stringify(remoteStateNow());
      if (state !== phoneRemoteLastState) { phoneRemoteLastState = state; bridge.setRemoteState(JSON.parse(state)).catch(() => {}); }
    }

    function updatePhoneRemoteQr(url) {
      const img = document.getElementById('phone-remote-qr');
      if (!img) return;
      const encoder = window.qrcode;
      if (typeof encoder !== 'function' || !url) { img.removeAttribute('src'); return; }
      try { const qr = encoder(0, 'M'); qr.addData(url); qr.make(); img.src = qr.createDataURL(5, 0); } catch (e) { img.removeAttribute('src'); }
    }

    async function refreshPhoneRemoteUi() {
      const bridge = window.BSPDesktop;
      if (!bridge || typeof bridge.getRemote !== 'function') return;
      const r = await bridge.getRemote().catch(() => null);
      if (!r) return;
      const toggle = document.getElementById('phone-remote-toggle'); if (toggle) toggle.checked = !!r.enabled;
      const details = document.getElementById('phone-remote-details'); if (details) details.hidden = !r.enabled;
      const chosen = (typeof localServerInfo !== 'undefined' && localServerInfo && localServerInfo.preferredHost) || '';
      const url = (r.urls || []).find((u) => chosen && u.includes('//' + chosen + ':')) || (r.urls || [])[0] || '';
      const input = document.getElementById('phone-remote-url'); if (input) input.value = url;
      if (r.enabled) updatePhoneRemoteQr(url);
      if (r.enabled && !phoneRemoteTimer) phoneRemoteTimer = setInterval(runPhoneRemoteTick, 400);
      if (!r.enabled && phoneRemoteTimer) { clearInterval(phoneRemoteTimer); phoneRemoteTimer = null; }
    }
    async function setPhoneRemoteEnabled(on) {
      await window.BSPDesktop.setRemoteEnabled({ enabled: !!on });
      phoneRemoteLastState = '';
      refreshPhoneRemoteUi();
    }
    async function copyPhoneRemoteUrl() {
      const url = document.getElementById('phone-remote-url')?.value || '';
      if (!url) return;
      try { await window.BSPDesktop.copyText(url); showToast('Link copied'); } catch (e) { showToast('Could not copy'); }
    }
    (function initPhoneRemote() {
      const start = () => { refreshPhoneRemoteUi(); setInterval(() => { if (document.getElementById('outputs-card')?.classList.contains('is-open')) refreshPhoneRemoteUi(); }, 3000); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
