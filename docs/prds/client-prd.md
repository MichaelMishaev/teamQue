# Client PRD — Football Match Queue Manager (Mobile-First PWA)

Status: Approved design (2026-07-10)
Companion docs: [technical-prd.md](./technical-prd.md), [features-prd.md](./features-prd.md)

The app must feel like an **airport control tower, not a form**. Every rule here serves: speed, one-handed use, outdoors, zero interruptions.

> **⚠️ MODEL UPDATE (2026-07-10): the LINE is the hero.** The queue is a **line of single teams** (one team per row, never "A vs B"). The live **match** is a compact top header (the only place two teams pair); the free field shows the front two teams + a "התחל: A נגד B" kickoff button. Quick-add adds ONE team. Pattern reference: Spotify/SoundCloud "Up Next". See design.md §0.

---

## 1. Client Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite + TypeScript (strict) |
| Styling | Tailwind CSS v4 — **logical properties only** (`ms-*/me-*/ps-*/pe-*`, `start/end`), never `ml/mr/left/right` |
| Components | shadcn/ui (Radix primitives) — components copied into repo, resized for touch |
| Drag & drop | dnd-kit (touch-first, RTL-aware) |
| Toasts / undo | Sonner |
| Server state | TanStack Query; socket `session:snapshot` events replace the cached snapshot |
| Local state | React state only — no global state library (snapshot IS the state) |
| i18n | `he.json` locale file; `dir="rtl"` on `<html>`; missing key = CI error |
| PWA | vite-plugin-pwa: manifest + service worker (app shell precache only) |

shadcn/ui components used (only these at MVP): Button, Input, Command (quick-add search), Sheet (bottom sheets), Dialog (settings/session setup only), Tabs, Badge, Toast(Sonner), Avatar (initial-letter chips), Skeleton.

## 2. Design Language

- **Hierarchy (overriding rule): the queue is the hero.** The manager's job is deciding who plays next; the countdown is a status readout. The queue owns the majority of the main screen, has the largest running text and row heights, and the first queued match gets an accent "הבא" highlight. Field cards are compact status headers with an inline timer. When space competes, the queue wins.
- **Theme:** dark, high-contrast (evening outdoor use). Background near-black, cards elevated dark gray, one strong accent (pitch green) + amber for warnings + red only for live-critical states.
- **Typography:** system font stack (Heebo via `font-display: swap` if bundled later); timer digits in tabular-nums, 32px inline on field cards — glanceable, never dominant.
- **Touch targets:** ≥ 48×48px everywhere; primary actions (Start/Finish) ≥ 56px height, full-width or half-width buttons.
- **Density:** one-handed reach — primary actions in the bottom half of the screen; quick-add is a **sticky bottom bar**.
- **Motion:** minimal; 150–200ms transitions; drag feedback instant. No decorative animation during live operation.
- **Feedback:** every action answers within 100ms (optimistic or spinner-inline); success is shown by state change, not popups.

## 3. Screens

### 3.1 Main screen (the app — US-020…US-050)

Single scrollable column, portrait-locked. **MVP shows exactly one field card** (single court); a second field card appears only if multi-field ships post-MVP:

```
┌──────────────────────────────┐
│ ○ שרה  │ פעילות │ 19:42 ⚙   │  ← top bar: user chip, activity, clock, settings
├──────────────────────────────┤
│ ┌─ מגרש ראשי ─────────────┐ │
│ │  דניאל  נגד  נועם        │ │  ← field card(s): captains large,
│ │        04:37             │ │     timer huge, state-colored border
│ │ [השהה]  [+1 דק']  [סיים] │ │  ← live controls
│ └──────────────────────────┘ │
│ ┌─ מגרש קטן ── פנוי ───────┐ │
│ │ הבא בתור: יוסי נגד רון    │ │
│ │        [התחל ▶]          │ │
│ └──────────────────────────┘ │
├─ התור (5) ───────────────────┤
│ ≡ 1. יוסי נגד רון      ⋯    │  ← drag handle, position, actions menu
│ ≡ 2. עומר נגד איתי     ⋯    │
│ ≡ 3. …                       │
├──────────────────────────────┤
│ 🔍 הוסף משחק…                │  ← sticky quick-add bar (bottom)
└──────────────────────────────┘
```

- **Field card states:** free (dashed border, shows next-up + Start), live (green border, countdown), paused (amber, frozen time pulsing), ending (red at <60s), finishing (00:00 "מסתיים…").
- **Queue row actions (⋯ menu / swipe):** move top, move bottom, replay, change captains, remove (swipe-start = remove with undo toast).
- **Overtime affordance:** last 60s the timer turns red; 00:00 triggers vibration + short sound on all open devices (respecting device silent mode).

### 3.2 Quick-add flow (US-020/021 — the 3-second path)

1. Tap search bar → keyboard opens, recent/frequent captains shown immediately.
2. Type ≥1 char → live results; **every row**: name, nickname, `משחקים היום: 3 · שיחק לאחרונה: 18:42` (games today / last played — zero extra taps).
3. Tap captain → fills slot A (chip); repeat for B. No-match state shows one button: **"צור את ‹שם› והוסף"**.
4. Tap "הוסף לתור" → queued, bar resets, subtle haptic. Total: 2 taps + typing per captain.

