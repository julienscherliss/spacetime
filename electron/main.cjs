const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const SUPABASE_REF = 'rhguyvbysqmcwzeuqipr';
const SUPABASE_ORIGIN = `https://${SUPABASE_REF}.supabase.co`;
const SUPABASE_WS = `wss://${SUPABASE_REF}.supabase.co`;

const CSP = [
  "default-src 'self' capacitor-electron://* data: devtools:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS}`,
].join('; ');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set CSP header for all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
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