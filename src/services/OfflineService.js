/** Registers the service worker and tracks online/offline state. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}

export function onConnectivityChange(callback) {
  const update = () => callback(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
