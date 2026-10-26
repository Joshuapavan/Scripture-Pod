// The window.BSPDesktop bridge, backed by the Rust side through /__bsp/ calls.
(() => {
  const label = window.__BSP_LABEL || 'main';
  const call = (name) => async (arg) => {
    const r = await fetch('/__bsp/' + name + '?label=' + label, { method: 'POST', body: JSON.stringify(arg === undefined ? null : arg) });
    const v = await r.json();
    if (v && v.error && !('ok' in v)) throw new Error(v.error);
    return v;
  };
  const api = {};
  ['getDisplays', 'openOutput', 'closeOutput', 'isOutputOpen', 'openFeed', 'closeFeed', 'isFeedOpen', 'relayClientCount', 'fetchText', 'listDevices', 'getReceiver', 'setReceiver', 'closeRemote', 'getBrowserDisplay', 'listJoins', 'allowIp', 'decideJoin', 'scanNetwork', 'connectDevice', 'disconnectDevice',
    'sendWebSocketOutputMessage', 'requestOutputFullscreen', 'getLocalServerInfo',
    'listBundledBibleFiles', 'readBundledBibleFile', 'readBundledChurchLogo', 'cacheBackgroundMedia', 'copyText',
    'openBackup'].forEach((n) => { api[n] = call(n); });
  api.sendOutputMessage = (message, target) => call('sendOutputMessage')({ message, target });
  api.bibleSearch = (method, payload) => call('bibleSearch')({ method, payload });
  api.saveBackup = (filename, contents) => call('saveBackup')({ filename, contents });
  api.openRecordingInLocation = (payload = {}) => call('openInLocation')(payload.path);
  const handlers = {};
  api.onOutputClosed = (cb) => { handlers['output-closed'] = cb; };
  api.onOutputReady = (cb) => { handlers['output-ready'] = cb; };
  api.onFeedClosed = (cb) => { handlers['feed-closed'] = cb; };
  window.__bspEmit = (name) => { if (handlers[name]) handlers[name](); };
  window.BSPDesktop = api;
  window.addEventListener('error', (e) => call('log')('error: ' + e.message + ' @' + String(e.filename).split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => call('log')('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
  window.addEventListener('DOMContentLoaded', () => { call('outputReady')(); });
})();
