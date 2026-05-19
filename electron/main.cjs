const { app, BrowserWindow, Menu, session, protocol, clipboard } = require('electron');
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

const isMac = process.platform === 'darwin';

function buildAppMenu() {
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params;
    if (!isEditable) return;

    const hasSelection = !!(selectionText && selectionText.trim().length);

    const menu = Menu.buildFromTemplate([
      { label: 'Cut', role: 'cut', enabled: editFlags.canCut && hasSelection },
      { label: 'Copy', role: 'copy', enabled: editFlags.canCopy && hasSelection },
      { label: 'Paste', enabled: editFlags.canPaste, click: () => { const text = clipboard.readText(); if (text) win.webContents.insertText(text); } },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll', enabled: editFlags.canSelectAll },
    ]);

    menu.popup({ window: win });
  });
}

function attachEditShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const mod = isMac ? input.meta : input.control;
    if (!mod) return;

    const key = input.key.toLowerCase();
    const wc = win.webContents;

    switch (key) {
      case 'v':
        console.log('Electron shortcut paste fired');
        const text = clipboard.readText();
        if (text) wc.insertText(text);
        event.preventDefault();
        break;
      case 'c':
        console.log('Electron shortcut copy fired');
        wc.copy();
        event.preventDefault();
        break;
      case 'x':
        console.log('Electron shortcut cut fired');
        wc.cut();
        event.preventDefault();
        break;
      case 'a':
        console.log('Electron shortcut selectAll fired');
        wc.selectAll();
        event.preventDefault();
        break;
      case 'z':
        if (input.shift) {
          console.log('Electron shortcut redo fired');
          wc.redo();
        } else {
          console.log('Electron shortcut undo fired');
          wc.undo();
        }
        event.preventDefault();
        break;
      case 'y':
        if (!isMac) {
          console.log('Electron shortcut redo fired');
          wc.redo();
          event.preventDefault();
        }
        break;
      default:
        break;
    }
  });
}

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
      spellcheck: true,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachContextMenu(win);
  attachEditShortcuts(win);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});