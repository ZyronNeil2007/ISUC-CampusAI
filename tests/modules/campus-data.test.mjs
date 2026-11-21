import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleRetriever, samplePack, TODAY } from '../helpers/sample-pack.mjs';
import { GUIDE_TOPICS, announcementList, directoryEntries, guideContent, searchEntries, topicById } from '../../src/modules/campusData.js';
import { Retriever } from '../../src/ai/retrieval/Retriever.js';
import { toLocalIsoDate } from '../../src/ai/retrieval/packFormat.js';

const TODAY_ISO = toLocalIsoDate(TODAY);

async function setup() {
  const pack = await samplePack();
  const retriever = await sampleRetriever();
  return { pack, validityOf: (d) => retriever.validity(d) };
}

test('directory: one entry per table row with its fields', async () => {
  const { pack, validityOf } = await setup();
  const { entries } = directoryEntries(pack, validityOf, TODAY_ISO);
  assert.equal(entries.length, 9);
  const registrar = entries.find((e) => /Registrar/.test(e.name));
  assert.equal(registrar.location, 'Administration Building ground floor');
  assert.match(registrar.hours, /8:00 AM/);
  assert.match(registrar.email, /@sample-university\.test$/);
  assert.match(registrar.phone, /555-0101/);
  assert.match(registrar.description, /transcripts/);
  assert.deepEqual(registrar.extra, []);
  assert.deepEqual(entries.map((e) => e.name), [...entries.map((e) => e.name)].sort((a, b) => a.localeCompare(b)));
});

test('directory: columns the module does not know are kept, not dropped', async () => {
  const { pack, validityOf } = await setup();
  const doc = pack.documents.find((d) => d.category === 'campus_offices');
  const custom = {
    documents: [doc],
    chunks: [{ id: 'x:1', documentId: doc.id, section: 'Dean of Engineering', text: 'Office: Dean of Engineering\nLocation: Room 3\nFloor plan: See notice board' }],
  };
  const { entries } = directoryEntries(custom, validityOf, TODAY_ISO);
  assert.deepEqual(entries[0].extra, [{ label: 'floor plan', value: 'See notice board' }]);
});

test('directory: a directory that is no longer usable is not shown and is reported', async () => {
  const { pack } = await setup();
  const none = directoryEntries(pack, () => new Map(pack.documents.map((d) => [d.id, 'expired'])), TODAY_ISO);
  assert.equal(none.entries.length, 0);
  assert.equal(none.unusable[0].validity, 'expired');
});

test('directory search needs every word and looks at services and locations', async () => {
  const { pack, validityOf } = await setup();
  const { entries } = directoryEntries(pack, validityOf, TODAY_ISO);
  assert.equal(searchEntries(entries, '').length, entries.length);
  assert.deepEqual(searchEntries(entries, 'transcripts').map((e) => e.name), ['Office of the University Registrar']);
  assert.ok(searchEntries(entries, 'student services building').length >= 3);
  assert.equal(searchEntries(entries, 'registrar nonsenseword').length, 0);
});

test('guide: every topic maps to pack categories and has questions to ask', () => {
  for (const topic of GUIDE_TOPICS) {
    assert.ok(topic.categories.length > 0 && topic.asks.length > 0, topic.id);
  }
  assert.equal(topicById('enrollment').label, 'Enrollment');
  assert.equal(topicById('nope'), null);
});

test('guide: replaced documents are listed as not shown, never as current content', async () => {
  const { pack, validityOf } = await setup();
  const { usable, unusable } = guideContent(pack, topicById('enrollment'), validityOf, TODAY_ISO);
  assert.ok(usable.every((e) => e.validity === 'current'));
  const old = unusable.find((e) => /2025/.test(e.document.title));
  assert.equal(old.validity, 'superseded');
  assert.ok(usable.some((e) => /2026/.test(e.document.title)));
  assert.ok(!usable.some((e) => /2025/.test(e.document.title)));
});

test('guide: documents come with their sections in order', async () => {
  const { pack, validityOf } = await setup();
  const { usable } = guideContent(pack, topicById('documents'), validityOf, TODAY_ISO);
  assert.ok(usable.length >= 1);
  assert.ok(usable[0].sections.length >= 2);
  assert.ok(usable[0].sections.every((c) => c.documentId === usable[0].document.id));
});

test('guide: an unverified document is not current in an official pack', async () => {
  const { pack } = await setup();
  const official = (await sampleRetriever({ allowUnverified: false })).validity(TODAY_ISO);
  const { usable } = guideContent(pack, topicById('scholarships'), () => official, TODAY_ISO);
  assert.equal(usable.length, 0);
});

test('announcements: current first, expired marked, none dropped', async () => {
  const { pack, validityOf } = await setup();
  const list = announcementList(pack, validityOf, TODAY_ISO);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'expired');
  assert.ok(list[0].sections.length >= 1);

  // On a date inside its validity period the same announcement is current.
  const during = announcementList(pack, (d) => new Retriever(pack, { allowUnverified: true }).validity(d), '2026-05-01');
  assert.equal(during[0].status, 'current');
});

test('announcements are ordered: current, upcoming, then earlier by newest', () => {
  const doc = (id, publishedAt) => ({ id, category: 'announcements', publishedAt, title: id });
  const pack = { documents: [doc('old', '2026-01-01'), doc('newer-old', '2026-03-01'), doc('now', '2026-02-01'), doc('soon', '2026-04-01')], chunks: [] };
  const states = { old: 'expired', 'newer-old': 'expired', now: 'current', soon: 'not-yet-effective' };
  const list = announcementList(pack, () => new Map(Object.entries(states)), '2026-05-01');
  assert.deepEqual(list.map((i) => i.document.id), ['now', 'soon', 'newer-old', 'old']);
});
