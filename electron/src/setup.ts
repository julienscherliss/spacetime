import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  CapElectronEventEmitter,
  CapacitorSplashScreen,
  setupCapacitorElectronPlugins,
} from '@capacitor-community/electron';
import chokidar from 'chokidar';
import type { MenuItemConstructorOptions } from 'electron';
import {app, BrowserWindow, Menu, MenuItem, nativeImage, Tray, session, screen} from "electron";
import electronIsDev from 'electron-is-dev';
import electronServe from 'electron-serve';
import windowStateKeeper from 'electron-window-state';
import { join } from 'path';

// Define components for a watcher to detect when the webapp is changed so we can reload in Dev mode.
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
};
export function setupReloadWatcher(electronCapacitorApp: ElectronCapacitorApp): void {
  reloadWatcher.watcher = chokidar
    .watch(join(app.getAppPath(), 'app'), {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
      if (reloadWatcher.ready) {
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          electronCapacitorApp.getMainWindow().webContents.reload();
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher(electronCapacitorApp);
        }, 1500);
      }
    });
}

// Define our class to manage our app.
export class ElectronCapacitorApp {
  private MainWindow: BrowserWindow | null = null;
  private SplashScreen: CapacitorSplashScreen | null = null;
  private TrayIcon: Tray | null = null;
  private CapacitorFileConfig: CapacitorElectronConfig;
  private TrayMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    new MenuItem({ label: 'Quit App', role: 'quit' }),
  ];
  private AppMenuBarMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : [{ role: 'fileMenu' as const }]),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'pasteAndMatchStyle' as const },
        { role: 'delete' as const },
        { type: 'separator' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
        ...(electronIsDev
          ? [
              { type: 'separator' as const },
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
            ]
          : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
  ];
  private mainWindowState;
  private loadWebApp;
  private customScheme: string;

  constructor(
    capacitorFileConfig: CapacitorElectronConfig,
    trayMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
    appMenuBarMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[]
  ) {
    this.CapacitorFileConfig = capacitorFileConfig;

    this.customScheme = this.CapacitorFileConfig.electron?.customUrlScheme ?? 'capacitor-electron';

    if (trayMenuTemplate) {
      this.TrayMenuTemplate = trayMenuTemplate;
    }

    if (appMenuBarMenuTemplate) {
      this.AppMenuBarMenuTemplate = appMenuBarMenuTemplate;
    }

    // Setup our web app loader, this lets us load apps like react, vue, and angular without changing their build chains.
    this.loadWebApp = electronServe({
      directory: join(app.getAppPath(), 'app'),
      scheme: this.customScheme,
    });
  }

  // Helper function to load in the app.
  private async loadMainWindow(thisRef: any) {
    await thisRef.loadWebApp(thisRef.MainWindow);
  }

  // Expose the mainWindow ref for use outside of the class.
  getMainWindow(): BrowserWindow {
    return this.MainWindow;
  }

  getCustomURLScheme(): string {
    return this.customScheme;
  }

  async init(): Promise<void> {
    const icon = nativeImage.createFromPath(
      join(app.getAppPath(), 'assets', process.platform === 'win32' ? 'appIcon.ico' : 'appIcon.png')
    );
    this.mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    // Setup preload script path and construct our main window.
    const preloadPath = join(app.getAppPath(), 'build', 'src', 'preload.js');
    this.MainWindow = new BrowserWindow({
  icon,
  show: false,

  titleBarStyle: 'hidden',
  trafficLightPosition: { x: 18, y: 18 },

  autoHideMenuBar: true,

  backgroundColor: '#0f0f10',

  vibrancy: 'sidebar',
  visualEffectState: 'active',

  x: this.mainWindowState.x,
  y: this.mainWindowState.y,
  width: this.mainWindowState.width,
  height: this.mainWindowState.height,
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: true,
        // Use preload to inject the electron varriant overrides for capacitor plugins.
        // preload: join(app.getAppPath(), "node_modules", "@capacitor-community", "electron", "dist", "runtime", "electron-rt.js"),
        preload: preloadPath,
      },
    });

    // Traffic lights hover reveal
    if (process.platform === "darwin" && this.MainWindow) {
      let trafficLightsVisible = true;

      const setTrafficLightsVisible = (visible: boolean) => {
        if (!this.MainWindow || this.MainWindow.isDestroyed()) return;
        if (trafficLightsVisible === visible) return;

        trafficLightsVisible = visible;
        this.MainWindow.setWindowButtonVisibility(visible);
        console.log(`[traffic-lights] ${visible ? "shown" : "hidden"}`);
      };

      this.MainWindow.once("ready-to-show", () => {
        setTrafficLightsVisible(false);

        setInterval(() => {
          if (!this.MainWindow || this.MainWindow.isDestroyed()) return;

          const bounds = this.MainWindow.getBounds();
          const point = screen.getCursorScreenPoint();

          const isOverTrafficLightArea =
            point.x >= bounds.x &&
            point.x <= bounds.x + 220 &&
            point.y >= bounds.y &&
            point.y <= bounds.y + 120;

          setTrafficLightsVisible(isOverTrafficLightArea);
        }, 80);
      });
    }
    // End traffic lights hover reveal


    this.MainWindow.setMenuBarVisibility(false);

    // Native desktop edit shortcuts + context menu
    this.MainWindow.webContents.on('before-input-event', (event, input) => {
      console.log(
        'KEY EVENT:',
        input.key,
        'meta:',
        input.meta,
        'ctrl:',
        input.control,
        'type:',
        input.type
      );

      const isMac = process.platform === 'darwin';
      const cmdOrCtrl = isMac ? input.meta : input.control;

      if (input.type === 'keyDown' && cmdOrCtrl) {
        const key = input.key.toLowerCase();

        // BLOCK_PRODUCTION_RELOAD
        if (!electronIsDev && (key === 'r' || key === 'f5')) {
          event.preventDefault();
          return;
        }

        if (key === 'x') {
          this.MainWindow.webContents.cut();
          event.preventDefault();
        } else if (key === 'c') {
          this.MainWindow.webContents.copy();
          event.preventDefault();
        } else if (key === 'v') {
          this.MainWindow.webContents.paste();
          event.preventDefault();
        } else if (key === 'a') {
          this.MainWindow.webContents.selectAll();
          event.preventDefault();
        } else if (key === 'z' && input.shift) {
          this.MainWindow.webContents.redo();
          event.preventDefault();
        } else if (key === 'z') {
          this.MainWindow.webContents.undo();
          event.preventDefault();
        } else if (!isMac && key === 'y') {
          this.MainWindow.webContents.redo();
          event.preventDefault();
        }
      }
    });

    this.MainWindow.webContents.on('context-menu', (_event, params) => {
      if (!params.isEditable) return;

      const menu = Menu.buildFromTemplate([
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'selectAll' },
      ]);

      menu.popup();
    });


    this.mainWindowState.manage(this.MainWindow);

    if (this.CapacitorFileConfig.backgroundColor) {
      this.MainWindow.setBackgroundColor(this.CapacitorFileConfig.electron.backgroundColor);
    }

    // If we close the main window with the splashscreen enabled we need to destory the ref.
    this.MainWindow.on('closed', () => {
      if (this.SplashScreen?.getSplashWindow() && !this.SplashScreen.getSplashWindow().isDestroyed()) {
        this.SplashScreen.getSplashWindow().close();
      }
    });

    // When the tray icon is enabled, setup the options.
    if (this.CapacitorFileConfig.electron?.trayIconAndMenuEnabled) {
      this.TrayIcon = new Tray(icon);
      this.TrayIcon.on('double-click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.on('click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.setToolTip(app.getName());
      this.TrayIcon.setContextMenu(Menu.buildFromTemplate(this.TrayMenuTemplate));
    }

    // Setup the main manu bar at the top of our window.
    Menu.setApplicationMenu(Menu.buildFromTemplate(this.AppMenuBarMenuTemplate));

    // If the splashscreen is enabled, show it first while the main window loads then switch it out for the main window, or just load the main window from the start.
    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      this.SplashScreen = new CapacitorSplashScreen({
        imageFilePath: join(
          app.getAppPath(),
          'assets',
          this.CapacitorFileConfig.electron?.splashScreenImageName ?? 'splash.png'
        ),
        windowWidth: 400,
        windowHeight: 400,
      });
      this.SplashScreen.init(this.loadMainWindow, this);
    } else {
      this.loadMainWindow(this);
    }

    // Security
    // Route any http(s) link (attachment downloads, external URLs, signed
    // Supabase URLs, etc.) to the user's default system browser. Without this,
    // Electron opens a child BrowserWindow that can render *behind* the parent
    // window and gets visually trapped behind any open modal.
    const { shell } = require('electron');
    this.MainWindow.webContents.setWindowOpenHandler((details) => {
      if (/^https?:\/\//i.test(details.url)) {
        void shell.openExternal(details.url);
        return { action: 'deny' };
      }
      if (!details.url.includes(this.customScheme)) {
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    this.MainWindow.webContents.on('will-navigate', (event, newURL) => {
      if (/^https?:\/\//i.test(newURL)) {
        event.preventDefault();
        void shell.openExternal(newURL);
        return;
      }
      if (!this.MainWindow.webContents.getURL().includes(this.customScheme)) {
        event.preventDefault();
      }
    });

    // Link electron plugins into the system.
    setupCapacitorElectronPlugins();

    // When the web app is loaded we hide the splashscreen if needed and show the mainwindow.
    this.MainWindow.webContents.on('dom-ready', () => {
      if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
        this.SplashScreen.getSplashWindow().hide();
      }
      if (!this.CapacitorFileConfig.electron?.hideMainWindowOnLaunch) {
        this.MainWindow.show();
      }
      setTimeout(() => {
        if (electronIsDev) {
          this.MainWindow.webContents.openDevTools();
        }
        CapElectronEventEmitter.emit('CAPELECTRON_DeeplinkListenerInitialized', '');
      }, 400);
    });
  }
}

// Set a CSP up for our application based on the custom scheme
export function setupContentSecurityPolicy(customScheme: string): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };

    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['content-security-policy'];

    const csp = [
      `default-src 'self' ${customScheme}://* file: data: devtools:`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: https:`,
      `font-src 'self' data: https:`,
      `connect-src 'self' https://rhguyvbysqmcwzeuqipr.supabase.co wss://rhguyvbysqmcwzeuqipr.supabase.co https: wss:`,
    ].join('; ');

    console.log('[CSP] applying to:', details.url);
    console.log('[CSP] final policy:', csp);

    callback({
      responseHeaders: {
        ...responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
