# Pack Runtime Contract v1

Reframe Studio authors `.view.json` packs. **Vanilla Nuvio** (Netflix home) is the runtime. Studio never paints the TV — only fields listed as **Honored** affect what users see after import.

Target presentation: **Netflix home** (`HomeLayout.NETFLIX` / pack-forced Netflix). Not Modern chrome.

## Honored (vanilla Nuvio)

| Studio control | TV behavior |
|----------------|-------------|
| Block **Y-order** + `dataSource` (`catalog:…`, `collection:…`, `collection:…:folder:…`, `genres`) | Strict home rail order / filter — no Netflix fan-out or discovery injection while pack is active. Studio “Expand into folder content rails” becomes one title rail per folder catalog. |
| **Hero** block (`type: hero` or `dataSource: featured` / catalog source) | Netflix inset hero pinned to that source |
| Pack `showFocusedPosterInfo` | Netflix catalogue footer (title / facts / synopsis) under catalog & collection rails |
| `rotateUnlocked` (+ interval / seed) | Unlock-rotate of unlocked rails (order-only) |
| Rail **height** → scale | Card size vs Continue Watching baseline (Netflix geometry; strips focused-info reserve when footer on) |
| Pack `collectionsOpenInReframe` | All collection folders open in this pack’s Netflix / Reframe presentation (not the old grid) |
| Per-rail `collectionOpenStyle: "reframe"` / `"grid"` / `"rows"` | Overrides the pack global for that collection only |
| Per-block `trailer` (hero + catalog rails) | In-card / hero trailer autoplay when Layout trailers are also enabled |
| Per-block `posterGrow` (catalog rails) | Focus expands card to landscape width; `false` keeps portrait |
| Pack `catalogPosterScale` | Global catalog/media poster size (0.7–2.0); with focused info on, max still leaves ≥2 footer lines |
| Pack `collectionLandscapeScale` | Global collection hub landscape tile size (0.7–2.0) |
| Continue Watching / top nav blocks | Chrome the TV already owns (presence acknowledged; not freeform-placed) |

## Ignored (preview-only / later)

| Studio field | Why |
|--------------|-----|
| Absolute `x` / `y` / `w` (pixel canvas) | Semantic order only; Y used for sort, not layout coords |
| `spacer` as TV chrome | Preview breathing room only |
| `hAlign`, `contentAlign` | Not wired on vanilla Netflix path yet |
| Per-block `showPosterLabels` except as legacy → pack flag | Prefer pack-level `showFocusedPosterInfo` |
| Modern Featured banner knobs | Packs drive Netflix inset hero, not Modern |

## Import path

1. **Send to TV** (signed into the same Nuvio account as the TV) UPSERTs the pack into Supabase  
   `view_pack_blobs` via `sync_push_view_pack`, and pushes genre chip destinations via  
   `sync_push_home_catalog_settings`. The TV polls for a new pack and shows an Accept dialog  
   that applies + refreshes home without reopening the app.
2. Layout → View pack → **Import** still accepts HTTPS / `nuvio://viewpack?url=…` / raw `.view.json`  
   on the clipboard (optional / offline).
3. **File drop (debug):** push `current.view.json` to the app external files dir  
   (`/sdcard/Android/data/<package>/files/current.view.json`) — auto-imports on next home load.

Active pack forces Netflix presentation when Netflix UI is available.

Package ids commonly used for debug builds: `com.nuviodebug.com` (fullDebug). Stock product id remains `com.nuvio.tv` / `com.nuvio.app`.

## Schema

- `schemaVersion: 1`
- Same JSON Studio publishes today; vanilla expands which fields it consumes over phases.

## Rule for contributors

**Do not add Studio UI for a control until vanilla honors it** (or mark it clearly “Preview only — not on TV yet”).

See also: `RELATED.md` for repo roles and upstream packaging notes.
