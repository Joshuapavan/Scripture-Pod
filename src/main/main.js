const { app, BrowserWindow, ipcMain, screen, shell, clipboard, dialog } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createRelayAccessToken, verifyRelayUpgrade } = require('./relay-security');
const { createBibleSearch } = require('./bible-search');
const { listBundledBibleFiles, readBundledBibleFile, readBundledChurchLogo } = require('./bundled-bibles');

let mainWindow = null;
let outputWindow = null;
let feedWindow = null;
let outputClosedCallbacks = new Set();
let httpServer = null;
let relayServer = null;
const relayClients = new Set();
const backgroundMedia = new Map();
// Preferred ports. If another copy of the app (or anything else) holds one, the
// next free port is used instead, so a busy port never stops the app starting.
const PREFERRED_HTTP_PORT = Number(process.env.SCRIPTURE_POD_HTTP_PORT) || 5510;
const PREFERRED_RELAY_PORT = Number(process.env.SCRIPTURE_POD_RELAY_PORT) || 5511;
const PORT_FALLBACK_ATTEMPTS = 20;
let LOCAL_HTTP_PORT = PREFERRED_HTTP_PORT;
let LOCAL_RELAY_PORT = PREFERRED_RELAY_PORT;
const relayAccessToken = createRelayAccessToken();
let backgroundMediaDirectory = '';
let httpServerReady = false;
let relayServerReady = false;
let displayUrlLogged = false;

// The project root (this file lives in src/main/)
const APP_ROOT = path.join(__dirname, '..', '..');
const DISPLAY_PAGE = 'src/renderer/display/display.html';
const PANEL_PAGE = 'src/renderer/panel/panel.html';

function resolveAppFile(name) {
  return path.join(APP_ROOT, name);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.mov') return 'video/quicktime';
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
  const displayUrl = new URL(`http://${preferredHost}:${LOCAL_HTTP_PORT}/${DISPLAY_PAGE}`);
  displayUrl.searchParams.set('hostMode', 'websocket');
  displayUrl.searchParams.set('relay', `ws://${preferredHost}:${LOCAL_RELAY_PORT}`);
  displayUrl.searchParams.set('relayToken', relayAccessToken);
  return {
    httpPort: LOCAL_HTTP_PORT,
    relayPort: LOCAL_RELAY_PORT,
    preferredHost,
    availableHosts: ['127.0.0.1', ...addresses],
    displayPath: `/${DISPLAY_PAGE}`,
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
    // OBS browser sources saved before the restructure still point at the old page
    if (url.pathname === '/UI/scripture-pod-display.html') {
      res.writeHead(302, { Location: `/${DISPLAY_PAGE}${url.search}` });
      res.end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname === '/' ? `/${DISPLAY_PAGE}` : url.pathname);
    const target = resolveAppFile(pathname.replace(/^\/+/, ''));
    if (!target.startsWith(APP_ROOT)) {
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
  const listen = () => httpServer.listen(LOCAL_HTTP_PORT, '0.0.0.0');
  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && LOCAL_HTTP_PORT < PREFERRED_HTTP_PORT + PORT_FALLBACK_ATTEMPTS) {
      LOCAL_HTTP_PORT += 1;
      listen();
      return;
    }
    console.error('Scripture Pod: the local display server could not start:', error.message);
  });
  listen();
}

function startRelayServer() {
  if (relayServer) return;
  const server = new WebSocketServer({
    host: '0.0.0.0',
    port: LOCAL_RELAY_PORT,
    verifyClient: (info, callback) => verifyRelayUpgrade(info, callback, relayAccessToken)
  });
  relayServer = server;
  server.once('listening', () => {
    relayServerReady = true;
    logDisplayUrlWhenReady();
  });
  server.on('error', (error) => {
    if (relayServerReady) return;
    server.close();
    relayServer = null;
    if (error.code === 'EADDRINUSE' && LOCAL_RELAY_PORT < PREFERRED_RELAY_PORT + PORT_FALLBACK_ATTEMPTS) {
      LOCAL_RELAY_PORT += 1;
      startRelayServer();
      return;
    }
    console.error('Scripture Pod: the local relay server could not start:', error.message);
  });
  server.on('connection', (socket) => {
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
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1600, Math.max(480, workAreaWidth - 32)),
    height: Math.min(980, Math.max(560, workAreaHeight - 48)),
    minWidth: 480,
    minHeight: 560,
    center: true,
    backgroundColor: '#101318',
    title: 'Scripture Pod',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(resolveAppFile(PANEL_PAGE));
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
    }
    closeFeedWindow({ silent: true });
  });
}

