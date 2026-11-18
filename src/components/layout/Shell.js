export const NAV_ITEMS = [
  { path: '/', label: 'Home' },
  { path: '/assistant', label: 'AI Assistant' },
  { path: '/directory', label: 'Campus Directory' },
  { path: '/map', label: 'Campus Map' },
  { path: '/guide', label: 'Student Guide' },
  { path: '/announcements', label: 'Announcements' },
  { path: '/about', label: 'About' },
  { path: '/settings', label: 'Settings' },
];

export function renderShell(root) {
  const links = NAV_ITEMS.map((i) => `<a href="#${i.path}" data-path="${i.path}">${i.label}</a>`).join('');
  root.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#/"><img src="./icons/icon.svg" alt="" />CampusAI</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
        <nav class="nav" id="nav" aria-label="Main">${links}</nav>
        <span class="status-pill" id="status-pill" data-online="true">Online</span>
      </header>
      <main id="main" tabindex="-1"></main>
      <footer class="footer">
        CampusAI is an information assistant, not an official university system.
        Always confirm important details with the responsible office.
      </footer>
    </div>`;

  const toggle = root.querySelector('.nav-toggle');
  const nav = root.querySelector('#nav');
  toggle.addEventListener('click', () => {
    const open = nav.dataset.open !== 'true';
    nav.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.dataset.open = 'false';
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  return {
    outlet: root.querySelector('#main'),
    setActive(path) {
      nav.querySelectorAll('a').forEach((a) => {
        if (a.dataset.path === path) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    },
    setOnline(online) {
      const pill = root.querySelector('#status-pill');
      pill.dataset.online = String(online);
      pill.textContent = online ? 'Online' : 'Offline';
    },
  };
}
