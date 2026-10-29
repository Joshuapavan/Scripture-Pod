    // ── Service lock ────────────────────────────────────────────────────────────
    // While the lock is on, the actions that would take something off the screens in the middle of a service ask for
    // one more click first: Clear everything, stopping the output, stopping the wall, closing a display. The lock is a
    // button in the top bar and is remembered. Actions from the phone remote are held for the same confirmation.
    const SERVICE_LOCK_KEY = 'scripturePod.serviceLock.v1';
    let serviceLockEnabled = false;
    try { serviceLockEnabled = localStorage.getItem(SERVICE_LOCK_KEY) === '1'; } catch (e) { /* storage unavailable */ }

    function serviceLockOn() { return serviceLockEnabled; }

    function paintServiceLock() {
      const b = document.getElementById('btn-service-lock');
      if (!b) return;
      b.classList.toggle('is-locked', serviceLockEnabled);
      b.setAttribute('aria-pressed', String(serviceLockEnabled));
      b.title = serviceLockEnabled
        ? 'Service lock is on: clearing and stopping the displays asks first. Click or press ⌘L to turn it off.'
        : 'Service lock (⌘L): ask before clearing or stopping the displays during a service.';
      b.querySelector('span').textContent = serviceLockEnabled ? 'Locked' : 'Lock';
    }

    function setServiceLock(on) {
      serviceLockEnabled = !!on;
      try { localStorage.setItem(SERVICE_LOCK_KEY, serviceLockEnabled ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      paintServiceLock();
      if (typeof showToast === 'function') showToast(serviceLockEnabled ? 'Service lock on: risky actions will ask first' : 'Service lock off');
    }
    function toggleServiceLock() { setServiceLock(!serviceLockEnabled); }

    // Run `run` at once, or after a confirmation while the lock is on
    function confirmIfLocked(title, message, run) {
      if (!serviceLockEnabled) { run(); return; }
      showConfirm(title, message, () => run());
    }

    // The same global functions the buttons and shortcuts call, now asking first while locked
    (function guardServiceActions() {
      const guards = [
        ['clearAllOutputs', 'Clear everything?', 'This takes Preview and Program off every display.'],
        ['endOutputLive', 'Stop the output?', 'The output window closes and nothing is shown on that screen.'],
        ['stopBgWall', 'Stop the Wall/LED?', 'The video or page on the wall stops and its screen closes.']
      ];
      guards.forEach(([name, title, message]) => {
        const original = window[name];
        if (typeof original !== 'function' || original.__locked) return;
        const wrapped = function (...args) {
          if (!serviceLockEnabled) return original.apply(this, args);
          showConfirm(title, message, () => original.apply(null, args));
          return undefined;
        };
        wrapped.__locked = true;
        window[name] = wrapped;
      });
    })();

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintServiceLock); else paintServiceLock();
