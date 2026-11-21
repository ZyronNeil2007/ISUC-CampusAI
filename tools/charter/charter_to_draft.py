#!/usr/bin/env python3
"""
Draft converter for the ISU Citizen's Charter PDF (one-off helper, needs `pip install pdfplumber`).

The Charter is a long run of near-identical service pages: a header table (Office, Classification, Type, Who may avail),
a CHECKLIST OF REQUIREMENTS table, and a CLIENT STEPS / AGENCY ACTIONS / FEES / PROCESSING TIME / PERSON RESPONSIBLE
table. This reads those tables and writes DRAFT Markdown, one file per office and service kind.

It is deliberately a drafting aid, not a publisher:
  * Every output file has reviewRequired: true and TODO fields. The pack builder refuses it until a person has compared it
    with the PDF, so nothing here can reach students unchecked.
  * Staff names (the "PERSON RESPONSIBLE" column) are left out: they are personal data and not needed to answer students.
  * Table rows that continue onto the next page are kept as separate rows and flagged for review.
  * A completeness report lists every number, fee and time in the PDF page text that did not make it into the draft.

Usage: python3 tools/charter/charter_to_draft.py <charter.pdf> [--out knowledge/_drafts/charter] [--external-only]
"""
import argparse, json, re, sys
from pathlib import Path

import pdfplumber

STEP_HEADERS = {
    'client': re.compile(r'CLIENT\s*STEPS', re.I),
    'agency': re.compile(r'AGENCY\s*ACTIONS?', re.I),
    'fees': re.compile(r'FEES', re.I),
    'time': re.compile(r'PROCESSING', re.I),
    'person': re.compile(r'PERSON\s*RESPONSIBLE', re.I),
}
DIVIDER = re.compile(r'\((external|internal)\s+services?\)', re.I)
HEADING = re.compile(r'^\s*(\d{1,2})\s*\.\s*(\S.*)$')
BULLET = ''


def clean(text):
    if text is None:
        return ''
    text = str(text).replace(BULLET, '').replace('•', '')
    return re.sub(r'[ \t]+', ' ', text).strip()


def one_line(text):
    """A table cell as one line: lines are joined, and pipes are escaped."""
    return re.sub(r'\s*\n\s*', ' ', clean(text)).replace('|', '\\|')


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:60]


def title_case(text):
    small = {'of', 'the', 'for', 'and', 'to', 'in', 'on', 'a', 'an'}
    words = re.sub(r'\s+', ' ', text.strip()).lower().split(' ')
    return ' '.join(w if (i and w in small) else w.capitalize() for i, w in enumerate(words)).replace("’S", "’s")


def numbers_in(text):
    return {re.sub(r'[,\s]', '', n) for n in re.findall(r'\d[\d,]*(?:\.\d+)?', text or '')}


class Service:
    def __init__(self, office, kind, number, title, page):
        self.office, self.kind, self.number, self.title, self.first_page = office, kind, number, title, page
        self.description, self.fields, self.requirements, self.steps, self.totals, self.notes, self.flags = [], [], [], [], None, [], []
        self.pages = [page]
        self.raw_text = ''


def split_heading(above_text):
    lines = [clean(l) for l in above_text.split('\n') if clean(l)]
    for i, line in enumerate(lines):
        m = HEADING.match(line)
        if m:
            title = m.group(2).strip()
            rest = lines[i + 1:]
            # A wrapped title continues in capitals; a description starts in sentence case.
            while rest and title.isupper() and rest[0].upper() == rest[0] and len(rest[0]) < 80 and not rest[0].endswith('.'):
                title += ' ' + rest.pop(0)
            return int(m.group(1)), title, rest
    return None, (lines[0] if lines else 'UNTITLED'), lines[1:]


def column_map(header_row):
    """Index of each step column in a table row, from the header row."""
    found = {}
    for idx, cell in enumerate(header_row):
        for key, rx in STEP_HEADERS.items():
            if cell and key not in found and rx.search(str(cell)):
                found[key] = idx
    return found if {'client', 'agency'} <= set(found) else None


