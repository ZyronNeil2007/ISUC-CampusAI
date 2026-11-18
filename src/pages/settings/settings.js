import { getTheme, setTheme } from '../../services/ThemeService.js';
import { checkCompatibility } from '../../services/CompatibilityService.js';
import { formatBytes, escapeHtml } from '../../utils/dom.js';

export default {
  title: 'Settings',
  render() {
    const theme = getTheme();
    const opt = (v, label) => `<option value="${v}"${theme === v ? ' selected' : ''}>${label}</option>`;
    return `
      <div class="container">
        <h1>Settings</h1>
        <div class="settings-list">
          <div class="setting-row">
            <div><div class="label">Theme</div><div class="hint">Light, dark, or follow your device.</div></div>
            <select id="theme-select" aria-label="Theme">
              ${opt('system', 'System')}${opt('light', 'Light')}${opt('dark', 'Dark')}
            </select>
          </div>
          <div class="setting-row">
            <div><div class="label">AI model</div><div class="hint">Not installed. Model management arrives in Phase 3.</div></div>
          </div>
          <div class="setting-row">
            <div><div class="label">Knowledge pack</div><div class="hint">Not installed. Knowledge packs arrive in Phase 4.</div></div>
          </div>
          <div class="setting-row">
            <div><div class="label">Device compatibility</div><div class="hint" id="compat">Checking…</div></div>
          </div>
          <div class="setting-row">
            <div><div class="label">Local storage</div><div class="hint" id="storage">Checking…</div></div>
          </div>
        </div>
        <section class="section">
          <h2>Privacy</h2>
          <p>CampusAI is designed to keep questions and conversation history on your device. It does not require an account or personal records. Local processing does not make a shared or compromised device safe, so avoid entering sensitive information on shared computers.</p>
        </section>
      </div>`;
  },
  mount(root) {
    root.querySelector('#theme-select').addEventListener('change', (e) => setTheme(e.target.value));
    checkCompatibility().then((c) => {
      root.querySelector('#compat').innerHTML = escapeHtml(
        c.webgpu ? 'WebGPU available. This device can likely run on-device AI.' : `WebGPU unavailable. ${c.webgpuReason}`
      );
      const s = c.storage;
      root.querySelector('#storage').textContent =
        s.quota == null
          ? 'Storage estimate not available in this browser.'
          : `${formatBytes(s.usage)} used of about ${formatBytes(s.quota)}. Persistent: ${s.persisted ? 'yes' : 'no'}.`;
    });
  },
};
