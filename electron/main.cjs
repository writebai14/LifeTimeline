const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const net = require('net');

const DEV_URL = 'http://127.0.0.1:5173';
const PACKAGED_PORT = 32117;
const PACKAGED_URL = `http://127.0.0.1:${PACKAGED_PORT}`;
const MAX_LOAD_ATTEMPTS = 40;
const LOAD_RETRY_MS = 300;

let mainWindow;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function startPackagedServer() {
  const appRoot = app.getAppPath();
  const serverEntry = path.join(appRoot, 'server', 'index.js');
  const staticRoot = path.join(appRoot, 'dist');
  const dataRoot = path.join(app.getPath('userData'), 'data');

  fs.mkdirSync(dataRoot, { recursive: true });
  process.env.PORT = String(PACKAGED_PORT);
  process.env.LIFETIMELINE_DATA_ROOT = dataRoot;
  process.env.LIFETIMELINE_STATIC_ROOT = staticRoot;

  await import(pathToFileURL(serverEntry).href);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: 'LifeTimeline',
    backgroundColor: '#f7f8fa',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  loadWhenReady(mainWindow);
}

function loadWhenReady(win, attempt = 1) {
  const url = app.isPackaged ? PACKAGED_URL : DEV_URL;
  win.loadURL(url).catch(() => {
    if (attempt >= MAX_LOAD_ATTEMPTS || win.isDestroyed()) return;
    setTimeout(() => loadWhenReady(win, attempt + 1), LOAD_RETRY_MS);
  });
}

app.whenReady().then(async () => {
  if (app.isPackaged && !(await isPortOpen(PACKAGED_PORT))) {
    await startPackagedServer();
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
