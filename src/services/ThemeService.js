const KEY = 'campusai.theme';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(theme) {
  const root = document.documentElement;
  try {
    if (theme === 'light' || theme === 'dark') {
      localStorage.setItem(KEY, theme);
      root.dataset.theme = theme;
    } else {
      localStorage.removeItem(KEY);
      delete root.dataset.theme;
    }
  } catch {
    /* storage unavailable; theme applies for this session only */
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
  }
}
