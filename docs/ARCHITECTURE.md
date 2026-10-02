# DonkeyFlow · Sites architecture
This document reconstructs the supplied architecture for the TypeScript-only Sites request. No original docs or prototype were supplied.

React/Vite/Tailwind UI → same-origin Cloudflare Worker → committed demo fixtures.
TypeScript only. No Python process or filesystem writes at runtime.
P1 includes navigation, panels, sample floor plan, moodboard palette, render placeholder and six API stubs.
Later phases add vision parsing, room editing, deterministic bundle solving, render generation, sell publishing and order PDFs.
Secrets belong to Sites runtime env. Media uploads and durable data will need R2/D1 in future phases; no unused storage is provisioned in P1.