Selected-captain chips show games-today inline so fairness is visible at the exact decision moment (product PRD §13).

### 3.3 Secondary screens (tabs from top bar)

- **History** — session picker (default tonight) → **session summary header** (matches, unique captains, total play time, first→last, top captains, extensions, manual/auto finishes — US-073) above the finished match list: captains, field, 18:42→18:48, planned/actual, auto/manual, started-by/ended-by. Read-only, searchable by captain. The same summary is shown to the manager on session close.
- **Activity** — chronological staff log feed (US-072), auto-updating.
- **Settings** (manager) — session open/close, fields, default duration, staff management (add/deactivate/reset PIN).
- **Captain sheet** (bottom sheet, from any captain row) — nickname, tags, private note, totals; inline edit.

### 3.4 Auth screens

- **Center unlock:** single PIN field, numeric keypad, once per device.
- **Staff picker:** grid of name chips (large), tap → 4-digit PIN pad → in. Lockout state shows countdown inline.
- **Switch user:** user chip in top bar → picker overlay. Target: < 5s total (US-003).

## 4. RTL & Hebrew Rules

- `<html dir="rtl" lang="he">`; all layout via logical properties; icons with direction (arrows, chevrons) auto-flip via `rtl:` variants or logical icon choice.
- Numbers and times render LTR inside RTL text (`unicode-bidi: isolate` / `<bdi>`), e.g. `18:42`, `04:37`.
- All strings in `he.json` — zero hardcoded user-facing strings in components (dev rule N-13; CI grep + i18n key check).
- Dates: `Intl.DateTimeFormat('he-IL')` with the center's timezone (`Asia/Jerusalem` from server settings); server sends UTC always.

## 5. No-Popup Policy (product PRD §15)

| Instead of… | We use… |
|---|---|
| Confirm dialogs | Undo toasts for queue actions (5s); informational toast without undo for finish — Sonner, bottom, above quick-add |
| Error modals | Inline errors at the action origin (field card / queue row), auto-clearing |
| Blocking states | Disabled buttons with visible reason text ("יש משחק פעיל במגרש") |
| Success alerts | The state change itself + subtle haptic |

Dialogs allowed **only** for: session open/close setup, settings, staff management — never in live flows.

## 6. Timer Rendering

- Countdown computed client-side each second from snapshot fields + server-clock offset (technical-prd §4). Rendering uses `requestAnimationFrame`-aligned 1s tick; `visibilitychange` forces immediate recompute on wake.
- **Wake Lock API** requested while any match is live (toggle in settings, on by default); released when no live matches.
- At 00:00 client shows "מסתיים…" until the server's auto-finish snapshot arrives (≤5s).

## 7. Connectivity UX (US-051)

- Socket connected: no indicator (default is silence).
- Disconnected >2s: slim amber banner "אין חיבור — מציג מצב אחרון"; all mutating controls disabled (visually dimmed); countdowns keep rendering locally.
- Reconnected: banner flips green "מסונכרן" for 2s, fresh snapshot applied.
- Hard REST failures (mutation while flaky): inline retry affordance, never a modal.

## 8. PWA Requirements

| Item | Spec |
|---|---|
| Manifest | `display: standalone`, `orientation: portrait`, Hebrew name "ניהול תורים", themed icons (192/512 + maskable) |
| Service worker | Precache app shell (HTML/JS/CSS/fonts/icons). **Network-only for /api and sockets** — never cache data |
| Install | Custom install hint on 2nd visit (deferred `beforeinstallprompt`), dismissible, never nagging |
| Updates | SW `autoUpdate`; toast "גרסה חדשה — רענן" when a new build is waiting |
| iOS | Tested standalone on Safari iOS (audio/vibration fallbacks: visual flash when unavailable) |

## 9. Performance Budgets (adapted N-20)

- JS bundle ≤ 250KB gzip initial; code-split secondary screens.
- LCP ≤ 2.5s on simulated 4G / mid-range Android; INP ≤ 200ms; CLS ≤ 0.1.
- Main screen remains 60fps while dragging with 50+ captains / 30+ queue rows (virtualize queue list only if measured jank — not preemptively).
- Lighthouse CI advisory at MVP, blocking post-launch.

## 10. Accessibility

- Contrast ≥ WCAG AA on dark theme (timer digits AAA — they're read in sunlight glare).
- All interactive elements: visible focus, `aria-label` in Hebrew, Radix semantics preserved.
- Haptics/sound are supplements — every state must be visually distinguishable (color + icon + text, never color alone).
- Hit slop on drag handles; drag alternative: ⋯ menu offers move top/bottom for users who can't drag.

## 11. Component Inventory (build order)

1. `AppShell` (top bar, tabs, offline banner)
2. `PinPad` (center unlock + staff login share it)
3. `StaffPicker`
4. `FieldCard` (+ `CountdownTimer`, `MatchControls`)
5. `QueueList` (+ `QueueRow`, dnd-kit wiring)
6. `QuickAddBar` (+ `CaptainSearchResult`, `CaptainChip`)
7. `CaptainSheet`
8. `UndoToaster` (Sonner wrapper binding activityId → undo call)
9. `HistoryScreen` (+ `SessionSummary` report header), `ActivityFeed`, `SettingsScreen`, `StaffAdmin`

Each component states its single responsibility in a JSDoc header (N-24).
