# design.md — Queue Manager Design System

Source of truth for visual + interaction design. Implements [docs/prds/client-prd.md](./docs/prds/client-prd.md); mock reference: the "Shared UI Kit" artifact (2026-07-10).
Tokens live in [`apps/web/src/index.css`](./apps/web/src/index.css). Components in [`apps/web/src/components/`](./apps/web/src/components/).

**One deliberate constraint:** single dark theme. This app is used outdoors, in the evening, at a football pitch — dark high-contrast is the product decision, not a preference toggle (client-prd §2). The token hierarchy still exists so a second theme is a token override away, never a component change.

## 0. Hierarchy & model: the line is the hero

**The app manages the LINE, not matches.** The queue is a **line of single teams** — one team per row, never "A vs B". Two teams pair into a match only at **kickoff**, when a field is free and the front two go play. (Pattern reference: Spotify/SoundCloud "Up Next" — a prominent now-playing header above single-item rows.)

The manager's job is deciding **who's next in line** — the countdown is a status readout, not the point of the app. Every layout decision follows:

- The **line** owns the majority of the main screen and the largest text (single-team rows, 17px, 64px min height).
- The **front team** gets the accent "הבא" treatment — it's next to play.
- The live **match** (the only place two teams appear together) is a compact status header at the top: the pairing + inline 32px timer + controls. Glanceable, never dominant.
- The **free field** shows the front two teams and a "התחל: A נגד B" kickoff button.
- When space competes, the line wins.

---

## 1. Token architecture

```
Layer 1  primitives   raw values, named by hue+step      --green-300: #3BE081
Layer 2  semantic     what it means, Tailwind utilities   --color-accent → bg-accent/text-accent
Layer 3  component    how a component uses it             --btn-height-big: 60px
```

Components consume **semantic utilities + component tokens only** — never primitives. Rule of thumb: if a component file contains a hex value, it's a bug.

### Primitives

| Token | Value | |
|---|---|---|
| `--green-950` | `#06130B` | text on accent |
| `--green-900` | `#0B100D` | page ground |
| `--green-850` | `#141C16` | card |
| `--green-800` | `#1C2620` | raised |
| `--green-700` | `#28352C` | hairline |
| `--green-500` | `#1E5C38` | accent wash |
| `--green-300` | `#3BE081` | pitch green |
| `--gray-300` | `#90A697` | green-biased gray |
| `--gray-100` | `#EAF2EC` | near-white |
| `--amber-400` | `#F2B94F` | amber |
| `--red-400` | `#F0584C` | red |

The neutrals are deliberately green-biased (never pure gray) so surfaces feel like one material with the accent.

### Semantic (Tailwind v4 `@theme` → utilities)

| Semantic token | Utility examples | Meaning |
|---|---|---|
| `bg` | `bg-bg` | page ground |
| `surface` / `surface-2` | `bg-surface`, `bg-surface-2` | card / raised element |
| `line` | `border-line` | hairline borders |
| `ink` / `muted` | `text-ink`, `text-muted` | primary / secondary text |
| `accent` / `accent-dim` / `on-accent` | `text-accent`, `bg-accent-dim` | live state, primary actions |
| `warn` | `text-warn` | paused, soft warnings, private notes |
| `danger` | `text-danger` | ending, destructive |

**State color language (never color alone — always paired with a label):**
live = accent · paused = warn · ending/finishing = danger · free/neutral = muted.
Semantic state colors are not decoration; `accent` doubles as the single brand hue.

### Component tokens

`--btn-height` 52px · `--btn-height-big` 60px · `--touch-target-min` 44px · `--timer-font-size` 32px · `--queuerow-min-height` 64px · `--btn-radius` 12px · `--fieldcard-radius` 14px.

## 2. Typography

- **One family** (system stack — zero font payload, native Hebrew rendering): `-apple-system, "Segoe UI", Roboto…`; mono stack for digits.
- Scale: 12.5 (meta) · 14.5 (body-s) · 16 (body/buttons) · **17 (queue rows — largest running text)** · 17.5 (primary buttons) · 19 (sheet titles) · 32 (timer readout).
- All time/number runs: `font-variant-numeric: tabular-nums` (`.tabular`) and LTR-isolated (`<bdi>` / `dir="ltr"`).

