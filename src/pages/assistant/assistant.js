import { checkCompatibility } from '../../services/CompatibilityService.js';

/**
 * Assistant page shell (Phase 2). Local inference (WebLLM) and retrieval arrive
 * in Phases 3 and 4, so the composer is intentionally disabled for now.
 */
export default {
  title: 'AI Assistant',
  render() {
    return `
      <div class="chat-layout">
        <aside class="chat-sidebar" id="chat-sidebar" aria-label="Conversation history">
          <button class="btn btn-primary" type="button" id="new-chat" disabled>New conversation</button>
          <h2>History</h2>
          <p class="history-empty">No saved conversations yet.</p>
        </aside>
        <section class="chat-main" aria-label="Assistant">
          <div class="chat-status">
            <button class="btn history-toggle" type="button" id="history-toggle">History</button>
            <span id="model-status">Model: not installed</span>
            <span id="gpu-status">Checking device…</span>
          </div>
          <div class="chat-messages" id="chat-messages" aria-live="polite">
            <div class="chat-empty">
              <h2>Ask CampusAI</h2>
              <p>Ask about enrollment, offices, scholarships, or campus facilities.</p>
              <div class="notice" id="phase-notice">
                The on-device AI model is not connected yet. This screen is the interface shell;
                local chat and source citations are added in the next development phases.
              </div>
            </div>
          </div>
          <form class="composer" id="composer">
            <label class="sr-only" for="prompt" style="position:absolute;left:-999px">Message</label>
            <textarea id="prompt" rows="1" placeholder="Ask a campus question…" disabled></textarea>
            <button class="btn btn-primary" type="submit" disabled>Send</button>
          </form>
        </section>
      </div>`;
  },
  mount(root) {
    const sidebar = root.querySelector('#chat-sidebar');
    root.querySelector('#history-toggle').addEventListener('click', () => {
      sidebar.dataset.open = String(sidebar.dataset.open !== 'true');
    });
    root.querySelector('#composer').addEventListener('submit', (e) => e.preventDefault());

    const gpu = root.querySelector('#gpu-status');
    checkCompatibility().then((c) => {
      gpu.textContent = c.webgpu ? 'WebGPU: available' : `WebGPU: unavailable. ${c.webgpuReason}`;
    });
  },
};