def cells_by_column(row, cols):
    out = {k: '' for k in STEP_HEADERS}
    order = sorted(cols.items(), key=lambda kv: kv[1])
    for idx, cell in enumerate(row):
        if not clean(cell):
            continue
        key = None
        for k, start in order:
            if idx >= start:
                key = k
        key = key or order[0][0]
        out[key] = (out[key] + '\n' + str(cell)).strip() if out[key] else str(cell)
    return out


def convert(pdf_path):
    services, office, kind, current, cols, cols_width = [], None, None, None, None, None
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            if pno < 16:
                continue
            tables = page.find_tables()
            text = page.extract_text() or ''
            if not tables:
                divider = DIVIDER.search(text)
                if divider and len(text) < 160:
                    office = title_case(text.split('\n')[0])
                    kind = divider.group(1).lower()
                    current = None
                elif current is not None:
                    notes = [clean(l) for l in text.split('\n') if clean(l) and not re.fullmatch(r'\d{1,3}', clean(l))]
                    current.notes.extend(notes)
                    current.pages.append(pno)
                    current.raw_text += '\n' + text
                continue

            prev_bottom = 0
            for ti, table in enumerate(tables):
                rows = table.extract()
                is_start = bool(rows) and 'Office or Division' in ' '.join(clean(c) for c in rows[0] if c)
                above = page.crop((0, prev_bottom, page.width, max(table.bbox[1], prev_bottom + 1))).extract_text() or ''
                prev_bottom = table.bbox[3]
                if is_start:
                    number, title, desc = split_heading(above)
                    current = Service(office or 'Unknown office', kind or 'unknown', number, title, pno)
                    current.description = desc
                    cols, cols_width = None, None
                elif current is None:
                    continue
                else:
                    if pno not in current.pages:
                        current.pages.append(pno)
                    current.flags.append(f'continues from the previous page (page {pno}): rows may be split across pages')
                    # A continuation table has no header row and often a different number of columns.
                    width = len(rows[0]) if rows else 0
                    if width != cols_width:
                        cols = {'client': 0, 'agency': 1, 'fees': 2, 'time': 3, 'person': 4} if width == 5 else None
                        cols_width = width
                current.raw_text += '\n' + text if ti == 0 else ''
                for row in rows:
                    joined = ' '.join(clean(c) for c in row if c)
                    if not joined:
                        continue
                    if re.match(r'^(Office or Division|Classification|Type of Transaction|Who may avail)\s*:', joined, re.I):
                        label, _, value = joined.partition(':')
                        current.fields.append((clean(label), clean(value)))
                    elif re.search(r'CHECKLIST OF REQUIREMENTS', joined, re.I):
                        continue
                    elif column_map(row):
                        cols = column_map(row)
                        cols_width = len(row)
                    elif re.match(r'^TOTAL\b', joined, re.I):
                        parts = cells_by_column(row, cols) if cols else {}
                        current.totals = (clean(parts.get('fees', '')), clean(parts.get('time', ''))) if parts else (joined, '')
                    elif cols:
                        parts = cells_by_column(row, cols)
                        current.steps.append((one_line(parts['client']), one_line(parts['agency']), one_line(parts['fees']), one_line(parts['time'])))
                    else:
                        # Before the steps header: the requirements table (requirement | where to secure).
                        nonempty = [c for c in row if clean(c)]
                        if len(nonempty) >= 2:
                            reqs = [clean(x) for x in str(nonempty[0]).split('\n') if clean(x)]
                            wheres = [clean(x) for x in str(nonempty[-1]).split('\n') if clean(x)]
                            if len(reqs) == len(wheres):
                                current.requirements.extend(zip(reqs, wheres))
                            else:
                                current.requirements.append((' '.join(reqs), ' '.join(wheres)))
                                current.flags.append('requirements and "where to secure" did not line up: check this table against the PDF')
                        elif len(nonempty) == 1:
                            current.requirements.append((clean(nonempty[0]).replace('\n', ' '), ''))
                if is_start:
                    services.append(current)
    return services


