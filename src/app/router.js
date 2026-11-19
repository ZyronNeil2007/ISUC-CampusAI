/** Minimal hash router. Hash routing keeps the app working offline and on any static host. */
const routes = new Map();
let notFound = () => '<div class="container"><h1>Page not found</h1></div>';
let outlet = null;
let onChange = () => {};
let current = null;
let renderToken = 0;

export function defineRoute(path, page) {
  routes.set(path, page);
}

export function setNotFound(page) {
  notFound = page;
}

export function currentPath() {
  const hash = (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
  return hash.startsWith('/') ? hash : `/${hash}`;
}

/** Read a query parameter from the hash, e.g. #/assistant?q=hello */
export function getQueryParam(name) {
  const hash = window.location.hash;
  const i = hash.indexOf('?');
  return i === -1 ? null : new URLSearchParams(hash.slice(i + 1)).get(name);
}

export async function render() {
  const token = ++renderToken;
  const path = currentPath();
  const page = routes.get(path) ?? { render: notFound };

  // Let the previous page release subscriptions and listeners.
  current?.unmount?.();
  current = null;

  const html = await page.render();
  if (token !== renderToken) return; // a newer navigation superseded this one

  outlet.innerHTML = html;
  current = page;
  page.mount?.(outlet);
  document.title = page.title ? `${page.title} · CampusAI` : 'CampusAI';
  outlet.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  onChange(path);
}

export function startRouter(outletEl, changeCallback) {
  outlet = outletEl;
  if (changeCallback) onChange = changeCallback;
  window.addEventListener('hashchange', render);
  render();
}
