# DonkeyFlow
P1 skeleton for Abu Dhabi residents. TypeScript throughout; React + Vite + Tailwind frontend, Cloudflare-compatible Worker API, deployed with ChatGPT Sites.

## Current scope
Landing choices: **Furnish my home** and **Sell everything from my home**.
Furnish: Plan & brief → Rooms → What you need → Bundle → Order.
Sell: Upload → What we found → Your lot.
Workspace: left Plan/Moodboard/Render canvas, right controls. Responsive teal design, Bricolage Grotesque headings, IBM Plex Sans body, IBM Plex Mono numbers.

All API responses are explicitly labeled demo samples. Uploads are not analysed or saved. P1 has no real orders, listings, solver or AI calls.

## Build and verify
Requires Node 24+ (native TypeScript execution) and pnpm.
```sh
pnpm install
pnpm run check
pnpm run build
pnpm run validate
```
No localhost server is required for the Sites workflow. The build creates a self-contained ESM Worker at dist/server/index.js, including frontend assets and cached fixtures.

## Worker API
GET /api/health
POST /api/plan (JSON or multipart)
POST /api/bundle (JSON)
POST /api/intent (JSON: text)
POST /api/sell/detect (JSON or multipart)
POST /api/render (JSON: bundle_id)

Unknown APIs return 404; wrong methods 405; malformed JSON 422.
API stubs use committed data/cache samples.
OPENAI_API_KEY is a server-only Sites secret, read through the Worker env binding. No key is stored in source or browser code; P1 does not need a key. Configure it through Sites environment settings before adding live AI in a later phase.
DEMO_MODE defaults to on. DEMO_MODE=0 reports live processing as unimplemented rather than pretending to invoke AI.

## Sites
.openai/hosting.json identifies this Site. The Sites workflow builds, packages and pushes the exact source commit before deployment. Public access is requested by the user. No credentials are committed.