def render(service):
    n = f'{service.number}. ' if service.number else ''
    lines = [f'<!-- pages {service.pages[0]}-{service.pages[-1]} of the PDF -->', f'## {n}{title_case(service.title) if service.title.isupper() else service.title}', '']
    if service.description:
        lines += [' '.join(service.description), '']
    for label, value in service.fields:
        lines.append(f'**{label}:** {value}  ')
    lines.append('')
    if service.requirements:
        lines += ['### Requirements', '', '| Requirement | Where to secure |', '|---|---|']
        lines += [f'| {one_line(a)} | {one_line(b)} |' for a, b in service.requirements]
        lines.append('')
    if service.steps:
        lines += ['### Steps', '', '| Client steps | Agency actions | Fees to be paid | Processing time |', '|---|---|---|---|']
        lines += [f'| {a} | {b} | {c} | {d} |' for a, b, c, d in service.steps]
        if service.totals:
            lines.append(f'| **Total** | | {one_line(service.totals[0])} | {one_line(service.totals[1])} |')
        lines.append('')
    notes = [n for n in service.notes if n.upper() != service.title.upper()]
    if notes:
        lines += ['### Notes in the Charter', ''] + [f'- {n}' for n in notes] + ['']
    for flag in dict.fromkeys(service.flags):
        lines.append(f'<!-- check: {flag} -->')
    return '\n'.join(lines).rstrip() + '\n'


CATEGORY = {
    'registrar': ('enrollment', 'Office of the University Registrar'),
    'cashier': ('enrollment', "Cashier's Office"),
    'student affairs': ('student_services', 'Office of Student Affairs and Services'),
    'infirmary': ('student_services', 'Infirmary (Health Services)'),
    'library': ('student_services', 'Library'),
    'record': ('document_requests', "Records Office"),
}


def suggest(office):
    for key, value in CATEGORY.items():
        if key in office.lower():
            return value
    return ('university_policies', office)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--out', default='knowledge/_drafts/charter')
    ap.add_argument('--external-only', action='store_true', help='skip Internal Services (for employees)')
    args = ap.parse_args()

    services = convert(args.pdf)
    if args.external_only:
        services = [s for s in services if s.kind == 'external']
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    groups = {}
    for s in services:
        groups.setdefault((s.office, s.kind), []).append(s)

    report = {'files': [], 'missing_figures': []}
    for (office, kind), items in groups.items():
        fname = f'{slug(office)}-{kind}.md'
        category, issuer = suggest(office)
        head = f"""---
id: charter-2026-{slug(office)}-{kind}
title: "Citizen's Charter 2026: {office} ({kind.capitalize()} services)"
category: {category}      # suggested; change it if the services fit another category (see knowledge/README.md)
office: {issuer}
version: "2026 (1st Edition)"
publishedAt: TODO      # the date printed on or issued with the Charter; the file name says "Mar30-2026" but that may be an upload date
source: "Isabela State University Citizen's Charter 2026 (1st Edition)"
lastVerifiedAt: TODO
verificationStatus: draft
reviewRequired: true   # remove only after a person has compared this file with the PDF, page by page
---
<!--
  DRAFT generated by tools/charter/charter_to_draft.py. NOT verified. Staff names were left out on purpose.
  Compare every service with the PDF page numbers shown in the comments. Check fees, processing times, requirement lists
  and the order of steps above all. Remove this comment and "reviewRequired" only after checking.
  Also confirm which campus this Charter's offices, locations and processing times apply to.
-->

# Citizen's Charter 2026: {office} ({kind.capitalize()} services)

"""
        body = '\n'.join(render(s) for s in items)
        (out / fname).write_text(head + body, encoding='utf-8')

        # Completeness: figures present in the page text (not in the names column) but absent from the draft.
        draft_nums = numbers_in(body)
        for s in items:
            pdf_nums = numbers_in(re.sub(r'^\s*\d{1,3}\s*$', '', s.raw_text, flags=re.M))
            missing = sorted(n for n in pdf_nums - draft_nums if len(n) > 0)
            if missing:
                report['missing_figures'].append({'file': fname, 'service': s.title, 'pages': s.pages, 'not_in_draft': missing[:30]})
        report['files'].append({'file': fname, 'services': len(items), 'office': office, 'kind': kind})

    (out / '_conversion-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{len(services)} services -> {len(report["files"])} files in {out}')
    for f in report['files']:
        print(f"  {f['file']}: {f['services']} services")
    print(f"{len(report['missing_figures'])} services have figures in the PDF text that are not in the draft (see _conversion-report.json)")


if __name__ == '__main__':
    sys.exit(main())
