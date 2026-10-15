const { app, BrowserWindow, ipcMain, screen, shell, clipboard, dialog } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createRelayAccessToken, verifyRelayUpgrade } = require('./relay-security');
const { listBundledBibleFiles, readBundledBibleFile, readBundledChurchLogo } = require('./bundled-bibles');

let mainWindow = null;
let outputWindow = null;
let outputClosedCallbacks = new Set();
let httpServer = null;
let relayServer = null;
const relayClients = new Set();
const backgroundMedia = new Map();
const LOCAL_HTTP_PORT = 5510;
const LOCAL_RELAY_PORT = 5511;
const relayAccessToken = createRelayAccessToken();
let backgroundMediaDirectory = '';
let httpServerReady = false;
let relayServerReady = false;
let displayUrlLogged = false;

function resolveAppFile(name) {
  return path.join(__dirname, '..', name);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const out = [];
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.internal) return;
      if (entry.family !== 'IPv4') return;
      out.push(entry.address);
    });
  });
  return [...new Set(out)];
}

function getLocalServerInfo() {
  const addresses = getLanAddresses();
  const preferredHost = addresses[0] || '127.0.0.1';
  const displayUrl = new URL(`http://${preferredHost}:${LOCAL_HTTP_PORT}/UI/scripture-pod-display.html`);
  displayUrl.searchParams.set('hostMode', 'websocket');
  displayUrl.searchParams.set('relay', `ws://${preferredHost}:${LOCAL_RELAY_PORT}`);
  displayUrl.searchParams.set('relayToken', relayAccessToken);
  return {
    httpPort: LOCAL_HTTP_PORT,
    relayPort: LOCAL_RELAY_PORT,
    preferredHost,
    availableHosts: ['127.0.0.1', ...addresses],
    displayPath: '/UI/scripture-pod-display.html',
    displayUrl: displayUrl.toString(),
    relayUrl: `ws://${preferredHost}:${LOCAL_RELAY_PORT}`,
    relayToken: relayAccessToken
  };
}

function logDisplayUrlWhenReady() {
  if (displayUrlLogged || !httpServerReady || !relayServerReady) return;
  displayUrlLogged = true;
  console.log(`Scripture Pod display URL: ${getLocalServerInfo().displayUrl}`);
}

async function serveBackgroundMedia(req, res, id) {
  const media = backgroundMedia.get(id);
  if (!media) {
    res.writeHead(404);
    res.end('Media not found');
    return;
  }
  try {
    const { size } = await fs.promises.stat(media.filePath);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'Content-Type': media.mimeType
    };
    const range = req.headers.range;
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] ? Math.min(Number(match[2] || size - 1), size - 1) : size - 1;
      if (start >= size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(media.filePath, { start, end }).pipe(res);
      return;
    }
    headers['Content-Length'] = size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(media.filePath).pipe(res);
  } catch (error) {
    if (!res.headersSent) res.writeHead(404);
    res.end('Media unavailable');
  }
}

function startHttpServer() {
  if (httpServer) return;
  httpServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const mediaMatch = url.pathname.match(/^\/background-media\/([a-f0-9-]+)$/i);
    if (mediaMatch) {
      serveBackgroundMedia(req, res, mediaMatch[1]);
      return;
    }
    const pathname = decodeURIComponent(url.pathname === '/' ? '/UI/scripture-pod-display.html' : url.pathname);
    const target = resolveAppFile(pathname.replace(/^\/+/, ''));
    if (!target.startsWith(path.join(__dirname, '..'))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': getContentType(target) });
      res.end(data);
    });
  });
  httpServer.once('listening', () => {
    httpServerReady = true;
    logDisplayUrlWhenReady();
  });
  httpServer.listen(LOCAL_HTTP_PORT, '0.0.0.0');
}

function startRelayServer() {
  if (relayServer) return;
  relayServer = new WebSocketServer({
    host: '0.0.0.0',
    port: LOCAL_RELAY_PORT,
    verifyClient: (info, callback) => verifyRelayUpgrade(info, callback, relayAccessToken)
  });
  relayServer.once('listening', () => {
    relayServerReady = true;
    logDisplayUrlWhenReady();
  });
  relayServer.on('connection', (socket) => {
    relayClients.add(socket);
    socket.on('close', () => relayClients.delete(socket));
    socket.on('message', (payload) => {
      relayClients.forEach((client) => {
        if (client === socket || client.readyState !== 1) return;
        client.send(payload.toString());
      });
    });
  });
}

function broadcastRelayMessage(message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  relayClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 560,
    minHeight: 760,
    backgroundColor: '#101318',
    title: 'Scripture Pod',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(resolveAppFile(path.join('UI', 'scripture-pod-panel.html')));
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
    }
  });
}

function getDisplayBounds(displayId) {
  const displays = screen.getAllDisplays();
  if (displayId) {
    const match = displays.find((entry) => entry.id === displayId);
    if (match) return match.bounds;
  }
  const external = displays.find((entry) => !entry.internal) || screen.getPrimaryDisplay();
  return external.bounds;
}

