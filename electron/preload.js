const { contextBridge, ipcRenderer } = require('electron');

const BSPDesktop = {
  async getDisplays() {
    return ipcRenderer.invoke('bsp:get-displays');
  },
  async openOutput(options = {}) {
    return ipcRenderer.invoke('bsp:open-output', options);
  },
  async closeOutput() {
    return ipcRenderer.invoke('bsp:close-output');
  },
  async isOutputOpen() {
    return ipcRenderer.invoke('bsp:is-output-open');
  },
  async openFeed(options = {}) {
    return ipcRenderer.invoke('bsp:open-feed', options);
  },
  async closeFeed() {
    return ipcRenderer.invoke('bsp:close-feed');
  },
  async isFeedOpen() {
    return ipcRenderer.invoke('bsp:is-feed-open');
  },
  async sendOutputMessage(message) {
    return ipcRenderer.invoke('bsp:send-output-message', message);
  },
  async sendWebSocketOutputMessage(message) {
    return ipcRenderer.invoke('bsp:send-websocket-output-message', message);
  },
  async requestOutputFullscreen() {
    return ipcRenderer.invoke('bsp:request-output-fullscreen');
  },
  async getLocalServerInfo() {
    return ipcRenderer.invoke('bsp:get-local-server-info');
  },
  async bibleSearch(method, payload) {
    return ipcRenderer.invoke('bsp:bible-search', { method, payload });
  },
  async listBundledBibleFiles() {
    return ipcRenderer.invoke('bsp:list-bundled-bible-files');
  },
  async readBundledBibleFile(asset) {
    return ipcRenderer.invoke('bsp:read-bundled-bible-file', asset);
  },
  async readBundledChurchLogo() {
    return ipcRenderer.invoke('bsp:read-bundled-church-logo');
  },
  async cacheBackgroundMedia(dataUrl) {
    return ipcRenderer.invoke('bsp:cache-background-media', dataUrl);
  },
  async copyText(text) {
    return ipcRenderer.invoke('bsp:copy-text', text);
  },
  async saveBackup(filename, contents) {
    return ipcRenderer.invoke('bsp:save-backup', { filename, contents });
  },
  async openBackup() {
    return ipcRenderer.invoke('bsp:open-backup');
  },
  async getSystemStats() {
    return ipcRenderer.invoke('bsp:get-system-stats');
  },
  async openRecordingInLocation(payload = {}) {
    return ipcRenderer.invoke('bsp:open-in-location', payload.path);
  },
  onOutputClosed(callback) {
    ipcRenderer.removeAllListeners('bsp:output-closed');
    ipcRenderer.on('bsp:output-closed', () => callback());
  },
  onOutputReady(callback) {
    ipcRenderer.removeAllListeners('bsp:output-ready');
    ipcRenderer.on('bsp:output-ready', () => callback());
  },
  onFeedClosed(callback) {
    ipcRenderer.removeAllListeners('bsp:feed-closed');
    ipcRenderer.on('bsp:feed-closed', () => callback());
  }
};

contextBridge.exposeInMainWorld('BSPDesktop', BSPDesktop);

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('bsp:register-output-closed-listener');
  ipcRenderer.send('bsp:output-ready');
});

ipcRenderer.on('bsp:output-message', (_event, message) => {
  window.postMessage(message, '*');
});