function getDisplayBounds(displayId) {
  const displays = screen.getAllDisplays();
  if (displayId) {
    // The panel sends ids as strings; Electron's are numbers.
    const match = displays.find((entry) => String(entry.id) === String(displayId));
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

  outputWindow.loadFile(resolveAppFile(DISPLAY_PAGE), {
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

// Stream feed: a second, opaque output for a cable into another computer's
// capture card (e.g. an OBS laptop). A cable cannot carry transparency, so the
// page is filled with a key colour that OBS removes with Luma Key (black) or
// Chroma Key (green). 'none' keeps the window transparent like the main output.
const FEED_KEY_COLORS = { none: '#00000000', black: '#000000', green: '#00B140' };

function notifyMainWindow(channel) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel);
  }
}

function closeFeedWindow(options = {}) {
  if (!feedWindow || feedWindow.isDestroyed()) {
    feedWindow = null;
    return;
  }
  const win = feedWindow;
  feedWindow = null;
  win.silentClose = !!options.silent;
  win.close();
}

function createFeedWindow(options = {}) {
  closeFeedWindow({ silent: true });
  const bounds = getDisplayBounds(options.displayId);
  const keyBackground = FEED_KEY_COLORS[options.keyBackground] ? options.keyBackground : 'none';
  const transparent = keyBackground === 'none';
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    show: true,
    backgroundColor: FEED_KEY_COLORS[keyBackground],
    transparent,
    autoHideMenuBar: true,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  feedWindow = win;
  win.loadFile(resolveAppFile(DISPLAY_PAGE), {
    query: {
      standalone: '1',
      hostMode: 'standalone',
      feed: '1',
      ...(transparent ? {} : { keyBg: keyBackground })
    }
  });
  win.on('closed', () => {
    if (feedWindow === win) feedWindow = null;
    if (!win.silentClose) notifyMainWindow('bsp:feed-closed');
  });
  return win;
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

  ipcMain.handle('bsp:open-feed', (_event, options = {}) => {
    createFeedWindow(options);
    return { ok: true };
  });

  ipcMain.handle('bsp:close-feed', () => {
    closeFeedWindow({ silent: true });
    return { ok: true };
  });

  ipcMain.handle('bsp:is-feed-open', () => {
    return !!(feedWindow && !feedWindow.isDestroyed());
  });

  ipcMain.handle('bsp:send-output-message', (_event, message) => {
    const targets = [outputWindow, feedWindow].filter((win) => win && !win.isDestroyed());
    targets.forEach((win) => win.webContents.send('bsp:output-message', message));
    return { ok: targets.length > 0 };
  });
  ipcMain.handle('bsp:send-websocket-output-message', (_event, message) => {
    broadcastRelayMessage(message);
    return { ok: true };
  });
  // Bible search lives in SQLite on disk, behind a worker thread
  let bibleSearch = null;
  ipcMain.handle('bsp:bible-search', (_event, request = {}) => {
    if (!bibleSearch) bibleSearch = createBibleSearch(path.join(app.getPath('userData'), 'bible-search.sqlite'));
    return bibleSearch.call(String(request.method || ''), request.payload);
  });
  app.on('will-quit', () => { if (bibleSearch) bibleSearch.close(); });
  ipcMain.handle('bsp:get-local-server-info', () => getLocalServerInfo());
  ipcMain.handle('bsp:list-bundled-bible-files', () => listBundledBibleFiles(APP_ROOT));
  ipcMain.handle('bsp:read-bundled-bible-file', (_event, asset) => readBundledBibleFile(APP_ROOT, asset));
  ipcMain.handle('bsp:read-bundled-church-logo', () => readBundledChurchLogo(APP_ROOT));
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
    const isOutput = [outputWindow, feedWindow].some((win) =>
      win && !win.isDestroyed() && event.sender === win.webContents);
    if (!isOutput) return;
    notifyMainWindow('bsp:output-ready');
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
