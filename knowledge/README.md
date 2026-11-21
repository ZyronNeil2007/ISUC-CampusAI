# Knowledge base

The documents CampusAI answers from. Only **verified** university information may be published (README 8.5, 8.9).

```
knowledge/
  pack.yml        pack settings (campus name, versions)
  lexicon.yml     how students write: aliases, campus names, campus terms, starter questions
  <category>/     one folder per category; Markdown documents, or CSV for directories
  samples/        FICTIONAL "Sample University" content, for tests and demos only
  _drafts/        extracted drafts (not packaged, not committed)
```

## Workflow

1. **Collect** an official document (Student Manual, Citizen's Charter, an office's current form...). Real documents must be requested from the campus; nothing here is invented.
2. **Extract** a draft: `npm run extract -- path/to/file.pdf` writes `knowledge/_drafts/<name>.md`. It reads the text layer only (no OCR) and flags what to check.
3. **Review** against the original, line by line. Fix numbers, dates, fees and names. Rebuild tables. Replace every `TODO` in the front matter.
4. **Verify** with the owning office: set `verificationStatus: verified` and `lastVerifiedAt`, and delete `reviewRequired`.
5. **Move** the file into its category folder and run `npm run pack:check`, then `npm run pack` to build `public/knowledge-pack/`.
6. **Evaluate** with `npm run eval` (see `docs/knowledge-base.md`).

## Front matter

```yaml
---
id: registrar-document-requests     # lowercase letters, digits, hyphens; unique
title: How to Request Documents
category: document_requests         # see CATEGORIES in src/ai/retrieval/packFormat.js
office: Office of the University Registrar
version: "1.0"                      # a quoted string
publishedAt: 2026-01-05             # YYYY-MM-DD, from the document itself
effectiveAt: 2026-01-05             # optional: not used before this date
expiresAt: 2026-12-31               # optional: not used after this date
verificationStatus: verified        # draft | verified | superseded | archived
lastVerifiedAt: 2026-11-01          # required when verified
supersededBy: new-document-id       # only with verificationStatus: superseded
source: ISU Citizen's Charter 2026, p. 14
tags: [tor, requests]
---
```

Superseded and expired documents stay in the pack so CampusAI can say "that document was replaced" instead of guessing; they are never used as sources.

## Writing for retrieval

- Use headings (`##`) for each topic; the heading becomes the section name shown in citations.
- One fact per sentence; keep fees, dates and requirements next to the thing they belong to.
- Use the words students use, or add them to `lexicon.yml` as aliases.
- Mark pages with `<!-- page: 12 -->` when copying from a PDF so citations can name the page.
- Directories (offices, contacts) are CSV files with a `.meta.yml` beside them.

## Commands

| Command | What it does |
|---|---|
| `npm run extract -- <file>` | PDF/HTML/text to a draft in `knowledge/_drafts/` |
| `npm run pack:check` | Validate without writing anything |
| `npm run pack` | Build the official pack (verified documents only) |
| `npm run pack:draft` | Include unverified drafts, for team review only |
| `npm run pack:sample` | Build the fictional sample pack |
| `npm run dev:sample` | Build the sample pack and start the dev server |
| `npm run eval` | Retrieval and routing evaluation |

## Campus map

An optional `campus-map.yml` in this folder becomes the Campus Map page. Copy the shape from
`samples/campus-map.yml`, but use real, verified positions only: leave `accessibility` out when it is not verified, and
set `verificationStatus: verified` only after the Physical Plant or Planning office has confirmed the layout. An official
pack refuses a map that is not verified. Without this file the map page says no map has been published. See
`docs/campus-modules.md`.
