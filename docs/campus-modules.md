# Campus modules (Phase 5)

The Campus Directory, Campus Map, Student Guide and Announcements pages are **views over the knowledge pack**. No campus
fact is written into the app. If a pack is missing, broken or has nothing on a topic, the page says so; it never fills
the gap.

| Page | Built from | Rules it follows |
|---|---|---|
| Campus Directory (`#/directory`) | documents in category `campus_offices` (one table row = one office) | only documents in effect; columns the app does not know are kept and shown; search needs every word |
| Student Guide (`#/guide?topic=…`) | academic, admission, enrollment, scholarship, student-life and document-request documents | expired, replaced, archived and unverified documents are listed under "Not shown", never as current content |
| Announcements (`#/announcements`) | documents in category `announcements` | publication, effective and end dates shown; expired ones are marked and kept apart under "Earlier" |
| Campus Map (`#/map`) | optional `metadata/map.json` | schematic only; the pack's verification status and last-verified date are shown |

All text from the pack reaches the page through `textContent` (`src/utils/safeText.js`, `src/pages/shared/packView.js`).
A test fails if these files use `innerHTML`.

## The campus map

The map is a **schematic**: labelled rectangles for buildings and dashed walkways between their entrances. It is not to
scale, has no distances or walking times, and uses no online map tiles, so it works offline. README 6.5 suggests
Leaflet with local map data; a schematic from a small data file was chosen for the prototype because there is no verified
survey data yet, and a drawing that looks precise would claim more than the data supports. Leaflet can replace the
drawing later without changing the pack format's role.

The source is `knowledge/campus-map.yml` (see `knowledge/samples/campus-map.yml` for the shape):

- `buildings`: id, name, category, position and size on the drawing, optional `entrance`, `description`, and
  `accessibility`. **Leave `accessibility` out unless it is verified**; the page then says none has been verified.
- `nodes`: unlabelled or labelled junctions (for example "Central quadrangle").
- `walkways`: pairs of building or node ids. Directions are the shortest route over these walkways, and list only the
  named places along the way. If the walkways do not connect two places, no route is shown.
- An official pack requires `verificationStatus: verified`. A verified map cannot contain `TODO`.
- Offices are linked to a building only when the directory's *Location* text contains the building's name.

The map is a normal pack file: it is listed in the manifest with its SHA-256 hash, fetched by hash and checked on load.
A pack without `campus-map.yml` is valid; the map page then says that no map has been published.

## Admission checklist

The Student Guide's admission and enrollment topics include a personal checklist (README 6.3). It is stored in this
browser only (`localStorage`), is never sent anywhere, and says it is not an official record and does not mean the
student is admitted or enrolled. Phase 6 owns real storage; this is a per-browser convenience.

## Not done / limits

- **No real ISU content yet.** Everything shown in development is fictional sample data, labelled as such on every page.
- Announcements come only with the pack. Same-day changes (class suspensions) cannot appear offline, and the page says so.
- The map has no real survey data, so no real building positions, accessibility facts or walking distances.
- The directory reads "Label: value" rows. A real directory with very different columns will still list them, but the
  layout has only been tried with the sample file.
- Pack updates, installation and signatures remain Phase 6.
