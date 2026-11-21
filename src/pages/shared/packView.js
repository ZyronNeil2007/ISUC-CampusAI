import { knowledgePack } from '../../ai/session.js';

/**
 * Shared pieces of the campus module pages. Every page is built from the loaded knowledge pack with DOM methods and
 * textContent only: pack text is data and is never inserted as HTML.
 */

/** Create an element: el('a', {href: '#/x', class: 'chip'}, 'text', childNode). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const LEVEL_NOTICE = {
  sample: 'This is fictional sample content for testing CampusAI. It is not real Isabela State University information.',
  draft: 'This information has not been verified by the university yet. Confirm it with the responsible office before relying on it.',
};

/** What the page shows instead of content when there is no usable pack. */
function stateMessage(state) {
  if (state.status === 'none') {
    return { kind: 'warning', title: 'No campus information is installed yet', text: 'This section is filled from a verified knowledge pack, and none is installed on this device. CampusAI does not show campus details it cannot verify. Please ask the responsible office directly.' };
  }
  if (state.status === 'error') {
    return { kind: 'error', title: 'The knowledge pack could not be used', text: `${state.error} Nothing from it is shown.` };
  }
  return { kind: 'ok', title: 'Loading campus information…', text: '' };
}

/**
 * Mount a page body that follows the knowledge pack. `render(body, pack)` is called whenever a usable pack is ready.
 * Returns an unsubscribe function for the page's unmount.
 */
export function followPack(root, render) {
  const body = root.querySelector('[data-module-body]');
  return knowledgePack.subscribe((state) => {
    body.replaceChildren();
    const pack = knowledgePack.current;
    if (state.status !== 'ready' || !pack) {
      const m = stateMessage(state);
      body.append(el('div', { class: 'notice', 'data-kind': m.kind, role: m.kind === 'error' ? 'alert' : 'status' }, el('strong', {}, m.title), m.text ? el('p', {}, m.text) : null));
      return;
    }
    const level = pack.manifest.contentLevel;
    if (LEVEL_NOTICE[level]) body.append(el('div', { class: 'notice module-level', role: 'note' }, LEVEL_NOTICE[level]));
    render(body, pack);
  });
}

/** "Office · version 1.1 · published 2026-09-01 · verified 2026-08-01" */
export function provenance(doc) {
  return [
    doc.office,
    doc.version ? `version ${doc.version}` : null,
    doc.publishedAt ? `published ${doc.publishedAt}` : null,
    doc.lastVerifiedAt ? `last verified ${doc.lastVerifiedAt}` : 'verification date not recorded',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function validityBadge(label, kind = '') {
  return el('span', { class: 'badge', 'data-kind': kind }, label);
}

export function askLink(question) {
  return el('a', { class: 'chip', href: `#/assistant?q=${encodeURIComponent(question)}` }, question);
}

export function pageShell(title, intro) {
  return `
    <div class="container module">
      <h1>${title}</h1>
      <p class="module-intro">${intro}</p>
      <div data-module-body></div>
    </div>`;
}
