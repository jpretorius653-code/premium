# ISS Weighbridge — v10

Weighbridge control, ticketing and reporting for Windows (Electron). One codebase, built per brand.

```
electron/            main process — serial, TCP gateway, storage, mailer, licensing
renderer/src/        the UI as modules (manifest.json sets the order)
renderer/brands/     brand packs: iss (flagship), promnatic
renderer/index.html  the built UI — this single file is what ships and what hot-swaps
tools/               build, check, split, dist and licence tools
```

## Build

```
npm install
npm run build:renderer            # renderer/index.html for ISS
npm start                         # run it on this PC
npm run check                     # stale build, parse errors, leaked keys, brand leaks
npm run dist                      # dist/ISS-Weighbridge-Setup-<version>.exe
npm run dist:promnatic            # the Promnatic installer
```

GitHub: **Actions → Build installer → Run workflow**, pick the brand, download the artifact. Pushing a `v*` tag attaches the installer to a release.

Edit files in `renderer/src`, never `renderer/index.html` — the build overwrites it. If all you have is a built v10 renderer from a site PC, `node tools/split-renderer.mjs index.html` turns it back into modules.

## Update a site without reinstalling

Help → **Update UI — open override folder**, copy `index.html` in, restart. The title bar says *UI OVERRIDE* while one is active; remove it before installing a newer EXE.

Once a build carries a licence public key (see below), an override is only loaded with its signature beside it: `npm run licence -- sign-ui renderer/index.html`, then copy **both** `index.html` and `index.html.sig`.

Put a brand's renderer only on that brand's PCs — on first start it swaps the saved company name and ticket logo from any other brand's defaults.

## Brand packs and the logo

`renderer/brands/<id>/brand.json` holds the names, contact details, colours and app id. Artwork is looked up by name, any of png / svg / jpg:

| file | used for |
|---|---|
| `mark` | header, on the dark bar — transparent background |
| `lockup` | sign-in and activation — transparent background |
| `ticket` | tickets — one ink on exact white, sized by height so it never stretches |
| `icon.png` | the EXE and installer, 512 × 512 |

The ISS pack ships with **placeholder vector art**. Drop `mark.png`, `lockup.png` and `ticket.png` from the real logo into `renderer/brands/iss/` and rebuild — a PNG wins over the SVG of the same name.

## Licensing

Nothing changes on site until you do step 1. Without a public key the app runs in *legacy* mode, exactly like 9.9.x.

1. **Once, on your own PC:** `npm run licence -- keygen`
   - private key → `%USERPROFILE%\.iss-licence\private.pem` — back it up offline; never commit it, e-mail it or paste it anywhere
   - public key → `electron/licence-key.pub.pem` — commit it; builds from now on are *signed*
2. **Per PC:** the activation screen and Help → About show the machine ID. Issue a key:
   `npm run licence -- issue --machine 7T5T-RJF9-E525-GZJB --site hillside --tier premium [--expires 2027-12-31]`
3. The site enters the `ISS1.…` key on the activation screen or in the second-authorisation box.

In a signed build:
- a key works only on the PC it was issued for; an edited or expired key is refused
- the old shared phase-2 code no longer completes a **new** install; PCs that already passed phase 2 keep working
- a data folder copied to another PC loses office screens at next start — **weighing and ticketing never stop**
- the installer's first code is still a deterrent only; the machine-bound key is the real control

## Compatibility

- Saved data is untouched: same storage keys, same share-folder layout, same Supabase columns. Order targets are still stored in kg; only the form now takes tonnes.
- `productName` decides the `%APPDATA%` folder. `storage.js` adopts config and state from every name this app has used (ISS, Promnatic, Commodities Variation, Hillside, NovaSpire, A AND N KADIR).
- **appId:** if your existing repo's `package.json` has a different `build.appId`, keep yours (and in the brand pack) so the installer upgrades in place instead of adding a second entry.
- Electron 41.10.7, serialport 13.
