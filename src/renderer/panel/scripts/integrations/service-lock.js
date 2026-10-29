    // ── Service lock ────────────────────────────────────────────────────────────
    // While the lock is on, the actions that would take something off the screens in the middle of a service ask for
    // one more click first: going live, moving the live slide, clearing, blanking, media, the wall and closing a display. The lock is a
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
        ? 'Service lock is on: any change to the screens asks first. Click or press ⌘L to turn it off.'
        : 'Service lock (⌘L): ask before anything changes on the screens during a service.';
      b.querySelector('span').textContent = serviceLockEnabled ? 'Locked' : 'Lock';
    }

    function setServiceLock(on) {
      serviceLockEnabled = !!on;
      try { localStorage.setItem(SERVICE_LOCK_KEY, serviceLockEnabled ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      paintServiceLock();
      if (typeof showToast === 'function') showToast(serviceLockEnabled ? 'Service lock on: any change to the screens will ask first' : 'Service lock off');
    }
    function toggleServiceLock() { setServiceLock(!serviceLockEnabled); }

    // Run `run` at once, or after a confirmation while the lock is on
    function confirmIfLocked(title, message, run) {
      if (!serviceLockEnabled) { run(); return; }
      showConfirm(title, message, () => run());
    }

    // The same global functions the buttons, shortcuts and phone remote call, now asking first while locked. Any
    // change to what the screens show asks: going live, moving the live slide or version, clearing, blanking, and
    // starting or stopping media or the wall. A change the app makes by itself (a video ending, the wall coming back
    // after a screen is unplugged) never asks.
    // [function, title, message, when the guard applies]
    const GUARDED_ACTIONS = [
      ['projectLive', 'Go live?', 'This puts the selection on the live displays.', (args) => args[0] !== false],
      ['clearOutput', 'Clear the live output?', 'Whatever is on air comes off the screens.'],
      ['clearAllOutputs', 'Clear everything?', 'This takes Preview and Program off every display.'],
      ['nextSlide', 'Change what is live?', 'The live output moves to the next slide.', () => typeof isLive !== 'undefined' && isLive],
      ['prevSlide', 'Change what is live?', 'The live output moves back one slide.', () => typeof isLive !== 'undefined' && isLive],
      ['cycleLiveBibleVersion', 'Switch the version?', 'The verse on the live display changes to the next version.', () => typeof isLive !== 'undefined' && isLive],
      ['endOutputLive', 'Stop the output?', 'The output window closes and nothing is shown on that screen.'],
      ['setDisplayBlank', 'Change this display?', 'This blanks or shows that display.'],
      ['toggleNameRoleOverlay', 'Change the overlay?', 'The name and role overlay on the live display is shown or hidden.'],
      ['toggleSocialEngagementOverlay', 'Change the overlay?', 'The social overlay on the live display is shown or hidden.'],
      ['playMediaOnStream', 'Play this on the stream?', 'It plays over the live stream.'],
      ['playMediaOnWall', 'Show this on the Wall/LED?', 'It replaces what is on the wall.'],
      ['playMediaOnBoth', 'Play this on the stream and the wall?', 'It plays over the live stream and replaces what is on the wall.'],
      ['stopStreamMediaPlayback', 'Stop the media?', 'It comes off the live stream.'],
      ['stopMediaOnWall', 'Stop the Wall/LED?', 'It comes off the wall and its screen closes.'],
      ['toggleBgWallBlank', 'Change the Wall/LED?', 'The wall is blanked or shown.'],
      ['stopBgWall', 'Stop the Wall/LED?', 'The video or page on the wall stops and its screen closes.']
    ];
    // After one confirmation, the actions it sets off on their own (stopping media when something goes live, and so on)
    // go through without asking again
    let serviceLockPassUntil = 0;
    const serviceLockAsking = new Set();
    // Installed once every script has loaded, so the actions defined in the scripts after this one are covered too
    function installServiceGuards() {
    GUARDED_ACTIONS.forEach(([name, title, message, applies]) => {
      const original = window[name];
      if (typeof original !== 'function' || original.__locked) return;
      const wrapped = function (...args) {
        if (!serviceLockEnabled || Date.now() < serviceLockPassUntil || (applies && !applies(args))) return original.apply(this, args);
        if (serviceLockAsking.has(name)) return undefined;
        serviceLockAsking.add(name);
        const done = () => serviceLockAsking.delete(name);
        showConfirm(title, message, () => { done(); serviceLockPassUntil = Date.now() + 3000; original.apply(null, args); });
        // The modal closing without a yes frees the action for the next try
        setTimeout(done, 15000);
        return undefined;
      };
      wrapped.__locked = true;
      window[name] = wrapped;
    });
    }
    if (document.readyState === 'complete') installServiceGuards(); else window.addEventListener('load', installServiceGuards);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintServiceLock); else paintServiceLock();
