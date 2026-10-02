# DonkeyFlow
DonkeyFlow for Abu Dhabi residents. TypeScript throughout; React + Vite + Tailwind frontend, Cloudflare-compatible Worker API, deployed with ChatGPT Sites.

## Current scope
Landing choices: **Furnish my home** and **Sell everything from my home**.
Furnish: Plan & brief → Rooms → What you need → Bundle → Order.
Sell: Upload → What we found → Your lot.
Workspace: left Plan/Moodboard/Render canvas, right controls. Responsive teal design, Bricolage Grotesque headings, IBM Plex Sans body, IBM Plex Mono numbers.

Floor plans use live vision analysis and D1 caching. Furniture bundles use the D1 catalog and a deterministic TypeScript solver. Video selling uses browser frame extraction and live vision detection; published lots are saved in D1. Room renders use the image API and R2 caching. Style interpretation and order booking remain previews.

## Build and verify
Order quotes show one truck, editable pickup counts, per-item assembly and furniture/service totals. Delivery is AED 250 + AED 50 per pickup; assembly is AED 90 per selected item. The move-in request offers tower service-lift or villa/townhouse gate access wording, editable fields and a printable/downloadable HTML draft. Requests are prepared locally and must be submitted to management by the resident; no booking or payment is performed.

Requires Node 24+ (native TypeScript execution) and pnpm.
```sh
pnpm install
pnpm run check
pnpm run build
pnpm run validate
```
No localhost server is required for the Sites workflow. The build creates a self-contained ESM Worker at dist/server/index.js, including frontend assets and cached fixtures.
Both Vite builds inject the current Git HEAD SHA at build time. The footer shows `build <short sha>` and GET `/api/health` includes `commit` with the full SHA alongside its health fields. Commit source changes before the production build so the deployed identifier matches the pushed commit; native TypeScript tests use `development` without build injection.

## Worker API
GET /api/health
POST /api/plan (JSON: plan_id, or multipart: file / floor_0 and optional floor_1)
POST /api/bundle (JSON)
POST /api/bundle/intent (JSON: text, bundle)
POST /api/intent (JSON: text)
POST /api/sell/detect (JSON: frames [{seen_at_s, image_url}])
POST /api/sell/publish (JSON: mode, items)
POST /api/render (JSON: bundle, room, style)
GET /api/media/renders/{bundle_hash}.png

Unknown APIs return 404; wrong methods 405; malformed JSON 422.
Other API stubs use committed data/cache samples.
OPENAI_API_KEY is a server-only secret, read through the Worker env binding. No key is stored in source or browser code. Sites provisions the `DB` binding declared in `.openai/hosting.json` and applies the schema-only `drizzle` migrations packaged by the build. `db/schema.ts` is the schema source; run `pnpm db:generate` after changes. The legacy `migrations` SQL files support standalone D1 installs; do not apply both migration systems to the same database.
DEMO_MODE controls the remaining demo endpoints; plan and bundle endpoints always use live data.

## Bundle API and catalog

`pnpm catalog:prepare` reads the root `../catalog.json`, preserves all 400 listings, converts centimetres to metres, and writes `data/catalog.json` (versioned runtime import) and `data/catalog.seed.sql` (standalone D1 import). Unsupported category mappings, unknown dimensions and missing retail benchmarks are retained as null rather than invented. The runtime imports the snapshot into `catalog` using bound upserts in batches of 50 on the first bundle request, recording its content hash in `catalog_imports` only after every batch succeeds. Failed imports can be retried safely. Schema creation happens only in deployment migrations. Subsequent requests select candidates from D1, not the snapshot.

```json
{
  "rooms": [
    {"id":"living","type":"living","name":"Living room","width_m":6,"length_m":7,"floor":0},
    {"id":"bedroom","type":"bedroom","name":"Bedroom","width_m":5,"length_m":5,"floor":0},
    {"id":"study","type":"study","name":"Study","width_m":3.125,"length_m":3,"floor":0}
  ],
  "needed_categories": ["sofa","bed","desk"],
  "budget_aed": 3000,
  "style": ["modern","minimalist"],
  "pins": {"sofa":"D0001", "desk":"remove"}
}
```

