/** Minimal hash router. Hash routing keeps the app working offline and on any static host. */
const routes = new Map();
let notFound = () => '<div class="container"><h1>Page not found</h1></div>';
let outlet = null;
let onChange = () => {};

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

export async function render() {
  const path = currentPath();
  const page = routes.get(path) ?? { render: notFound };
  outlet.innerHTML = '';
  const html = await page.render();
  outlet.innerHTML = html;
  if (page.mount) page.mount(outlet);
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
