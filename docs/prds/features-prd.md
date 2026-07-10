# Features PRD — Football Match Queue Manager

Status: Approved design (2026-07-10)
Companion docs: [technical-prd.md](./technical-prd.md), [client-prd.md](./client-prd.md)

User stories below are **the acceptance criteria** (dev rule R-31). Every E2E spec must reference its US-ID (N-14). Roles: **Manager** (full control) and **Staff** (live operations).

> **⚠️ MODEL UPDATE (2026-07-10): line-manager, not team-manager.** The queue is a **line of single teams** — you add ONE team to the line, reorder, remove. Two teams pair into a match only at **kickoff** (a field frees up → front two play). Stories written as "add a match / A-vs-B in the queue" are superseded: quick-add adds ONE team (US-020/021), the queue holds single teams (US-030…), and "start" pairs the front two teams onto the field (US-040). A match is only the transient live pairing + its history. Authoritative model: `line-manager-not-team-manager` memory + the shared contract (`QueueEntryView`).

---

## 1. MVP Scope Table

| # | Feature | In MVP |
|---|---|---|
| F1 | Device unlock + staff PIN login | ✅ |
| F2 | Session management (open/close, fields, duration) | ✅ |
| F3 | Captain quick-add & search (games-today, last-played inline) | ✅ |
| F4 | Queue management (reorder, top/bottom, remove, replay, change captains) | ✅ |
| F5 | Match lifecycle (start, pause, resume, extend, finish, auto-finish) | ✅ |
| F6 | Resilient timers (lock/reconnect-proof) | ✅ |
| F7 | Multi-device realtime sync | ✅ |
| F8 | Undo (no blocking confirmations) | ✅ |
| F9 | History (per session, permanent) | ✅ |
| F10 | Staff activity log | ✅ |
| F11 | Captain private notes & tags | ✅ |
| F12 | Multiple fields | ❌ post-MVP — **single field at launch** (schema is multi-field-ready; UI unlock later) |
| F13 | Staff management (manager) | ✅ |
| F14 | End-of-session summary report | ✅ |
| — | Player tracking, rosters, stats, leagues, brackets, parents, payments, notifications, messaging, offline action queue | ❌ (PRD non-goals) |

---

## 2. Authentication

### US-001 — Device unlock
As a staff member on a new device, I unlock the app with the center PIN so the device can be used all season.

- **Given** a device that has never opened the app, **When** I enter the correct center PIN, **Then** the device is unlocked for 90 days and I see the staff picker.
- **Given** a wrong center PIN entered 5 times within 15 minutes from one IP, **When** I try again, **Then** the attempt is rejected with a lockout message (no popup — inline error).

### US-002 — Staff login
As a staff member, I pick my name and enter my 4-digit PIN so my actions are attributed to me.

- **Given** the staff picker, **When** I tap my name and enter my correct PIN, **Then** I land on the main screen within 1 tap + 4 digits, and my session lasts 12h.
- **Given** 5 wrong PINs for my account, **When** I retry, **Then** I'm locked for 60s (doubling on repeat rounds), with the remaining lockout time shown.

### US-003 — Switch user
As a staff member on a shared device, I switch the active user in seconds.

- **Given** the main screen, **When** I tap the user chip and pick another staff member (+ their PIN), **Then** subsequent actions are attributed to them. Under 5 seconds total.

---

## 3. Session Management

### US-010 — Open session
As a manager, I open tonight's session with fields and a default match duration.

- **Given** no active session, **When** I open one (date defaults to today, duration e.g. 6:00; the single field is created automatically, name optional), **Then** the main screen shows the empty field card and an empty queue.
- **Given** an active session already exists, **When** anyone tries to open another, **Then** it's rejected (`one active session per center`) and the existing one is shown instead.

### US-011 — Close session
As a manager, I close the session at the end of the evening.

- **Given** an active session with no live matches, **When** I close it, **Then** it becomes read-only history; remaining queued matches are cancelled (logged, reason `session_closed`).
- **Given** a live match, **When** I try to close, **Then** the action is disabled with the reason shown (soft-block, not popup).

