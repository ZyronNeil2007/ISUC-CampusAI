import { getQueryParam } from '../../app/router.js';
import { MAP_CATEGORY_LABELS, entrancePoint, findRoute, officesInBuilding } from '../../modules/campusMap.js';
import { directoryEntries } from '../../modules/campusData.js';
import { el, followPack, pageShell, validityBadge } from '../shared/packView.js';

let unsubscribe = null;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  children.forEach((c) => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return node;
}

/** Split a label into lines that fit a building of the given width (the font is about 1.25 map units per character). */
function wrapLabel(name, width) {
  const limit = Math.max(6, Math.floor(width / 1.3));
  const lines = [];
  for (const word of name.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= limit) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export default {
  title: 'Campus Map',

  render() {
    return pageShell('Campus Map', 'A schematic map of campus buildings that works offline. It is not to scale.');
  },

  mount(root) {
    unsubscribe = followPack(root, (body, pack) => {
      const map = pack.map;
      if (!map) {
        body.append(el('div', { class: 'notice', 'data-kind': 'warning' }, 'No campus map has been published in the knowledge pack yet. CampusAI does not draw a map it cannot verify. Please ask the university for directions, or use the Campus Directory for building names.'));
        return;
      }

      const { entries: offices } = directoryEntries(pack, (d) => pack.retriever.validity(d));
      const byId = new Map(map.buildings.map((b) => [b.id, b]));
      let selected = null;
      let route = null;

      const status = map.verificationStatus === 'verified' ? validityBadge('Verified', 'ok') : validityBadge('Not verified');
      body.append(
        el('p', { class: 'hint' }, `${map.title} · source: ${map.source} · ${map.lastVerifiedAt ? `last verified ${map.lastVerifiedAt}` : 'verification date not recorded'} `, status),
        el('p', { class: 'hint' }, 'Schematic only: building positions and walkways are simplified, with no distances or walking times. Follow campus signs and ask staff if unsure.')
      );

      // Controls
      const option = (b) => el('option', { value: b.id }, b.name);
      const from = el('select', { id: 'map-from' }, el('option', { value: '' }, 'Choose a starting point'), map.buildings.map(option));
      const to = el('select', { id: 'map-to' }, el('option', { value: '' }, 'Choose a destination'), map.buildings.map(option));
      const query = getQueryParam('to');
      if (query && byId.has(query)) to.value = query;
      const routeText = el('p', { class: 'route-text', 'aria-live': 'polite' });
      const search = el('input', { type: 'search', id: 'map-search', placeholder: 'Search buildings…', autocomplete: 'off' });
      const category = el('select', { id: 'map-category', 'aria-label': 'Facility category' }, el('option', { value: '' }, 'All categories'), [...new Set(map.buildings.map((b) => b.category))].map((c) => el('option', { value: c }, MAP_CATEGORY_LABELS[c] ?? c)));
      const list = el('ul', { class: 'building-list' });
      const detail = el('div', { class: 'card map-detail', 'aria-live': 'polite' }, el('p', { class: 'hint' }, 'Select a building to see what is there.'));

      // Drawing
      const canvas = svg('svg', { viewBox: `0 0 ${map.width} ${map.height}`, class: 'campus-svg', role: 'group', 'aria-label': `${map.title}, schematic map` });
      const routeLayer = svg('polyline', { class: 'route-line', fill: 'none', points: '' });
      const buildingNodes = new Map();
      for (const w of map.walkways ?? []) {
        const point = (id) => (byId.has(id) ? entrancePoint(byId.get(id)) : (map.nodes ?? []).filter((n) => n.id === id).map((n) => [n.x, n.y])[0]);
        const [a, b] = [point(w[0]), point(w[1])];
        canvas.append(svg('line', { class: 'walkway', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
      }
      for (const n of map.nodes ?? []) {
        if (n.label) canvas.append(svg('text', { class: 'node-label', x: n.x, y: n.y - 1.5, 'text-anchor': 'middle' }, n.label));
      }
      canvas.append(routeLayer);
      for (const b of map.buildings) {
        const g = svg(
          'g',
          { class: 'building', tabindex: 0, role: 'button', 'aria-label': `${b.name}, ${MAP_CATEGORY_LABELS[b.category] ?? b.category}`, 'data-category': b.category },
          svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 1.2 }),
          (() => {
            const lines = wrapLabel(b.name, b.w);
            const text = svg('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 - ((lines.length - 1) * 1.4), 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
            lines.forEach((line, i) => text.append(svg('tspan', { x: b.x + b.w / 2, dy: i === 0 ? 0 : 2.8 }, line)));
            return text;
          })()
        );
        g.addEventListener('click', () => select(b.id));
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select(b.id);
          }
        });
        buildingNodes.set(b.id, g);
        canvas.append(g);
      }

      function select(id) {
        selected = id;
        buildingNodes.forEach((g, key) => g.classList.toggle('selected', key === id));
        const b = byId.get(id);
        const inside = officesInBuilding(b, offices);
        detail.replaceChildren(
          el('h3', {}, b.name),
          el('p', { class: 'hint' }, MAP_CATEGORY_LABELS[b.category] ?? b.category),
          b.description ? el('p', {}, b.description) : null,
          b.accessibility ? el('p', {}, el('strong', {}, 'Accessibility: '), b.accessibility) : el('p', { class: 'hint' }, 'No accessibility information has been verified for this building.'),
          inside.length ? el('div', {}, el('strong', {}, 'Offices listed here'), el('ul', {}, inside.map((o) => el('li', {}, o.name, o.location ? ` (${o.location})` : '')))) : null,
          el('div', { class: 'card-actions' }, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { to.value = id; showRoute(); } }, 'Directions to here'), el('a', { href: `#/assistant?q=${encodeURIComponent(`Where is the ${b.name}?`)}` }, 'Ask the assistant'))
        );
      }

      function showRoute() {
        route = null;
        routeLayer.setAttribute('points', '');
        routeText.replaceChildren();
        if (!from.value || !to.value) {
          routeText.textContent = 'Choose a starting point and a destination to see a walking route.';
          return;
        }
        if (from.value === to.value) {
          routeText.textContent = 'You are already there: the starting point and the destination are the same.';
          return;
        }
        route = findRoute(map, from.value, to.value);
        if (!route) {
          routeText.textContent = 'The map has no walkway between these two places, so no route can be shown.';
          return;
        }
        routeLayer.setAttribute('points', route.points.map((p) => p.join(',')).join(' '));
        routeText.textContent = `Route (schematic, no distances): ${route.via.join(' → ')}.`;
        select(to.value);
      }

      function filter() {
        const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        const shown = map.buildings.filter((b) => {
          if (category.value && b.category !== category.value) return false;
          const hay = `${b.name} ${b.description ?? ''} ${officesInBuilding(b, offices).map((o) => o.name).join(' ')}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
        list.replaceChildren(...shown.map((b) => el('li', {}, el('button', { class: 'linklike', type: 'button', onclick: () => select(b.id) }, b.name))));
        if (!shown.length) list.append(el('li', { class: 'hint' }, 'No building matches.'));
        buildingNodes.forEach((g, id) => g.classList.toggle('dim', !shown.some((b) => b.id === id)));
      }

      [from, to].forEach((s) => s.addEventListener('change', showRoute));
      search.addEventListener('input', filter);
      category.addEventListener('change', filter);

      body.append(
        el('div', { class: 'map-layout' },
          el('div', {}, canvas),
          el('div', {},
            el('div', { class: 'map-controls' },
              el('label', { for: 'map-from' }, 'From'), from,
              el('label', { for: 'map-to' }, 'To'), to,
              routeText),
            el('label', { class: 'visually-hidden', for: 'map-search' }, 'Search buildings'), search, category, list, detail))
      );
      filter();
      if (to.value) {
        select(to.value);
        showRoute();
      }
    });
  },

  unmount() {
    unsubscribe?.();
    unsubscribe = null;
  },
};
