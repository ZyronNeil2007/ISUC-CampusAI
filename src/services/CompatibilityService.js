/**
 * Checks whether this browser/device can run on-device AI.
 * Never falls back to a cloud service; unsupported devices only lose AI chat.
 */
export async function checkCompatibility() {
  const result = {
    webgpu: false,
    webgpuReason: '',
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    opfs: !!(navigator.storage && navigator.storage.getDirectory),
    storage: { quota: null, usage: null, persisted: null },
    supported: false,
  };

  if (!('gpu' in navigator)) {
    result.webgpuReason = 'This browser does not expose WebGPU.';
  } else {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        result.webgpu = true;
      } else {
        result.webgpuReason = 'No compatible GPU adapter was found.';
      }
    } catch (err) {
      result.webgpuReason = `WebGPU initialization failed: ${err.message}`;
    }
  }

  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      result.storage.quota = est.quota ?? null;
      result.storage.usage = est.usage ?? null;
    } catch {
      /* ignore */
    }
  }
  if (navigator.storage?.persisted) {
    try {
      result.storage.persisted = await navigator.storage.persisted();
    } catch {
      /* ignore */
    }
  }

  result.supported = result.webgpu && result.indexedDB;
  return result;
}