### US-012 — Change duration mid-session
- **Given** an active session, **When** the manager changes default duration, **Then** it applies to matches started afterwards; live matches are unaffected.

---

## 4. Captains — Quick Add & Search (F3)

### US-020 — Queue existing captain in < 3s
As staff, I add a match for an existing captain in under 3 seconds.

- **Given** the main screen, **When** I type 2+ characters in quick-add, **Then** matching captains appear instantly (≤300ms) showing **games today** and **last played time** with zero extra taps.
- **When** I tap captain A then captain B then "הוסף" (Add), **Then** the match is queued at the bottom and the search resets for the next entry.

### US-021 — Create new captain in < 5s
- **Given** a search with no match, **When** I press "צור והוסף" (Create & add), **Then** the captain is created with just the typed name and immediately placed in the match being built. No form, no extra fields.

### US-022 — Duplicate names
- **Given** two captains named "דניאל", **When** they appear in search, **Then** each row also shows nickname (if any) and games-today/last-played so staff can tell them apart. Creating an exact-duplicate name shows a soft inline hint ("קיים דניאל נוסף") but never blocks.

### US-023 — Captain details & notes (F11)
- **Given** any captain row, **When** I long-press / tap the info affordance, **Then** a bottom sheet shows nickname, tags, private note, total matches all-time, tonight's matches — editable inline (manager & staff).

---

## 5. Queue Management (F4)

### US-030 — Reorder by drag
- **Given** ≥2 queued matches, **When** I drag a row to a new position, **Then** the order updates optimistically, syncs to all devices on drop, and the move is activity-logged.

### US-031 — Move to top / bottom
- **Given** a queued match's row actions, **When** I tap "לראש התור" / "לסוף התור", **Then** it moves accordingly (single tap, logged).

### US-032 — Remove from queue (undoable)
- **Given** a queued match, **When** I swipe/tap remove, **Then** it's cancelled immediately with a 5s undo toast — no confirmation dialog. Undo restores it to its previous position.

### US-033 — Play again (replay)
- **Given** a finished or queued match, **When** I tap "משחק חוזר", **Then** a duplicate is queued at the bottom.

### US-034 — Change captains on a queued match
- **Given** a queued match, **When** I replace either captain (search picker), **Then** the match keeps its queue position; change is logged.

### US-035 — Priority insert
- Covered by US-030/US-031: staff drags or "move to top". No separate priority concept (YAGNI).

---

## 6. Match Lifecycle (F5) & Timers (F6)

State machine (single source of truth, technical-prd §7): `queued → live → (paused ⇄ live) → finished`, `queued → cancelled`.

### US-040 — Start match
- **Given** a queued match and the field is free, **When** I tap "התחל", **Then** the match goes live with a countdown of the planned duration, attributed to me. (Single field at MVP — no field picking, zero extra taps.)
- **Given** the field already has a live match, **Then** start is disabled (soft-block with reason).
- **Given** either captain is already in the live/paused match, **Then** start is rejected with "הקפטן כבר משחק" (409, inline).
- **Given** two staff tap start on the same match simultaneously, **Then** exactly one succeeds; the other device shows the updated state (no error popup — the snapshot resolves it).

### US-041 — Pause / resume
- **Given** a live match, **When** I tap pause, **Then** the countdown freezes for everyone; resume continues from the exact remaining time. Both logged with attribution.

### US-042 — Extend time
- **Given** a live or paused match, **When** I tap "+1 דקה" (repeatable), **Then** remaining time increases by 60s; logged.

### US-043 — Manual finish
- **Given** a live/paused match, **When** I tap "סיים", **Then** it finishes immediately (undoable 30s), records actual duration, and the field card offers starting the next queued match.

### US-044 — Auto finish
- **Given** a live match reaching 00:00, **Then** within ≤5s the server finishes it automatically (`end_reason=auto`, logged as automatic), all devices update, and a subtle sound/vibration fires on devices with the session open.

### US-045 — Timer resilience
- **Given** a live match and a device whose screen was locked for 3 minutes, **When** the device wakes, **Then** the countdown shows the correct remaining time within 1s (fresh snapshot), never a stale or reset value.
- **Given** the API restarts mid-match, **Then** no timer state is lost (derived from DB) and auto-finish still fires.

