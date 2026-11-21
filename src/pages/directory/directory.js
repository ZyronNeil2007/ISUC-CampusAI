import { directoryEntries, searchEntries, VALIDITY_LABEL } from '../../modules/campusData.js';
import { officesInBuilding } from '../../modules/campusMap.js';
import { askLink, el, followPack, pageShell, provenance } from '../shared/packView.js';

let unsubscribe = null;

function card(entry) {
  const rows = [
    ['Location', entry.location],
    ['Hours', entry.hours],
    ['Email', entry.email],
    ['Phone', entry.phone],
    ['Website', entry.website],
    ...entry.extra.map((x) => [x.label.replace(/^./, (c) => c.toUpperCase()), x.value]),
  ].filter(([, v]) => v);
  const mapLink = entry.mapBuilding ? el('a', { href: `#/map?to=${encodeURIComponent(entry.mapBuilding)}` }, 'Show on map') : null;
  return el(
    'article',
    { class: 'card dir-card' },
    el('h3', {}, entry.name),
    entry.description ? el('p', {}, entry.description) : null,
    el('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('p', { class: 'hint' }, provenance(entry.document)),
    el('div', { class: 'card-actions' }, mapLink, el('a', { href: `#/assistant?q=${encodeURIComponent(`What does the ${entry.name} do?`)}` }, 'Ask the assistant'))
  );
}

export default {
  title: 'Campus Directory',

  render() {
    return pageShell('Campus Directory', 'Offices and services, with their location, hours and contact details, from the campus knowledge pack.');
  },

  mount(root) {
    unsubscribe = followPack(root, (body, pack) => {
      const validityOf = (d) => pack.retriever.validity(d);
      const { entries, unusable } = directoryEntries(pack, validityOf);

      if (!entries.length) {
        body.append(el('div', { class: 'notice', 'data-kind': 'warning' }, 'The knowledge pack has no verified office directory, so no offices are listed. Please ask the university directly.'));
        unusable.forEach((u) => body.append(el('p', { class: 'hint' }, `Not shown: "${u.document.title}" (${VALIDITY_LABEL[u.validity] ?? u.validity}).`)));
        return;
      }

      // Link an office to the map only when the map names the building in the office's location text.
      if (pack.map) {
        for (const b of pack.map.buildings) for (const o of officesInBuilding(b, entries)) o.mapBuilding ??= b.id;
      }

      const input = el('input', { type: 'search', id: 'dir-search', placeholder: 'Search offices, services, buildings…', autocomplete: 'off' });
      const count = el('p', { class: 'hint', 'aria-live': 'polite' });
      const list = el('div', { class: 'card-grid' });
      const none = el('p', { class: 'notice', hidden: true }, 'No office matches that search. Try a different word, or ask the assistant.');

      const update = () => {
        const found = searchEntries(entries, input.value);
        list.replaceChildren(...found.map(card));
        none.hidden = found.length > 0;
        count.textContent = `${found.length} of ${entries.length} offices`;
      };
      input.addEventListener('input', update);

      body.append(el('label', { class: 'visually-hidden', for: 'dir-search' }, 'Search the directory'), input, count, list, none);
      unusable.forEach((u) => body.append(el('p', { class: 'hint' }, `Not shown: "${u.document.title}" (${VALIDITY_LABEL[u.validity] ?? u.validity}).`)));
      body.append(el('div', { class: 'chip-list' }, askLink('Where is the Registrar\'s Office?')));
      update();
    });
  },

  unmount() {
    unsubscribe?.();
    unsubscribe = null;
  },
};
