import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Gives the service worker (public/sw.js) a build version and the list of app-shell files
 * to precache: the entry script and stylesheets. Without this the shell is only cached after a
 * second page load, so a first-time visitor who goes offline could get a broken page, and the
 * worker file would never change, so browsers would never install an update.
 *
 * Lazy chunks (the ~6 MB WebLLM runtime and its worker) are not precached; the worker caches
 * them the first time they are used, so visitors who never open the assistant do not pay for them.
 */
function serviceWorkerManifest() {
  let outDir = 'dist';
  let shell = [];
  return {
    name: 'campusai-sw-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      shell = Object.values(bundle)
        .filter((f) => (f.type === 'chunk' && f.isEntry) || f.fileName.endsWith('.css'))
        .map((f) => f.fileName)
        .sort();
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      const version = createHash('sha1').update(shell.join('|')).digest('hex').slice(0, 10);
      const VERSION_PLACEHOLDER = "/*__VERSION__*/ 'dev'";
      const FILES_PLACEHOLDER = '/*__SHELL_FILES__*/ []';
      let sw = readFileSync(file, 'utf8');
      if (!sw.includes(VERSION_PLACEHOLDER) || !sw.includes(FILES_PLACEHOLDER)) {
        throw new Error('public/sw.js is missing its build placeholders');
      }
      sw = sw.replace(VERSION_PLACEHOLDER, JSON.stringify(version)).replace(FILES_PLACEHOLDER, JSON.stringify(shell));
      writeFileSync(file, sw);
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorkerManifest()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // The WebLLM runtime is ~6 MB. It is loaded lazily (and in the inference worker),
    // never on the Home page, so the default 500 kB warning is expected noise.
    chunkSizeWarningLimit: 7000,
  },
  server: {
    port: 5173,
  },
});