## 3. RTL rules (hard requirements)

1. `<html lang="he" dir="rtl">` — set once in `index.html`.
2. Logical properties only: `ms-*/me-*/ps-*/pe-*`, `start/end`. `ml/mr/left/right` are forbidden (CI grep).
3. Times, countdowns, score-like numbers render LTR inside RTL text: wrap in `<bdi>` or `dir="ltr"`.
4. Directional icons (chevrons/arrows) flip with `rtl:` variants or use direction-neutral glyphs.
5. Every user-facing string comes from `src/i18n/he.json` via `t()` — hardcoded Hebrew in JSX is a CI error (devRules N-13).

## 4. Interaction rules

- **Touch targets:** ≥44px always; standard controls 52px; primary live actions 60px (`--btn-height-big`). Outdoor, gloves, one-handed.
- **No blocking popups in live flows:** destructive queue action → undo toast (5s); finish → informational toast without undo; impossible → disabled button + visible reason; rejected (409) → inline error at the origin, auto-clears. Dialogs allowed only for session setup / settings / staff admin.
- **Feedback ≤100ms:** state change is the success signal; subtle haptic where supported.
- **Motion:** 150–200ms, none decorative during live operation; everything honors `prefers-reduced-motion`.
- **Focus:** `:focus-visible` ring (2px accent, 2px offset) on every interactive element.

### Top-level navigation and Back

- Main is the field start destination (`/f/:slug`); History, Activity, and Settings are restorable URL-backed destinations.
- One Android/browser Back from any secondary destination returns directly to Main in the same field. Back from Main stays native and is never gated by an exit popup.
- Switching among secondary destinations replaces their one managed history entry instead of creating a long Back chain. Forward restores the last secondary destination.
- The active destination is persistent, uses more than color alone, and exposes `aria-current="page"`.
- Tabs remain in the top rail because the mobile bottom edge belongs to `QuickAddBar`; when navigation and the line compete for space, the line wins.

## 5. Component inventory (shared)

| Component | File | States/variants |
|---|---|---|
| `Button` | `components/ui/button.tsx` | primary / secondary / danger / ghost · default / big · disabled |
| `Badge` | `components/ui/badge.tsx` | live / paused / ending / free (state language above) |
| `CountdownTimer` | `components/CountdownTimer.tsx` | live / paused (pulse) / ending <60s / finishing 00:00 |
| `FieldCard` | `components/FieldCard.tsx` | free (dashed, next-up + start) / live / paused / ending / finishing |
| `QueueRow` | `components/QueueRow.tsx` | **next (accent "הבא")** / default / dragging / removing; ⋯ menu mirrors all gestures |
| `CaptainChip` | `components/CaptainChip.tsx` | filled (with games-today) / empty slot |
| `CaptainSearchResult` | `components/CaptainSearchResult.tsx` | with stats / never-played / create-new (+ duplicate hint) |
| `PinPad` | `components/PinPad.tsx` | entry / lockout countdown; digits always LTR |
| `ConnectivityBanner` | `components/ConnectivityBanner.tsx` | offline (warn) / resynced (accent, 2s) / hidden |
| `UndoToast` | `components/UndoToast.tsx` | Sonner wrapper: message + undo action + draining window |
| `EmptyState` | `components/EmptyState.tsx` | no-session (CTA for manager) / empty-queue |

Screen-level compositions (QuickAddBar, CaptainSheet, HistoryScreen, SessionSummary, menus via Radix Sheet/Command) are assembled from these in the app build phase — dnd-kit and Radix enter there, not in the shared layer.

## 6. Accessibility

- Text contrast ≥4.5:1 on all surfaces; timer digits target ≥7:1 (sunlight glare).
- State = color + label + border style, never color alone.
- `aria-label` in Hebrew on icon-only controls; Radix semantics preserved when Radix primitives are introduced.
- Haptic/sound are supplements; every state visible.

## 7. Voice (copy)

Hebrew, imperative, short: buttons say the action ("התחל", "הוסף לתור"); blocked states say why ("יש משחק פעיל במגרש"); errors say what + what now. No exclamation marks, no apologies.
