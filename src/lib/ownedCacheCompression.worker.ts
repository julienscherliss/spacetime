import { encodeDeviceStorage } from './deviceStorageEncoding';

// Only compacts copies of already-durable data; never owns pending user edits.
self.onmessage = (event: MessageEvent<{ request: number; workspace: unknown }>) => {
  try {
    self.postMessage({ request: event.data.request,
      encoded: encodeDeviceStorage(JSON.stringify(event.data.workspace)) });
  } catch {
    self.postMessage({ request: event.data.request, failed: true });
  }
};
