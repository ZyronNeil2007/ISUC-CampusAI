/**
 * Campus map data (README 6.5).
 *
 * The map is a SCHEMATIC drawn from a small data file in the knowledge pack: buildings as labelled rectangles and
 * walkways between their entrances. It is not to scale and carries no distances. It works offline because there are no
 * map tiles; it is only as good as the data in the pack, and the pack's verification status is shown with it.
 *
 * Pure functions, shared by the build tool (validation) and the browser (routing).
 */

export const MAP_CATEGORIES = Object.freeze(['administration', 'academic', 'library', 'student_services', 'health', 'facility', 'other']);

export const MAP_CATEGORY_LABELS = Object.freeze({
  administration: 'Administration',
  academic: 'Academic',
  library: 'Library',
  student_services: 'Student services',
  health: 'Health',
  facility: 'Facilities',
  other: 'Other',
});

const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Validate a parsed map. Returns an array of error strings (empty when valid). */
export function validateCampusMap(map) {
  const errors = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ['the campus map must be an object'];
  if (!isText(map.title)) errors.push('map: title is missing');
  if (!isText(map.source)) errors.push('map: source is missing (where does this layout come from?)');
  if (!isNum(map.width) || !isNum(map.height) || map.width <= 0 || map.height <= 0) errors.push('map: width and height must be positive numbers');
  if (!isText(map.verificationStatus)) errors.push('map: verificationStatus is missing');
  if (!Array.isArray(map.buildings) || map.buildings.length === 0) errors.push('map: buildings must be a non-empty list');
  if (errors.length) return errors;

  const inside = (x, y) => isNum(x) && isNum(y) && x >= 0 && y >= 0 && x <= map.width && y <= map.height;
  const ids = new Set();
  const claim = (id, label) => {
    if (!ID.test(String(id ?? ''))) errors.push(`${label}: id "${id}" must be lowercase letters, digits and hyphens`);
    else if (ids.has(id)) errors.push(`${label}: duplicate id "${id}"`);
    else ids.add(id);
  };

  map.buildings.forEach((b, i) => {
    const label = `buildings[${i}]`;
    if (!b || typeof b !== 'object') return errors.push(`${label}: must be an object`);
    claim(b.id, label);
    if (!isText(b.name)) errors.push(`${label}: name is missing`);
    if (!MAP_CATEGORIES.includes(b.category)) errors.push(`${label}: category must be one of ${MAP_CATEGORIES.join(', ')}`);
    if (![b.x, b.y, b.w, b.h].every(isNum) || b.w <= 0 || b.h <= 0) errors.push(`${label}: x, y, w and h must be numbers`);
    else if (!inside(b.x, b.y) || !inside(b.x + b.w, b.y + b.h)) errors.push(`${label}: the building is outside the map area`);
    if (b.entrance != null && !(Array.isArray(b.entrance) && b.entrance.length === 2 && inside(b.entrance[0], b.entrance[1]))) {
      errors.push(`${label}: entrance must be [x, y] inside the map area`);
    }
    if (b.description != null && !isText(b.description)) errors.push(`${label}: description must be text`);
    if (b.accessibility != null && !isText(b.accessibility)) errors.push(`${label}: accessibility must be text (omit it when it is not verified)`);
  });
  (map.nodes ?? []).forEach((n, i) => {
    const label = `nodes[${i}]`;
    if (!n || typeof n !== 'object') return errors.push(`${label}: must be an object`);
    claim(n.id, label);
    if (!inside(n.x, n.y)) errors.push(`${label}: x and y must be inside the map area`);
    if (n.label != null && !isText(n.label)) errors.push(`${label}: label must be text`);
  });
  (map.walkways ?? []).forEach((w, i) => {
    const label = `walkways[${i}]`;
    if (!Array.isArray(w) || w.length !== 2 || !w.every((id) => ids.has(id))) errors.push(`${label}: must be a pair of building or node ids that exist`);
    else if (w[0] === w[1]) errors.push(`${label}: connects a place to itself`);
  });
  return errors;
}

/** Where people enter a building: its declared entrance, or the middle of its bottom edge. */
export function entrancePoint(building) {
  return building.entrance ?? [building.x + building.w / 2, building.y + building.h];
}

function pointsOf(map) {
  const points = new Map();
  for (const b of map.buildings) points.set(b.id, { id: b.id, x: entrancePoint(b)[0], y: entrancePoint(b)[1], name: b.name, building: true });
  for (const n of map.nodes ?? []) points.set(n.id, { id: n.id, x: n.x, y: n.y, name: n.label ?? null, building: false });
  return points;
}

/**
 * The shortest walkway route between two buildings (Dijkstra over the drawn walkways).
 * Returns null when either place is unknown or no walkway connects them.
 * @returns {{points: [number, number][], via: string[], ids: string[]} | null}
 */
export function findRoute(map, fromId, toId) {
  const points = pointsOf(map);
  if (!points.has(fromId) || !points.has(toId)) return null;
  if (fromId === toId) return { ids: [fromId], points: [[points.get(fromId).x, points.get(fromId).y]], via: [points.get(fromId).name] };

  const edges = new Map([...points.keys()].map((id) => [id, []]));
  for (const [a, b] of map.walkways ?? []) {
    const pa = points.get(a);
    const pb = points.get(b);
    const length = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    edges.get(a).push([b, length]);
    edges.get(b).push([a, length]);
  }

  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const queue = new Set([...points.keys()]);
  while (queue.size) {
    let current = null;
    for (const id of queue) if (dist.has(id) && (current === null || dist.get(id) < dist.get(current))) current = id;
    if (current === null || current === toId) break;
    queue.delete(current);
    for (const [next, length] of edges.get(current)) {
      const candidate = dist.get(current) + length;
      if (queue.has(next) && candidate < (dist.get(next) ?? Infinity)) {
        dist.set(next, candidate);
        prev.set(next, current);
      }
    }
  }
  if (!dist.has(toId)) return null;

  const ids = [toId];
  while (ids[0] !== fromId) ids.unshift(prev.get(ids[0]));
  return {
    ids,
    points: ids.map((id) => [points.get(id).x, points.get(id).y]),
    // Named places along the way, in order. Unlabelled junctions are left out.
    via: ids.map((id) => points.get(id).name).filter(Boolean),
  };
}

/** Which offices (from the directory) are in a building: the directory's location text names the building. */
export function officesInBuilding(building, offices) {
  const name = building.name.toLowerCase();
  return offices.filter((o) => (o.location ?? '').toLowerCase().includes(name));
}
