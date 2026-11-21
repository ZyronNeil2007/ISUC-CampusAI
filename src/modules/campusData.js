import { toLocalIsoDate } from '../ai/retrieval/packFormat.js';

/**
 * The campus modules (directory, student guide, announcements) are VIEWS over the loaded knowledge pack.
 * They show what the pack says, with the same verification rules the assistant uses: nothing is written into the
 * pages by hand, and a document that is expired, replaced or unverified is never shown as current information.
 *
 * Pure functions over {documents, chunks} so they can be tested without a browser.
 */

/* ---------- guide topics (README 6.2, 6.3, 6.6, 6.7, 6.9) ---------- */

export const GUIDE_TOPICS = Object.freeze([
  {
    id: 'academic',
    label: 'Academic assistance',
    summary: 'Programs, curriculum, grading, academic calendar and policies.',
    categories: ['academic', 'university_policies'],
    asks: ['How does the grading system work?', 'What should I do if I fail a subject?', 'What are the requirements for graduation?'],
  },
  {
    id: 'admission',
    label: 'Admission',
    summary: 'Admission requirements, examination and application procedures.',
    categories: ['admission'],
    asks: ['What are the admission requirements?', 'What should I do after passing the entrance exam?'],
  },
  {
    id: 'enrollment',
    label: 'Enrollment',
    summary: 'Enrollment requirements, steps, fees and deadlines.',
    categories: ['enrollment'],
    asks: ['What documents are required for enrollment?', 'How do I enroll?'],
  },
  {
    id: 'scholarships',
    label: 'Scholarships',
    summary: 'Financial assistance, eligibility, requirements and deadlines.',
    categories: ['scholarships'],
    asks: ['What scholarships are available?', 'What documents should I prepare for a scholarship?'],
  },
  {
    id: 'student-life',
    label: 'Student life',
    summary: 'Organizations, student services and campus facilities.',
    categories: ['student_life', 'student_services', 'campus_facilities'],
    asks: ['What student organizations are there?', 'How do I get a campus Wi-Fi voucher?'],
  },
  {
    id: 'documents',
    label: 'Document requests',
    summary: 'How to request records and certificates.',
    categories: ['document_requests'],
    asks: ['How do I request a Transcript of Records?', 'How do I request a Certificate of Good Moral Character?'],
  },
]);

export const VALIDITY_LABEL = Object.freeze({
  current: 'In effect',
  expired: 'Expired',
  superseded: 'Replaced by a newer document',
  'not-yet-effective': 'Not in effect yet',
  archived: 'Archived',
  unverified: 'Not verified',
});

export function topicById(id) {
  return GUIDE_TOPICS.find((t) => t.id === id) ?? null;
}

function chunksByDocument(chunks) {
  const map = new Map();
  for (const c of chunks) {
    if (!map.has(c.documentId)) map.set(c.documentId, []);
    map.get(c.documentId).push(c);
  }
  return map;
}

/**
 * Documents for one topic. `usable` documents are in effect and verified (or sample/draft in a non-official pack);
 * `unusable` ones are listed by title and reason only, so the student knows they exist and why they are not shown.
 * @param {{documents: object[], chunks: object[]}} pack
 * @param {(today?: string) => Map<string, string>} validityOf Retriever.validity
 */
export function guideContent(pack, topic, validityOf, today = toLocalIsoDate()) {
  const validity = validityOf(today);
  const byDoc = chunksByDocument(pack.chunks);
  const docs = pack.documents.filter((d) => topic.categories.includes(d.category));
  const entry = (doc) => ({ document: doc, validity: validity.get(doc.id) ?? 'unverified', sections: byDoc.get(doc.id) ?? [] });
  const all = docs.map(entry).sort((a, b) => a.document.title.localeCompare(b.document.title));
  return { usable: all.filter((e) => e.validity === 'current'), unusable: all.filter((e) => e.validity !== 'current') };
}

/* ---------- office directory (README 6.4) ---------- */

const DIRECTORY_FIELDS = [
  { key: 'description', names: ['what it does', 'services', 'description', 'responsibilities', 'purpose'] },
  { key: 'location', names: ['location', 'building', 'address', 'where'] },
  { key: 'hours', names: ['hours', 'schedule', 'office hours', 'operating hours'] },
  { key: 'email', names: ['email', 'e-mail'] },
  { key: 'phone', names: ['phone', 'telephone', 'contact number', 'mobile'] },
  { key: 'website', names: ['website', 'web', 'url'] },
];

/** "Label: value" lines of a table-row chunk. */
function parseRow(text) {
  const row = new Map();
  for (const line of String(text).split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) row.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return row;
}

/**
 * Office entries from every campus_offices document. Each row of the directory table becomes one entry.
 * Rows from a document that is not usable are left out (and listed in `unusable`).
 */
export function directoryEntries(pack, validityOf, today = toLocalIsoDate()) {
  const validity = validityOf(today);
  const byDoc = chunksByDocument(pack.chunks);
  const entries = [];
  const unusable = [];
  for (const doc of pack.documents.filter((d) => d.category === 'campus_offices')) {
    const state = validity.get(doc.id) ?? 'unverified';
    if (state !== 'current') {
      unusable.push({ document: doc, validity: state });
      continue;
    }
    for (const chunk of byDoc.get(doc.id) ?? []) {
      const row = parseRow(chunk.text);
      const name = row.get('office') ?? row.get('name') ?? row.get('department') ?? chunk.section;
      if (!name) continue;
      const entry = { id: chunk.id, name, document: doc, extra: [] };
      const used = new Set(['office', 'name', 'department']);
      for (const field of DIRECTORY_FIELDS) {
        const label = field.names.find((n) => row.has(n));
        if (label) {
          entry[field.key] = row.get(label);
          used.add(label);
        }
      }
      for (const [label, value] of row) if (!used.has(label) && value) entry.extra.push({ label, value });
      entries.push(entry);
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, unusable };
}

/** Case-insensitive match on every word of the query across the entry's text. */
export function searchEntries(entries, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((e) => {
    const haystack = [e.name, e.description, e.location, e.hours, ...e.extra.map((x) => x.value)].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/* ---------- announcements (README 6.8) ---------- */

/**
 * Announcements, sorted for reading: in effect (newest first), upcoming, then expired or replaced.
 * `status` is what the dates and verification say today, so an expired announcement is always marked as expired.
 */
export function announcementList(pack, validityOf, today = toLocalIsoDate()) {
  const validity = validityOf(today);
  const byDoc = chunksByDocument(pack.chunks);
  const rank = { current: 0, 'not-yet-effective': 1 };
  return pack.documents
    .filter((d) => d.category === 'announcements')
    .map((doc) => ({ document: doc, status: validity.get(doc.id) ?? 'unverified', sections: byDoc.get(doc.id) ?? [] }))
    .sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || String(b.document.publishedAt).localeCompare(String(a.document.publishedAt)));
}