`length_m` or `depth_m` is the room depth. Missing measurements return 422 only for rooms selected for requested furniture; measured eligible rooms are preferred. Supported categories: bed, wardrobe, nightstands, sofa, tv_unit, coffee_table, dining_set, desk, armchair, rug, floor_lamp. One listing is selected per requested category across the plan; the first suitable room in plan order is used, with desks preferring study/office. Include excluded rooms in the input so a walk-in closet can suppress wardrobe selection. Catalog categories are mapped conservatively: console/dining-only tables and office/dining chairs are not sold as coffee tables or armchairs. Lamps, rugs and standalone nightstands currently have no listings in the supplied collection.

Candidates must have known dimensions and retail benchmarks. Each oriented footprint must be within room width and depth minus 0.6 m; wardrobes rotate 90° on the right wall. Start with cheapest candidates, drop unpinned optionals in floor_lamp → rug → nightstands → armchair → dining_set → desk order when over budget, then repeatedly choose the feasible upgrade with the greatest incremental retail/price ratio. Free retail improvements rank first; style matches and item IDs break ties deterministically. Monetary comparisons use integer fils. Pins are never substituted, upgraded or dropped for budget; invalid pins return 422. An unaffordable required/pinned set returns 409, with its minimum cost.

Placements use room-local top-left metre coordinates and include floor and oriented width/depth. Beds are centred on the top wall, wardrobes on the right, nightstand listings beside the bed, sofas on the bottom, TV units on the top, coffee tables 0.6 m in front of sofas, dining sets in the opposite top-right corner, and desks in the study when present. Rugs may underlay furniture; other anchored footprints cannot overlap. Optional anchor conflicts are omitted in the same priority order, while infeasible required/pinned layouts return 409. Returned `omitted` entries explain unavailable categories and omissions. Dimensions from this catalog are often estimates; confirm measurements and listing availability before purchase.

Each item returns `placement`, `price_aed`, `retail_aed`, `saving_pct`, `co2_kg` and `co2_is_estimate`; aggregate totals, remaining budget, placements and omissions are returned too. CO₂ factors are illustrative estimates per listing in `shared/catalog.ts`, not measured lifecycle claims. Retail benchmarks retain their original source metadata.

Item selection and pricing stay deterministic. The explanation uses a small model: `BUNDLE_EXPLANATION_MODEL` defaults to [gpt-4.1-mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini). The model produces two sentences with placeholders for room sizes and spending; TypeScript fills every numeric fact from the computed result. Missing credentials, upstream errors and invalid model prose use a labelled deterministic fallback without changing selection or totals. `explanation_source` and `explanation_model` expose which path was used. The stable bundle ID excludes generated prose.

The Bundle step’s “Tell us what to change” box calls POST /api/bundle/intent with 1–500 characters and the current bundle (items, needed_categories, budget_aed). `INTENT_MODEL` defaults to `gpt-4.1-mini`; `COST_INTENT_USD` defaults to 0.01. The Responses call uses strict structured output, store:false and a 20-second timeout. It interprets at most eight actions and never chooses items or prices. Output is validated against available categories. Missing keys, capped spend and failed model calls use a basic regex parser and return source:rules.

POST /api/bundle accepts ordered `actions` alongside the existing single `action`. Remove/add, budget, style, cheaper/better and target colour changes use the solver; infeasible changes are skipped with `notes`. Returned needs, pins, budget and style reflect successful changes. The UI shows parsed actions and reply, basic-rules feedback and solver notes, and offers Undo to restore the preceding bundle and preferences.

## Plan analysis

