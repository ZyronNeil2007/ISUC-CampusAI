import { VALIDITY_LABEL, announcementList } from '../../modules/campusData.js';
import { renderText } from '../../utils/safeText.js';
import { askLink, el, followPack, pageShell, provenance, validityBadge } from '../shared/packView.js';

let unsubscribe = null;

function dateLine(doc) {
  return [`Published ${doc.publishedAt}`, doc.effectiveAt ? `effective ${doc.effectiveAt}` : null, doc.expiresAt ? `valid until ${doc.expiresAt}` : 'no end date']
    .filter(Boolean)
    .join(' · ');
}

function announcementCard({ document: doc, status, sections }) {
  const current = status === 'current';
  const card = el('article', { class: 'card announcement', dataset: { status } });
  card.append(
    el('h3', {}, doc.title, validityBadge(VALIDITY_LABEL[status] ?? status, current ? 'ok' : '')),
    el('p', { class: 'hint' }, dateLine(doc)),
    el('p', { class: 'hint' }, provenance(doc))
  );
  if (!current) {
    card.append(
      el('p', { class: 'notice' }, status === 'expired' ? 'This announcement has expired. It is kept for reference only and CampusAI will not use it to answer questions about current schedules.' : `This announcement is not current (${VALIDITY_LABEL[status] ?? status}). CampusAI will not use it to answer questions about current schedules.`)
    );
  }
  const body = el('div', { class: 'announcement-body' });
  sections.forEach((chunk) => {
    if (chunk.section) body.append(el('h4', {}, chunk.section));
    renderText(body, chunk.text);
  });
  card.append(body, el('p', { class: 'hint' }, `Source: ${doc.source}`));
  return card;
}

export default {
  title: 'Announcements',

  render() {
    return pageShell('Announcements', 'Campus announcements with their dates. Expired ones are marked and are never used to answer questions about current schedules.');
  },

  mount(root) {
    unsubscribe = followPack(root, (body, pack) => {
      const items = announcementList(pack, (d) => pack.retriever.validity(d));
      if (!items.length) {
        body.append(el('div', { class: 'notice', 'data-kind': 'warning' }, 'The knowledge pack has no announcements. Announcements only appear here after they are added to a verified pack, so a missing announcement does not mean nothing was announced. Check with the responsible office.'));
        return;
      }
      const now = items.filter((i) => i.status === 'current' || i.status === 'not-yet-effective');
      const old = items.filter((i) => !now.includes(i));
      body.append(el('h2', {}, 'Current'));
      if (now.length) now.forEach((i) => body.append(announcementCard(i)));
      else body.append(el('p', { class: 'notice' }, 'No current announcements are in the knowledge pack on this device.'));
      if (old.length) {
        body.append(el('h2', {}, 'Earlier'));
        old.forEach((i) => body.append(announcementCard(i)));
      }
      body.append(el('p', { class: 'hint' }, 'This list shows only what was downloaded with the knowledge pack. Same-day changes, such as class suspensions, cannot appear here while you are offline.'), el('div', { class: 'chip-list' }, askLink('What is the latest enrollment advisory?')));
    });
  },

  unmount() {
    unsubscribe?.();
    unsubscribe = null;
  },
};
