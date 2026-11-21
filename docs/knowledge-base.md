# Knowledge base and retrieval (Phase 4)

How CampusAI answers from university documents, what has been measured, and what has **not**.

## Pipeline

```
documents (Markdown/CSV, front matter)  ->  tools/build-knowledge-pack.mjs  ->  public/knowledge-pack/
   manifest.json  metadata/documents.json  chunks/chunks.json  metadata/lexicon.json

browser:  KnowledgePackService (fetch, SHA-256 check, validate)  ->  Retriever (BM25 index built at load)
question: AnswerPlanner -> route -> [sources] -> model -> CitationManager checks -> source cards
```

* **Chunking** (`ChunkManager`): by heading; lists by item; tables by row with the header repeated; about 900 characters.
* **Search** (`tokenizer`, `BM25`): lowercase, accent folding, English and Filipino stopwords, Porter stemming with a
  curated fix-up table, lexicon aliases at lower weight, spelling correction against words in the documents, BM25
  (k1 1.2, b 0.75; textbook values, not tuned).
* **Validity**: documents that are superseded, expired, archived or not yet in effect (by the device date), and
  unverified ones in official packs, are never sources. If one of them answers a question clearly better than
  anything current, the reply says so and names it.
* **Routing** (README 15.2): `university` (sources to the model), `general` (labelled "General information, not from
  university documents"), `refuse` (fixed text built from the pack, **the model is not called**), `chat` (greetings).
* **Citations**: sources are numbered `[S1]..` in the student's message; the system prompt tells the model to use
  only them. Afterwards: unknown markers are removed; figures that appear in no source, cited sentences that share
  little with their source, and answers with no citation get a visible warning. Source cards show the passage as
  plain text.
* **Safety**: retrieved text is neutralised (hidden characters, chat-template tokens, forged markers), placed in the
  user turn inside a delimited block (never in the system message), and everything shown is set with `textContent`.
* **Drafts**: `tools/extract-text.mjs` makes drafts whose front matter holds `TODO`s and `reviewRequired: true`; the
  builder refuses them until a person has checked them.

## Integrity, honestly

Packs are checked against SHA-256 hashes in `manifest.json`. That proves the files are intact and belong together; it
does **not** prove who published them. Signature verification, installing packs into IndexedDB and version checks
belong to Phase 6. Until then, `Not signed` is shown in Settings. The service worker fetches the pack network-first and
requests files by hash, so offline use works and a half-updated cache cannot mix versions.

## Evaluation (`npm run eval`)

`knowledge/samples/eval/sample-questions.json`: 84 **dev** and 61 **holdout** questions about the fictional Sample
University, written by the developer, with the expected route, document and section.

| | dev | holdout |
|---|---|---|
| fully correct | 83/84 | 42/61 |
| false refusals (answerable, but refused) | 0% | 33% |
| false answers (should have refused) | 0 | 1 |
| stale documents cited | 0 | 0 |

How to read this:

* Everything was tuned on **dev** only. Before tuning, dev was 89% correct. Changes made after reading dev failures:
  "what happens" as question filler, two lexicon aliases, a "how much" ranking cue, the expired-document override,
  generic campus words ("office", "student") never counting as a topic, and a lower specificity floor. The numeric
  settings sit on wide plateaus on dev (for example minimum coverage 0.5 to 0.65 gives the same result) and were not
  fitted to single questions; the specificity floor cannot be constrained by dev at all and was set by reasoning.
* The holdout was run before tuning (aggregate only) and once after. Its individual failures were looked at only after
  tuning was finished. It is therefore a fair but not pristine estimate, and nothing was tuned to it.
* The holdout is much worse than dev. Most misses are **too-cautious refusals**: the student's wording does not
  appear in the document ("penalty" versus "suspended"). That is the safe direction, and it is the main limit of
  lexical search. Growing the lexicon from real questions helps; embeddings would help more (not built).
* One holdout case is a **false answer**: a general arithmetic question ("What is 15 percent of 2,400?") matched a
  scholarship passage containing "percent" and numbers. The answer-time figure check should flag a computed number,
  but this was not tested with a real model.
* Known miss on dev: a bare follow-up ("How much is the fee?" after a question about ID replacement) is answered from
  tuition because it is answerable on its own.
* Questions like "Who is the University President?" can reach the model with passages that mention the topic but do
  not contain the answer; the prompt tells the model to say so, and that is **untested without a real model**.

## What is not verified

* **No real ISU content exists yet.** Everything measured used fictional text. Real documents (Student Manual,
  Citizen's Charter) must be requested from the campus.
* Thresholds (`RETRIEVAL_DEFAULTS` in `Retriever.js`) are provisional and must be re-tuned on real documents and the
  real student questions (README 8.10).
* The real language model could not run in the build environment (no GPU, model host blocked). Prompt rules, the
  hybrid "General information:" sentence and citation behaviour are tested only with scripted fake replies.
* PDF extraction was tested on synthetic PDFs, not on real university files; tables are not reconstructed and
  scanned pages need OCR, which is not done.
* Filipino and regional-language support is minimal.

## Converting the Citizen's Charter (`tools/charter/charter_to_draft.py`)

The ISU Citizen's Charter 2026 (1st Edition) is a long run of near-identical service pages (requirements, steps, fees,
processing time). The generic extractor cannot rebuild those tables, so there is a one-off converter that reads them with
`pdfplumber` (`pip install pdfplumber`):

```
python3 tools/charter/charter_to_draft.py path/to/charter.pdf --external-only
```

It writes one DRAFT Markdown file per office and service kind into `knowledge/_drafts/charter/` (git-ignored). The
drafts keep `reviewRequired: true` and `TODO` fields, so `npm run pack` refuses them until a person has compared them with
the PDF. Choices that matter:

- **Staff names are left out.** The "with names" edition lists employees per service. They are personal data and are not
  needed to answer a student's question.
- **Continuation rows are flagged.** Tables that continue on the next page are merged, with a "check" comment.
- **Completeness report.** `_conversion-report.json` lists numbers, fees and times found in a service's PDF text that are
  missing from the draft. On the 2026 edition only one internal procurement service is flagged.
- **Internal services** (for employees) are written too, unless `--external-only` is given. Student-facing packs
  need only the external ones.
- It is not covered by `npm test` (it needs Python and a real PDF), so treat its output as a draft.

What a reviewer must still confirm: fees and processing times, requirement lists, step order, the publication date (the
file name's "Mar30-2026" may be an upload date), and **which campus** the Charter's offices and processing times describe.
The PDF is the university-wide charter and names Cabagan only in its history section.
