# QR handoff overlay — design

Date: 2026-07-23
Status: approved (chat), implementing

## Problem

Staff need to show teens how to follow the line. Today the header buttons
either navigate the *staff device* to `/line` (HomeScreen link) or copy a
staff-domain URL (`gate.netanya.club/line`, App header icon). The real flow
is a physical handoff: the adult taps once, holds the phone up, the teen
scans, the adult taps back and keeps sorting. Nothing should navigate the
staff device away from its session.

## Decision

Both existing buttons become one unified action:

1. Copy the **public** URL `https://line.maple-group.info/` (never the staff
   origin) to the clipboard.
2. Show the existing copied status toast.
3. Open a full-screen in-app QR overlay (no route change, session state and
   socket stay mounted).

Back = top-start button (≥44px) and Escape. Closing returns instantly to the
exact screen the adult was on.

## Approaches considered

- **Full-screen overlay (chosen)** — no remount of the live field screen;
  fastest round-trip mid-session; no routing plumbing.
- Dedicated `/qr` staff route — native browser back, but this app uses
  full-page navigation, so returning reloads the field screen. Rejected.
- **Static committed QR SVG (chosen)** — the URL is a fixed constant
  (`PUBLIC_LINE_HOST`, `apps/web/src/lib/route.ts`); asset is precached by
  the PWA so the handoff works with bad connectivity at the court. The
  committed asset was verified by decoding it back to the exact URL.
- Client-side QR library — flexibility we don't need, plus a dependency.
  Rejected (simplicity-first).

## Components

- `apps/web/src/components/PublicLineQrOverlay.tsx` — presentational
  full-screen dialog: dark `bg` backdrop, white "handoff card" with the QR
  (same visual language as the printed poster), instruction
  `publicLine.qr.instruction` as the dominant text, live/read-only badge,
  URL shown LTR-isolated (`<bdi dir="ltr">`), back button + Escape both call
  `onClose`. Focus moves to the back button on mount.
- `apps/web/src/assets/public-line-qr.svg` — committed QR
  (qrencode, EC level H) encoding `https://line.maple-group.info/`.
- `App.tsx` header icon + `HomeScreen.tsx` header button — both run
  copy(PUBLIC_LINE_URL) → toast → open overlay. HomeScreen's `<a
  href="/line" target="_blank">` is replaced by a `<button>`.
- `apps/web/src/lib/route.ts` — `PUBLIC_LINE_HOST` exported; new
  `PUBLIC_LINE_URL` constant.

## i18n (he.json)

New: `publicLine.qr.instruction`, `publicLine.qr.back`,
`publicLine.qr.dialogLabel`. Reused: `publicLine.openPlayerView.copied`,
`publicLine.openPlayerView.copyFailed`, `publicLine.readOnly`,
`publicLine.realtime`, `publicLine.title`.

## Testing

- New behavior test for `PublicLineQrOverlay` (QR image renders, back and
  Escape fire `onClose`).
- `HomeScreen.test.tsx` / `App.navigation.test.tsx` assertions updated to the
  new contract (button not link; copies the public URL; overlay opens). This
  is a product-requirement change, not a frozen-test fix.