---

## 7. Realtime Multi-Device (F7)

### US-050 — Live sync
- **Given** two staff devices on the same session, **When** device A performs any action (start, reorder, add…), **Then** device B reflects it within 1s without refresh.

### US-051 — Offline behavior
- **Given** a device that loses connectivity, **Then** an offline banner appears, mutating controls disable, and the last known state (including a locally-computed countdown) stays visible. On reconnect, state refreshes automatically and controls re-enable.

---

## 8. Undo (F8)

### US-060 — Undo instead of confirm
- **Given** any destructive action (remove from queue, manual finish, reorder), **Then** no confirmation dialog appears; a toast with "בטל" (Undo) shows for 5s (30s window server-side for finish).
- **When** I tap undo, **Then** the server applies the inverse action, logs it, and all devices sync. If the state has moved on (e.g. the match was restarted), undo fails gracefully with an inline explanation.

---

## 9. History (F9) & Activity Log (F10)

### US-070 — Session history
- **Given** the history screen, **When** I open tonight's session, **Then** I see every finished match: captains, field, start/end times, planned vs actual duration, auto/manual finish, who started/ended.
- **Given** a session from 3 weeks ago, **Then** it is equally available (permanent).

### US-071 — Captain answerability
- **Given** any moment mid-session, staff can answer in ≤2 taps: who played last? how many games has captain X played today? when did X last play?

### US-072 — Activity log
- **Given** the activity screen, **Then** I see a chronological feed: `18:42 שרה התחילה דניאל נגד נועם (מגרש ראשי)`, `18:48 סיום אוטומטי`, including undos and automatic actions.

### US-073 — End-of-session summary report (F14)
- **Given** the manager closes a session (or opens any past session in History), **Then** a summary report shows: total matches played, unique captains, total play time, first→last match times, average actual match duration, top captains by games, extensions count, manual vs automatic finishes.
- All values derive from stored match history — nothing new is written; the report is a read view (`GET /sessions/:id/summary`).

---

## 10. Staff Management (F13)

### US-080 — Manage staff (manager only)
- **Given** the staff screen as manager, **Then** I can add a staff member (name, role, PIN), deactivate one, or reset a PIN. Staff role cannot access this screen (403, fail closed).

---

## 11. Fields (F12 — post-MVP)

### US-090 — Single field at MVP
- **Given** an active session, **Then** exactly one field card exists; matches start on it with no field selection.
- **Post-MVP:** multiple independent fields (own live match, timer, next-up), single shared queue, field chosen at start, one-captain-one-field enforced across fields. The DB schema and API already support this — it's a UI unlock.

---

## 12. Edge Cases Checklist (from product PRD §16)

| Edge case | Handled by |
|---|---|
| Late arrivals | US-020/021 (add anytime) |
| Teams reshuffling | US-034 (change captains) |
| Another match request | US-033 (replay) |
| Queue reordering | US-030/031 |
| Priority teams | US-031 (move to top) |
| Cancel before start | US-032 (+undo) |
| Ended early | US-043 |
| Extended | US-042 |
| Pause/resume | US-041 |
| Device lock | US-045 |
| Reconnect | US-045/051 |
| Wrong action | US-060 (undo) |
| Duplicate names | US-022 |
| Multiple staff | US-002/003/050 |
| Multiple fields | Post-MVP (US-090; schema ready) |
| Different manager tomorrow | US-002 (any manager logs in; no device ownership) |
| History weeks later | US-070 |

## 13. Success Criteria (measurable, from product PRD §18)

1. Existing captain queued in **< 3s** (US-020 — E2E-timed).
2. New captain created + queued in **< 5s** (US-021 — E2E-timed).
3. Staff rarely leave the main screen — history/settings visits are exceptional.
4. Games-today / last-played visible at every captain selection point with **zero extra taps**.
5. Zero blocking confirmation dialogs in live flows.
6. Main screen stays fluid with 50+ captains and 30+ queued/finished matches (no visible jank on a mid-range Android).
