/** App version, injected from package.json at build time (vite.config.js). The fallback covers Node tests. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0';
