# Changelog

## 10.0.0 — ISS flagship rebuild (from 9.9.3)

**Design**
- Dark flagship palette with hairline borders, three surface steps and glass only on sign-in, modals, the command palette and the weighboard. Tickets, reports and e-mails stay white paper.
- Weights, plates and ticket numbers use Bahnschrift (DIN lineage, on every Windows PC) with tabular figures.
- Overweight is a slow red glow on the header and the live-weight card; the flashing is gone.
- Stable / in motion / **no signal**. With no indicator talking, 9.9.3 showed "IN MOTION" at 0 kg.

**New**
- **Ctrl+K command palette** — trucks on site, tickets, orders, fleet, screens and actions, all behind the same permission and licence gates as the tab bar.
- **Scale telemetry** — indicator data freshness (catches "port open, indicator silent"), reading state, deck agreement, capacity, last save and cloud status.
- **Brand packs** — ISS and Promnatic from one codebase; the hard-coded Promnatic branding in 9.9.3 is gone. Existing configs carrying another brand's defaults are migrated once.
- **Machine-bound signed licences** (Ed25519, verified in the main process) and **signed UI overrides**. Off until a key is generated — see README.

**Fixed**
- Order numbers match ignoring spaces and case ("RET 2158" = "RET2158") on the weigh form, manual weigh, imports and cloud pull; near-duplicates are flagged on the Orders screen.
- Order target is entered in tonnes (was kg while operators typed tonnes); 0, blank and −1 mean no target everywhere.
- Fleet restrictions compare registrations without spaces.
- E-mail attachments were unreadable: the multipart boundary ran into the part headers (`mailer.js`).
- Records totals header grid, header readout thousands separator, white box in the serial analyser.
- Build no longer points auto-update metadata at the Promnatic repository.

**Engineering**
- Renderer split into 57 source files with a build step that refuses to write a renderer that does not parse; `tools/check.mjs` catches stale builds, leaked keys and brand leaks; `tools/split-renderer.mjs` reverses a build.
- Preload runs sandboxed. GitHub Actions workflow builds either brand.
