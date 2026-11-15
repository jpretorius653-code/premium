# Changelog

## 10.1.0 — Daylight theme

- **Settings → Appearance**: choose *Flagship* (the existing dark look) or *Daylight*. Daylight puts forms, tables and reports on white for a bright weighbridge cabin and keeps the header, the live reading and the weighboard strip dark, so the reading looks the same in both themes. Per PC; nothing changes until it is chosen.
- CSS only (`renderer/src/styles/daylight.css`) plus the picker. Tickets, reports and e-mails are unaffected.

## 10.0.1 — two PCs on one site can no longer lose a ticket

Cause: MMS, November 2026. Two weighbridge PCs issued the same ticket numbers; tickets were then dropped on upload, overwritten, or weighed out twice. See `Iss-RM/docs/TICKET-LOSS-ANALYSIS.md`.

**Ticket numbering**
- **Station code** (Settings → Ticket numbering). Give each PC of a two-PC site its own letter and each issues its own series (`WBA-001`, `WBB-001`). The counter is then private to the PC, so a clash is impossible with or without the shared folder. Blank keeps the old shared series — single-PC sites change nothing.
- The counter can never sit below the highest number already issued. A PC whose counter restarted (new PC, reinstall, cleared storage) used to walk up from 1 and re-issue the numbers of voided and on-site tickets.
- The duplicate check now covers finished, voided and on-site tickets, not finished ones only.
- "Set next number" refuses a number at or below one already issued. A reset arriving from the other PC is floored the same way.

**Shared folder**
- A failed write is no longer ignored. Records are re-pushed until they land; a "truck has left" tombstone that fails is queued (survives a restart) and retried every pass.
- A finished ticket ends the visit: any on-site entry with the same row id is removed on every PC, whatever happened to its tombstone.
- A tombstone only removes a visit that began before it; the same truck coming back in is not wiped by yesterday's tombstone.
- A corrected ticket from the other PC replaces the local copy only when it is the same ticket (same row id). Before, a different truck under the same number was deleted by it.

**Weigh-out**
- Before the 2nd-weight list opens the app pulls the share (1.5 s cap), and a truck that already has a finished ticket is refused at selection and again at save.

**Cloud upload**
- A ticket the cloud refuses because its number belongs to another ticket is **not** marked as sent any more. It stays queued and is named in red on the Cloud tab.
- An on-site entry whose visit already has a finished ticket is never uploaded as `open`.

**Tests**
- `node tools/test-sync.mjs` runs two simulated PCs against one in-memory shared folder.

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