`PLAN_VISION_MODEL` defaults to `gpt-6-astra`, the most capable model identified by [official OpenAI documentation](https://developers.openai.com/api/docs/models/gpt-6-astra). Configure it if your account requires another vision model supporting Responses and strict structured outputs. An unavailable model returns an explicit error; there is no silent downgrade.

The endpoint makes two separate calls with strict JSON schemas: first transcribe dimension labels exactly, then assign them to rooms. Image inputs use `detail: high`. Dimensions unsupported by the transcript stay null in D1. At response time, missing furnish-room sizes use the matching catalogue plan in `data/plan_fallbacks.json`, then typical room defaults; filled sizes are labelled estimated and carry a confirmation warning. Catalogue plans also return a complete typical plan (`model: fallback`) when AI calls fail or are unavailable, including at the spend cap. Uploaded plans retain model errors. Filled sizes and full fallbacks are never cached, so old all-null cached results benefit without a cache-key change. Printed values are never rounded. Floor indices are zero-based. Coordinates represent top-left corners in metres; conflicting placements are cleared and flagged rather than altering printed sizes. Unknown placement stays null. The SVG draws measured rooms separately when placement cannot be verified.

PNG/JPEG/WebP are validated by file signature, and requests are capped at 24 MB. Direct PDF uploads are reduced to page 1 with pdf-lib and sent as a Responses PDF file input. PDF file inputs have no `detail` parameter. The frontend rasterizes page 1 to PNG before cropping/upload, so browser PDF uploads use `detail: high` too. Upload one image per floor, or select two floors and crop each separately from the same image.

Choose catalogue plans from `data/plans.json`, mirrored from the collected root `plans.json`; the corresponding images are committed in `frontend/public/plans` so builds are self-contained. JSON example: `{ "plan_id": "6641" }` analyses both floor images in that plan.

Responses include the requested plan fields, `model`, `image_hash`, `cached`, `dimension_labels`, and `warnings`. D1 stores each successful result under a SHA-256 image hash, ordered by floor for multi-floor inputs, with model and prompt version in the cache key. Raw uploads are not stored. Optional `furniture: [{room_id, width_m, length_m}]` (JSON or a JSON-encoded multipart field) adds fit checks, allowing rotation. Checks are recalculated on cache hits, and furniture-specific warnings are not persisted in the shared image result. Living rooms below 12 m² or rooms that cannot fit their furniture receive `check size`.

Tests mock the vision API and D1; live API quality and database deployment require configured credentials and bindings.

## Video selling and rendering

The browser decodes videos with video/canvas, samples at 0, 3, 6… seconds (maximum 20 frames), downsizes to 960 pixels and sends JPEG data URLs to detection. No ffmpeg and no whole-video upload. OpenAI receives only these frames. A strict vision schema returns movable furniture/appliances, a stable physical-object key and normalized crop boxes. Repeated views merge by object key; built-ins are excluded. Crops are created in the browser. Estimated retail × condition factors (like_new 0.45, good 0.35, fair 0.22) produce prices rounded to AED 10. Users edit prices and select included pieces. Publishing saves selected items, crop thumbnails, edited total, mode and 60% cash offer to sell_lots in D1. This records an offer/listing; no payout is processed.

Render requests select items placed in the chosen living room and describe type, colour, material, style, dimensions and room size. Those details are sent to OpenAI's image-generation API. PNGs are stored in the RENDERS R2 binding. SHA-256 cache keys include normalized room/furniture/style data, prompt version and image model; changed prices or bundle ordering do not regenerate the same scene. Configure server-only OPENAI_API_KEY, optional SELL_VISION_MODEL (gpt-4.1-mini), and IMAGE_MODEL (gpt-image-1). The hosting manifest provisions DB and RENDERS; deployment applies the packaged Drizzle migration.

## Sites
.openai/hosting.json identifies this Site. The Sites workflow builds, packages and pushes the exact source commit before deployment. Public access is requested by the user. No credentials are committed.

## AI spend cap

Set these optional Worker environment variables in Site settings (defaults shown):
```env
PLAN_REASONING_EFFORT=high
SPEND_LIMIT_USD=5
COST_PLAN_CALL_USD=0.50
COST_DETECT_USD=0.15
COST_RENDER_USD=0.25
COST_EXPLAIN_USD=0.01
COST_INTENT_USD=0.01
INTENT_MODEL=gpt-4.1-mini
```
`PLAN_REASONING_EFFORT=none` or any `gpt-4` plan model omits reasoning. Otherwise effort defaults to high. Each of the two plan passes reserves USD 0.50. Every live AI call atomically reserves its conservative estimate in D1; missing DB or unavailable spend accounting refuses the call. Estimates remain charged when actual dollar cost is unavailable, including failed calls. These estimates bound reserved spend, not provider billing; set estimates conservatively for your models. Saved plan/render results remain available at the cap; bundle explanations fall back to computed facts and are cached per stable bundle ID in the Worker isolate. Health reports spend, limit and remaining USD (null when accounting is unavailable).