function createOutputWindow(options = {}) {
  const bounds = getDisplayBounds(options.displayId);
  const shouldFullscreen = !!(options.fullscreen || options.requestFullscreen);
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.setBounds(bounds);
    if (shouldFullscreen) outputWindow.setFullScreen(true);
    outputWindow.focus();
    return outputWindow;
  }

  outputWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    show: true,
    backgroundColor: '#00000000',
    transparent: true,
    autoHideMenuBar: true,
    fullscreen: shouldFullscreen,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  outputWindow.loadFile(resolveAppFile(path.join('UI', 'scripture-pod-display.html')), {
    query: {
      standalone: '1',
      hostMode: 'standalone'
    }
  });

  outputWindow.on('closed', () => {
    outputWindow = null;
    outputClosedCallbacks.forEach((webContentsId) => {
      const sender = [...BrowserWindow.getAllWindows()].find((win) =>
        !win.isDestroyed() &&
        !win.webContents.isDestroyed() &&
        win.webContents.id === webContentsId
      );
      if (!sender) {
        outputClosedCallbacks.delete(webContentsId);
        return;
      }
      sender.webContents.send('bsp:output-closed');
    });
  });

  return outputWindow;
}

function getSystemStats() {
  return {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      percent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
    },
    cpu: {
      percent: 0
    },
    gpu: {
      renderer: 'Electron',
      vram: ''
    }
  };
}

app.whenReady().then(() => {
  ipcMain.handle('bsp:get-displays', () => {
    return screen.getAllDisplays().map((display) => ({
      id: display.id,
      label: display.label || `Display ${display.id}`,
      width: display.bounds.width,
      height: display.bounds.height,
      x: display.bounds.x,
      y: display.bounds.y,
      isPrimary: display.id === screen.getPrimaryDisplay().id,
      isInternal: !!display.internal
    }));
  });

  ipcMain.handle('bsp:open-output', (event, options = {}) => {
    createOutputWindow(options);
    return { ok: true };
  });

  ipcMain.handle('bsp:close-output', () => {
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
    }
    return { ok: true };
  });

  ipcMain.handle('bsp:is-output-open', () => {
    return !!(outputWindow && !outputWindow.isDestroyed());
  });

  ipcMain.handle('bsp:send-output-message', (_event, message) => {
    if (!outputWindow || outputWindow.isDestroyed()) return { ok: false };
    outputWindow.webContents.send('bsp:output-message', message);
    return { ok: true };
  });
  ipcMain.handle('bsp:send-websocket-output-message', (_event, message) => {
    broadcastRelayMessage(message);
    return { ok: true };
  });
  ipcMain.handle('bsp:get-local-server-info', () => getLocalServerInfo());
  ipcMain.handle('bsp:list-bundled-bible-files', () => listBundledBibleFiles(path.join(__dirname, '..')));
  ipcMain.handle('bsp:read-bundled-bible-file', (_event, asset) => readBundledBibleFile(path.join(__dirname, '..'), asset));
  ipcMain.handle('bsp:read-bundled-church-logo', () => readBundledChurchLogo(path.join(__dirname, '..')));
  ipcMain.handle('bsp:cache-background-media', async (_event, dataUrl) => {
    const match = String(dataUrl || '').match(/^data:(image|video)\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
    if (!match) throw new Error('Unsupported background media data');
    const buffer = Buffer.from(match[3], 'base64');
    if (!buffer.length) throw new Error('Background media is empty');
    const id = crypto.randomUUID();
    const mimeType = `${match[1]}/${match[2]}`.toLowerCase();
    if (!backgroundMediaDirectory) {
      backgroundMediaDirectory = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'scripture-pod-media-'));
    }
    const filePath = path.join(backgroundMediaDirectory, `${id}.${match[2].toLowerCase()}`);
    await fs.promises.writeFile(filePath, buffer);
    backgroundMedia.set(id, { filePath, mimeType });
    const host = getLocalServerInfo().preferredHost;
    return { url: `http://${host}:${LOCAL_HTTP_PORT}/background-media/${id}` };
  });
  ipcMain.handle('bsp:copy-text', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });
  ipcMain.handle('bsp:save-backup', async (_event, { filename, contents } = {}) => {
    if (typeof contents !== 'string') throw new Error('Backup contents must be text');
    const result = await dialog.showSaveDialog(mainWindow || undefined, {
      title: 'Export Backup',
      defaultPath: filename || 'ScripturePodPro_Backup.json',
      filters: [{ name: 'JSON Backup', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.promises.writeFile(result.filePath, contents, 'utf8');
    const { size } = await fs.promises.stat(result.filePath);
    return { ok: true, filePath: result.filePath, bytesWritten: size };
  });
  ipcMain.handle('bsp:open-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: 'Import Backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    return {
      name: path.basename(filePath),
      contents: await fs.promises.readFile(filePath, 'utf8')
    };
  });

  ipcMain.handle('bsp:request-output-fullscreen', () => {
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.setFullScreen(true);
    }
    return { ok: true };
  });

  ipcMain.handle('bsp:get-system-stats', () => getSystemStats());
  ipcMain.handle('bsp:open-in-location', async (_event, targetPath) => {
    if (targetPath) await shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.on('bsp:register-output-closed-listener', (event) => {
    const senderId = event.sender.id;
    outputClosedCallbacks.add(senderId);
    event.sender.once('destroyed', () => outputClosedCallbacks.delete(senderId));
  });

  ipcMain.on('bsp:output-ready', (event) => {
    if (!outputWindow || outputWindow.isDestroyed() || event.sender !== outputWindow.webContents) return;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('bsp:output-ready');
    }
  });

  startHttpServer();
  startRelayServer();
  createMainWindow();

  app.on('will-quit', () => {
    if (backgroundMediaDirectory) {
      fs.promises.rm(backgroundMediaDirectory, { recursive: true, force: true }).catch(() => {});
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (httpServer) {
    try { httpServer.close(); } catch (e) {}
  }
  if (relayServer) {
    try { relayServer.close(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
