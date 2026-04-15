const { app, BrowserWindow, session, protocol } = require('electron');
const path = require('path');

const SUPABASE_REF = 'rhguyvbysqmcwzeuqipr';
const SUPABASE_ORIGIN = `https://${SUPABASE_REF}.supabase.co`;
const SUPABASE_WS = `wss://${SUPABASE_REF}.supabase.co`;

const CSP = [
  "default-src 'self' capacitor-electron://* file: data: devtools:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS} https: wss:`,
].join('; ');

function createWindow() {
  // Register CSP override BEFORE creating the window so it catches every
  // response including the initial file:// HTML load (Capacitor Electron
  // injects its own restrictive CSP; this replaces it).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Remove any existing CSP headers and replace with ours
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    responseHeaders['Content-Security-Policy'] = [CSP];
    callback({ responseHeaders });
  });

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});