const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function startApp() {
  const ready = deferred();
  const initialized = deferred();
  const handlers = {};
  const state = { window: null, creates: 0, reads: 0, shows: 0, focuses: 0 };
  const app = { whenReady: () => ready.promise, on: (name, handler) => { handlers[name] = handler; } };
  class ElectronCapacitorApp {
    getCustomURLScheme() { return 'capacitor-electron'; }
    getMainWindow() { state.reads++; return state.window; }
    async init() {
      state.creates++;
      state.window = {
        destroyed: false,
        isDestroyed() { return this.destroyed; },
        show() { state.shows++; },
        focus() { state.focuses++; },
      };
      await initialized.promise;
    }
  }
  const modules = {
    tslib: require('tslib'),
    electron: { app, MenuItem: class MenuItem {} },
    'electron-is-dev': false,
    'electron-unhandled': () => {},
    'electron-updater': { autoUpdater: { checkForUpdatesAndNotify() {} } },
    '@capacitor-community/electron': { getCapacitorElectronConfig: () => ({}) },
    './setup': { ElectronCapacitorApp, setupContentSecurityPolicy() {}, setupReloadWatcher() {} },
    './desktopUpdates': { installDesktopUpdates: () => ({ check() {} }) },
  };
  const buildRoot = process.env.SPACETIME_NATIVE_TEST_BUILD || path.join(__dirname, '../build');
  vm.runInNewContext(fs.readFileSync(path.join(buildRoot, 'src/index.js'), 'utf8'), {
    exports: {}, process: { platform: 'darwin' }, require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
      return modules[name];
    },
  });
  return { ready, initialized, handlers, state };
}

test('activation before readiness waits for initial window instead of dereferencing null', async () => {
  const h = startApp();
  const activation = h.handlers.activate();
  assert.equal(h.state.reads, 0);
  assert.equal(h.state.creates, 0);
  h.ready.resolve();
  h.initialized.resolve();
  await activation;
  assert.equal(h.state.creates, 1);
  assert.equal(h.state.shows, 1);
  assert.equal(h.state.focuses, 1);
});

test('activation during window initialization waits without creating a second window', async () => {
  const h = startApp();
  h.ready.resolve();
  await new Promise(setImmediate);
  assert.equal(h.state.creates, 1);
  const activations = [h.handlers.activate(), h.handlers.activate()];
  assert.equal(h.state.reads, 0);
  h.initialized.resolve();
  await Promise.all(activations);
  assert.equal(h.state.creates, 1);
});

test('Dock activation recreates a closed window and focuses an existing one', async () => {
  const h = startApp();
  h.ready.resolve();
  h.initialized.resolve();
  await h.handlers.activate();
  h.state.window.destroyed = true;
  await h.handlers.activate();
  assert.equal(h.state.creates, 2);
  await h.handlers.activate();
  assert.equal(h.state.creates, 2);
  assert.equal(h.state.focuses, 2);
});

test('a missing window after startup is recreated safely', async () => {
  const h = startApp();
  h.ready.resolve();
  h.initialized.resolve();
  await h.handlers.activate();
  h.state.window = null;
  await h.handlers.activate();
  assert.equal(h.state.creates, 2);
});
