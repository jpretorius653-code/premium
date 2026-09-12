// ── Brand assets ──────────────────────────────────────────────────────────
// Artwork comes from the brand pack the build injected (renderer/brands/<id>).
// Drop mark.png / lockup.png / ticket.png into that folder to replace the
// placeholder vector art, then rebuild.
//   BRAND_MARK    compact mark for the header (dark surfaces)
//   BRAND_LOCKUP  full lockup for sign-in / activation (dark surfaces)
//   BRAND_TICKET  one-ink rendition for paper — thermal heads print black or nothing
const BRAND_LOCKUP = BRAND.lockup || '';
const BRAND_MARK   = BRAND.mark || BRAND_LOCKUP;
const BRAND_TICKET = BRAND.ticketLogo || BRAND_LOCKUP;
let LOGO_IMG = BRAND_MARK;
