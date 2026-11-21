import { getQueryParam } from '../../app/router.js';
import { GUIDE_TOPICS, VALIDITY_LABEL, guideContent, topicById } from '../../modules/campusData.js';
import { renderText } from '../../utils/safeText.js';
import { askLink, el, followPack, pageShell, provenance } from '../shared/packView.js';

let unsubscribe = null;

/**
 * Personal progress checklist (README 6.3). Kept in this browser only; nothing is sent anywhere. It is a reminder list,
 * not an official record, and ticking an item says nothing about the student's admission or enrollment status.
 * Stored per browser with localStorage (wrapped in try/catch because it can be unavailable); Phase 6 owns real storage.
 */
const CHECKLIST_KEY = 'campusai.checklist.admission.v1';
const CHECKLIST_ITEMS = [
  'Review the admission requirements',
  'Prepare the required documents',
  'Take the entrance examination',
  'Check the admission results with the responsible office',
  'Coordinate with the designated office',
  'Complete the enrollment procedures',
];

function loadChecked() {
  try {
    const value = JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((n) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}
function saveChecked(set) {
  try {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable: the list still works until the page is closed */
  }
}

function checklist() {
  const checked = loadChecked();
  const box = el('fieldset', { class: 'checklist' }, el('legend', {}, 'My progress checklist'));
  CHECKLIST_ITEMS.forEach((label, i) => {
    const input = el('input', { type: 'checkbox', id: `chk-${i}`, checked: checked.has(i) });
    input.addEventListener('change', () => {
      if (input.checked) checked.add(i);
      else checked.delete(i);
      saveChecked(checked);
    });
    box.append(el('div', { class: 'check-row' }, input, el('label', { for: `chk-${i}` }, label)));
  });
  box.append(
    el('p', { class: 'hint' }, 'Stored only in this browser. It is your own reminder list: it is not an official record and does not mean you are admitted or enrolled.'),
    el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { checked.clear(); saveChecked(checked); box.querySelectorAll('input').forEach((i) => (i.checked = false)); } }, 'Clear my checklist')
  );
  return box;
}

function documentBlock(entry) {
  const { document: doc, sections } = entry;
  const details = el('details', { class: 'guide-doc' });
  details.open = false;
  details.append(el('summary', {}, el('strong', {}, doc.title)), el('p', { class: 'hint' }, provenance(doc)));
  for (const chunk of sections) {
    const part = el('section', { class: 'guide-section' });
    if (chunk.section) part.append(el('h4', {}, chunk.section));
    renderText(part, chunk.text);
    details.append(part);
  }
  details.append(el('p', { class: 'hint' }, `Source: ${doc.source}`));
  return details;
}

export default {
  title: 'Student Guide',

  render() {
    return pageShell('Student Guide', 'Academic, admission, enrollment, scholarship, student-life and document-request information from the campus knowledge pack.');
  },

  mount(root) {
    const topic = topicById(getQueryParam('topic')) ?? GUIDE_TOPICS[0];
    unsubscribe = followPack(root, (body, pack) => {
      const tabs = el('nav', { class: 'chip-list', 'aria-label': 'Guide topics' });
      for (const t of GUIDE_TOPICS) {
        tabs.append(el('a', { class: 'chip', href: `#/guide?topic=${t.id}`, 'aria-current': t.id === topic.id ? 'true' : null }, t.label));
      }
      body.append(tabs, el('h2', {}, topic.label), el('p', {}, topic.summary));

      const { usable, unusable } = guideContent(pack, topic, (d) => pack.retriever.validity(d));
      if (topic.id === 'admission' || topic.id === 'enrollment') body.append(checklist());

      if (!usable.length) {
        body.append(el('div', { class: 'notice', 'data-kind': 'warning' }, 'There is no verified, current information on this topic in the knowledge pack. Please ask the responsible office.'));
      }
      usable.forEach((entry) => body.append(documentBlock(entry)));

      if (unusable.length) {
        body.append(
          el('h3', {}, 'Not shown'),
          el('ul', {}, unusable.map((u) => el('li', {}, `"${u.document.title}": ${VALIDITY_LABEL[u.validity] ?? u.validity}.`))),
          el('p', { class: 'hint' }, 'These documents are kept out of the guide so that old or unverified rules are not mistaken for current ones.')
        );
      }
      body.append(el('h3', {}, 'Ask the assistant'), el('div', { class: 'chip-list' }, topic.asks.map(askLink)));
    });
  },

  unmount() {
    unsubscribe?.();
    unsubscribe = null;
  },
};
