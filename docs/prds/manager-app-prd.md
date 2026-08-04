# Manager App PRD and QA Source of Truth

Status: **Normative baseline**
Version: **1.2**
Effective date: **2026-08-03**
Product: **Football Match Queue Manager — manager/staff PWA**
Primary locale: **Hebrew (`he-IL`), RTL**

This document is the single product-behavior source of truth for the manager application. It defines what future QA must verify on the landing page, authenticated field console, field settings, and manager-to-player handoff.

## 0. Document governance

### 0.1 Normative language

- **MUST / MUST NOT** — release-blocking requirement.
- **SHOULD / SHOULD NOT** — expected behavior; a deviation needs a documented product decision.
- **MAY** — optional behavior.
- Each requirement ID is permanent. Requirements may be amended, but IDs must not be silently reused for different behavior.

### 0.2 Precedence

When sources disagree, use this order:

1. **This file** — manager product behavior and QA acceptance.
2. `packages/shared/src/**` — request, response, socket, and validation shapes.
3. `docs/prds/technical-prd.md` — architecture and internal invariants only where it does not conflict with this file.
4. `design.md` — visual tokens, RTL, accessibility, and interaction implementation.
5. Older product documents and dated design specs — historical rationale only.

`docs/prds/features-prd.md`, `docs/prds/client-prd.md`, and `docs/prds/prd.md` are superseded for manager behavior. In particular, their one-field, shared-queue, anonymous-visitor, queued-match, and universal no-confirmation assumptions are not authoritative.

The public spectator/player experience is a separate product surface. This PRD covers only the manager-side QR/share handoff and the guarantee that the manager app cannot mutate through the public player view.

### 0.3 Change control

- Every product behavior change MUST update this PRD in the same change set.
- Every bug fix MUST add or update a regression test that cites the relevant requirement ID.
- Every manager E2E spec MUST cite the requirement IDs it proves.
- New features are not QA-ready until their success, failure, permission, loading, empty, and reconnect states are specified here.
- If implementation and this PRD diverge, QA reports a defect or the product owner explicitly changes this PRD; QA must not infer a new rule from implementation alone.

## 1. Product definition

The app helps youth-center staff run several concurrent football fields from mobile devices. Each field has its own waiting line, live match, timer, history, settings, optional access rule, and realtime channel.

A **captain** represents one team. The app never tracks individual players or rosters. The word “team” in the UI means the captain-led group.

The operational model is:

```text
center
├── shared staff identities
├── shared captain directory
└── fields (independent)
    ├── field A → session A → queue A → match/history/activity A
    ├── field B → session B → queue B → match/history/activity B
    └── field C → session C → queue C → match/history/activity C
```

### 1.1 Product principles

| ID | Requirement |
|---|---|
| MGR-PRN-001 | The waiting line MUST be the hero surface. The timer is a status/control surface except in explicitly entered Referee Mode. |
| MGR-PRN-002 | Common live operations MUST be one-handed, outdoor-readable, and reachable without leaving Main. |
| MGR-PRN-003 | The queue contains single teams. Two teams become a match only at kickoff. |
| MGR-PRN-004 | Fairness is visible, not automatically enforced: show games today and last-played time wherever a captain is selected or reviewed. |
| MGR-PRN-005 | The server snapshot is operational truth. Clients render the latest snapshot and never invent a separate queue or match state. |
| MGR-PRN-006 | Each field MUST be operationally isolated. A mutation in one field MUST NOT change another field’s queue, match, timer, history, settings, access grant, or activity stream. |

### 1.2 Success measures

| ID | Measure |
|---|---|
| MGR-KPI-001 | An existing captain can be found and added to the line in under 3 seconds during a normal shift. |
| MGR-KPI-002 | A new captain can be created and added in under 5 seconds. |
| MGR-KPI-003 | A second authenticated device receives a successful mutation within 1 second under normal connectivity. |
| MGR-KPI-004 | A device waking after 3 minutes shows the correct timer within 1 second of visibility/reconnect refresh. |
| MGR-KPI-005 | Main remains usable with at least 50 captains, 30 queue/history records, and a 375×812 viewport. |
| MGR-KPI-006 | No manager can mistake data from another field for the current field; field name is always visible in the field header. |

## 2. Actors, authentication, and authorization

### 2.1 Actors

| Actor | Manager-app access |
|---|---|
| Manager | Full authenticated field operations. |
| Staff | Same live field operations as Manager in the current authenticated multi-field model. |
| Automatic system | Auto-finish, field expiry, and system-attributed activity. |
| Public spectator | No manager console. May use the separate read-only player view reached by QR. |

Staff administration is not exposed in the current manager UI baseline; see Deferred Scope.

### 2.2 Authentication requirements

| ID | Requirement and QA oracle |
|---|---|
| MGR-AUTH-001 | The public `/` field list (the landing screen, e.g. the field-card list with queue counts and an "enter field" action) MUST NEVER show a PIN, Center Unlock, or Staff Login screen, under any device or auth state. `POST /auth/device` opens the manager app directly, binding the device to the center's sole active manager identity with no PIN of any kind. `CenterUnlock.tsx` no longer exists in the app and MUST NOT be reintroduced on this route. |
| MGR-AUTH-002 | The `POST /auth/center` center-PIN endpoint and its 5-attempt/15-minute abuse protection remain server-side (reserved for future multi-center scoping) but MUST NOT be wired to any UI screen; no manager entry flow may prompt for a center PIN. |
| MGR-AUTH-003 | Manager device entry MUST NOT show a staff picker or 4-digit staff-PIN screen — `POST /auth/device` binds the manager identity automatically with no selection step. `StaffLogin.tsx`'s picker→PIN screen is not mounted anywhere and MUST NOT be reintroduced on this route; only mid-session "switch user" (MGR-AUTH-005) still collects a staff PIN. |
| MGR-AUTH-004 | Five wrong staff PINs MUST trigger the progressive lockout contract. Remaining lockout time MUST be communicated inline. |
| MGR-AUTH-005 | Switching user MUST require the newly selected staff member’s PIN and MUST attribute subsequent actions to that identity. |
| MGR-AUTH-006 | Manager routes and manager sockets MUST fail closed for missing, invalid, expired, visitor, or wrong-center credentials. |
| MGR-AUTH-007 | Auth tokens and field-access grants MUST be httpOnly cookies; secrets MUST NOT be stored in localStorage, rendered, logged, or returned by field reads. |

### 2.3 Optional field password

A field is shared by default. During creation, its creator MAY add a four-digit password. When a password exists, every entry from the field list—including the creator’s first entry—MUST require that password before field data or controls mount.

The v1.1 requirements `MGR-ACCESS-009` through `MGR-ACCESS-012`, which prohibited field passwords, are retired and MUST NOT be used as QA or implementation requirements. The original v1.0 IDs remain historical; v1.2 uses new IDs for traceability.

| ID | Requirement and QA oracle |
|---|---|
| MGR-ACCESS-013 | Field creation MAY include an optional password. If present, it MUST be exactly four numeric digits. Empty means unprotected. |
| MGR-ACCESS-014 | Opening a protected `/f/:slug` MUST show a focused four-digit password screen before field data, providers, or controls mount. |
| MGR-ACCESS-015 | The correct password grants access to that slug and opens the field. A wrong password shows an inline error and exposes no field state. |
| MGR-ACCESS-016 | Five unlock attempts in 15 minutes MUST be rate-limited. |
| MGR-ACCESS-017 | A grant for field A MUST NOT unlock field B. |
| MGR-ACCESS-018 | Creating a protected field MUST navigate to its password gate. The creator, like every later entrant without a current field grant, MUST enter the four-digit password before field state renders. |
| MGR-ACCESS-019 | The stored password MUST be an Argon2id hash. The clear four digits MUST never be persisted, logged, or returned. |
| MGR-ACCESS-020 | Loading `/` MUST revoke all field-access grants on that browser. Re-entering any protected field from the landing list MUST therefore ask for its four-digit password again. |

## 3. Domain and isolation rules

### 3.1 Canonical concepts

| Concept | Definition |
|---|---|
| Center | Authentication and shared-directory boundary. |
| Field | User-facing operational workspace identified by a unique six-character slug. Backed by one session and one field row. |
| Captain/team | One team leader representing the entire team. Captain profiles are shared within the center. |
| Queue entry | One captain/team waiting in one field’s ordered line. |
| Predicted pair | Two adjacent queue entries visually grouped as the likely next match; it is not a stored match. |
| Match | Two captains paired at kickoff on one field. Status is live, paused, finished, or cancelled. |
| Activity event | Append-only record of a successful action or safe rejected/failed request. |
| Field password | Optional four-digit access password scoped to one field console. |

### 3.2 Isolation invariants

| ID | Requirement and QA oracle |
|---|---|
| MGR-ISO-001 | Every active field MUST own a different session ID, slug, queue, match set, history summary, settings, and socket room. |
| MGR-ISO-002 | Creating a field MUST produce an empty queue and no live match. It MUST NOT receive the default demo field’s seeded teams or history. |
| MGR-ISO-003 | Adding, renaming, moving, removing, starting, pausing, extending, finishing, replaying, closing, or changing duration in field A MUST leave field B’s operational state unchanged. |
| MGR-ISO-004 | Realtime broadcasts MUST join and update the requested slug’s room, not the first or most recent active field. |
| MGR-ISO-005 | The captain directory is center-scoped and MAY be shared across fields. Field-local games-today and last-played calculations MUST use the correct field/session context. |
| MGR-ISO-006 | Closed fields MUST disappear from the active landing list but remain resolvable by their original link for closed-state history. |

## 4. Information architecture and navigation

| Route | Purpose | Required behavior |
|---|---|---|
| `/` | Public field landing | List active fields without a manager-entry PIN. Loading the route revokes remembered field-access grants so every protected-field entry asks for its password again. |
| `/f/:slug` | Field Main | Field-scoped live match, line, quick add, and referee entry. |
| `/f/:slug?tab=history` | History | Field/session summary and finished matches. |
| `/f/:slug?tab=activity` | Activity | Filterable operational and exception history. |
| `/f/:slug?tab=settings` | Settings | Return to landing, duration, wake-lock preference, close field. |
| Public player origin `/line` | Default-field read-only alias | Resolves the current default field and never mounts manager actions. |
| Public player origin `/line/:slug` | Field-scoped read-only queue | Stable URL and QR for one field; never mounts manager actions. |

| ID | Requirement and QA oracle |
|---|---|
| MGR-NAV-001 | Main uses canonical `/f/:slug`; secondary tabs are URL-backed query destinations and survive reload. |
| MGR-NAV-002 | One Android/browser Back from History, Activity, or Settings MUST return to Main in the same field without a full app remount. |
| MGR-NAV-003 | Switching among secondary tabs MUST not create a long Back stack; one Back returns to Main. Forward restores the last secondary tab. |
| MGR-NAV-004 | Back from Main MUST remain native; no exit confirmation or history trap. |
| MGR-NAV-005 | Settings MUST provide an explicit “all fields” link to `/`. |
| MGR-NAV-006 | Unknown slugs MUST show the field-not-found state with a route back to field discovery/creation. |

## 5. Landing page and field lifecycle

### 5.1 Landing page

| ID | Requirement and QA oracle |
|---|---|
| MGR-HOME-001 | `/` MUST render the field landing page with NO Center Unlock, Staff Login, or any PIN screen whatsoever, and MUST NOT auto-redirect to a field. This route is mounted with no `AppGate`/`FieldAccessGate` wrapper at all (`main.tsx`), so it structurally cannot show a PIN. |
| MGR-HOME-002 | Each active-field card MUST show name, queue count, free/live status, and an explicit enter action. |
| MGR-HOME-003 | Anonymous landing loads MUST be read-only and MUST NOT auto-create a missing default field. An authenticated creation flow MAY restore the default field; when present, the client pins it first. |
| MGR-HOME-004 | A field-list load failure MUST show a dedicated inline error. Loading MUST have an announced status. |
| MGR-HOME-005 | The landing header MUST expose PWA install when the browser reports installation is available. |
| MGR-HOME-006 | When the default field-line player view exists, the landing header MUST expose its QR action. It copies the stable read-only field-line URL and opens the QR overlay without navigating the staff device away. |
| MGR-HOME-007 | Active non-default fields remain ordered newest-first after the default field. |
| MGR-HOME-008 | The anonymous landing read MUST expose only the existing field-list card contract. Field creation and every field-management read or mutation remain protected by the existing device/staff authentication guards. |

### 5.2 Create field

| ID | Requirement and QA oracle |
|---|---|
| MGR-FIELD-001 | “Create new field” opens a bottom sheet containing field name and an optional four-digit password. |
| MGR-FIELD-002 | Name MUST trim surrounding whitespace, contain 1–40 characters, and remain intact after a recoverable submission failure. |
| MGR-FIELD-003 | Password input MUST accept digits only, mask the value, stop at four digits, and allow either zero or four digits. |
| MGR-FIELD-004 | Successful creation MUST use the default 6-minute match duration and navigate directly to the new field. |
| MGR-FIELD-005 | The new field MUST render its own name in the field header and start empty/free. |
| MGR-FIELD-006 | Creation MUST be limited to five attempts per hour per IP; rate-limit failure stays in the sheet with a specific inline retry message. |
| MGR-FIELD-007 | Generated slugs MUST match `[a-z2-9]{6}`, exclude ambiguous characters, be unique, and retry collision safely. |

### 5.3 Close and expiry

| ID | Requirement and QA oracle |
|---|---|
| MGR-FIELD-008 | Closing a field MUST require a confirmation dialog. Cancel leaves all state unchanged. |
| MGR-FIELD-009 | If a match is live or paused, the dialog MUST explicitly warn that closing cancels it. Confirm remains available. |
| MGR-FIELD-010 | Confirmed close MUST cancel any active match, clear remaining queue entries, close the field, append activity, and navigate to `/`. |
| MGR-FIELD-011 | Close MUST be idempotent. The closed field disappears from the active landing list. |
| MGR-FIELD-012 | An active field with no activity for 18 hours MUST be force-closed by the scheduled expiry sweep and logged as an automatic expiry. |
| MGR-FIELD-013 | The default field is a guarantee: closing it removes that instance, and a later landing load may create a fresh empty default field. |

## 6. Field app shell

| ID | Requirement and QA oracle |
|---|---|
| MGR-SHELL-001 | The sticky header MUST show the current field name on every tab. Long names truncate without pushing actions off-screen; the full value remains available as the title/accessibility text. |
| MGR-SHELL-002 | The current clock MUST be LTR-isolated, tabular, and displayed opposite the field name. |
| MGR-SHELL-003 | The header MUST expose Main, History, Activity, and Settings with `aria-current="page"` on the active destination. |
| MGR-SHELL-004 | The queue-share action MUST share or copy the current field's canonical read-only `https://line.maple-group.info/line/:slug` URL, never the manager `/f/:slug` URL. |
| MGR-SHELL-005 | Main MUST expose a QR action for every active field. The QR is generated locally from that field's stable read-only queue URL, remains unchanged across matches, and MUST NOT require an external QR service. |
| MGR-SHELL-006 | PWA install, connectivity banner, and status feedback MUST remain available without covering the queue or sticky quick-add bar. |
| MGR-SHELL-007 | The bottom edge on Main belongs to Quick Add; top navigation MUST NOT be moved into that action zone. |

## 7. Main live-operation surface

### 7.1 Field card and timer

| ID | Requirement and QA oracle |
|---|---|
| MGR-MAIN-001 | Main MUST show exactly one field card for the route’s field above that field’s line. |
| MGR-MAIN-002 | A free field shows the likely front-two pairing. Start is enabled only when at least two teams wait; otherwise it is disabled with a visible reason. |
| MGR-MAIN-003 | A live/paused field card shows field name, state label, both captains, timer, Pause/Resume, +1 minute, Finish, and Referee Mode. |
| MGR-MAIN-004 | State presentation MUST distinguish free, live, paused, ending (<60 seconds), and finishing (00:00) using label plus color/border treatment. |
| MGR-MAIN-005 | At 00:00, if a waiting pair exists, the primary action MUST finish the current match and immediately start the next pair. Extend and finish-only remain available. |
| MGR-MAIN-006 | At 00:00 with fewer than two waiting teams, Extend and Finish remain available and no invalid next-match action appears. |
| MGR-MAIN-007 | The first crossing to 00:00 SHOULD trigger a short visual alert plus vibration/sound where supported; audiovisual signals are supplemental. |

### 7.2 Quick Add and captain search

| ID | Requirement and QA oracle |
|---|---|
| MGR-ADD-001 | Quick Add MUST be sticky at the bottom of Main and add one team per selection. |
| MGR-ADD-002 | Search starts after one non-space character with a 150ms client debounce. Normal results SHOULD appear within 300ms. |
| MGR-ADD-003 | Every result MUST show name, optional nickname, games today, and last-played time or a never-played state. |
| MGR-ADD-004 | Selecting an existing result immediately appends it to this field’s queue, clears search, and MAY vibrate briefly. No separate submit is required. |
| MGR-ADD-005 | The create row MUST remain available for the typed name. Selecting it creates the captain and appends the team in one operation. |
| MGR-ADD-006 | Exact duplicate names are allowed. The UI MUST soft-warn without blocking creation. |
| MGR-ADD-007 | Search/create failure MUST be recoverable without corrupting or cross-fielding the line. |

### 7.3 Queue presentation and estimates

| ID | Requirement and QA oracle |
|---|---|
| MGR-QUEUE-001 | The queue MUST render one team per row with position, name, nickname when available, games today, and last-played time. |
| MGR-QUEUE-002 | Adjacent rows MUST be visually grouped into predicted pairs. The front pair is marked as next. A trailing odd row is shown as waiting for a partner, not as a real match. |
| MGR-QUEUE-003 | Groups after the front pair MUST show games-ahead and estimated start time. ETA MUST include active-match remaining time plus planned durations ahead. |
| MGR-QUEUE-004 | Queue order MUST be a complete, gap-free 1..n sequence after every mutation. |
| MGR-QUEUE-005 | A newly added team goes to the bottom. Starting a match removes exactly the selected/front two from the queue. |

### 7.4 Queue actions and reordering

| ID | Requirement and QA oracle |
|---|---|
| MGR-QUEUE-006 | A row action sheet MUST offer Rename, Move to Top, Move to Bottom, and Remove. Replay belongs to History, not the live line. |
| MGR-QUEUE-007 | Rename saves the trimmed name and updates all field views using that captain identity. Empty rename is ignored. |
| MGR-QUEUE-008 | Remove applies immediately and shows a five-second Undo toast. Undo restores the prior position when still valid. |
| MGR-QUEUE-009 | Single-row handle drag MUST preview the move, name the displaced row(s), and require confirmation before the server reorder. Cancel restores the old order. |
| MGR-QUEUE-010 | Move-to-top and move-to-bottom MUST require the same explicit switch confirmation and must not optimistically mutate before confirmation. |
| MGR-QUEUE-011 | A pair group MAY be moved as a block using the documented double-tap, hold, then drag gesture. The UI MUST show armed/holding/dragging states and require a named confirmation after drop. |
| MGR-QUEUE-012 | Pair drag MUST support live sibling reflow and edge auto-scroll. Cancel returns the visual and logical order to the pre-drag state. |
| MGR-QUEUE-013 | Reorder rejection MUST restore the last server order and show an inline/action-origin error. |
| MGR-QUEUE-014 | Queue mutations MUST use the field/session advisory lock and pass concurrent-attempt tests; no duplicate positions, lost entries, or cross-session entry IDs are allowed. |

### 7.5 Match lifecycle

```text
front two queue entries --start--> live <--resume-- paused
                                  |   --pause-->  |
                                  +--finish/auto--> finished
field close -------------------------------------> cancelled
```

| ID | Requirement and QA oracle |
|---|---|
| MGR-MATCH-001 | Start pairs the front two queue entries unless an explicit valid pair is supplied. The match is created directly as live and attributed to the current staff identity. |
| MGR-MATCH-002 | Concurrent starts MUST be exactly-one-wins. A second request receives typed conflict/not-found behavior and then the latest snapshot. |
| MGR-MATCH-003 | Pause freezes the same remaining time for all clients. Resume continues from that value and includes the paused duration in future end-time computation. |
| MGR-MATCH-004 | +1 minute MUST add exactly 60 seconds and work for live or paused matches. Each press is logged. |
| MGR-MATCH-005 | Standard Finish MUST open a confirmation dialog. Cancel keeps the match active; confirm finishes once, records actual duration, and shows a completion toast with no finish undo action. |
| MGR-MATCH-006 | Auto-finish MUST conditionally finish an overdue live match once within the scheduler tolerance (target ≤5 seconds), mark `endReason=auto`, and broadcast the new snapshot. |
| MGR-MATCH-007 | Replay from History MUST require confirmation and append both captains, in match order, to the bottom of this field’s queue. It does not create a live match. |
| MGR-MATCH-008 | Every lifecycle mutation MUST be audit-logged with staff attribution, except automatic actions which use system attribution. |

### 7.6 Referee Mode

| ID | Requirement and QA oracle |
|---|---|
| MGR-REF-001 | Referee Mode is available only while a match is live or paused. It opens a full-viewport modal control surface over the manager app. |
| MGR-REF-002 | It MUST show field name, both captains, explicit state, and a large LTR/tabular timer. Here the timer is intentionally the primary surface. |
| MGR-REF-003 | Unlocked controls MUST provide Pause/Resume, +1 minute, hold-to-finish, lock controls, and close/return. |
| MGR-REF-004 | Hold-to-finish MUST require an uninterrupted 1.2-second pointer or keyboard hold. Completing the hold opens the standard finish confirmation; it MUST NOT finish before confirmation. |
| MGR-REF-005 | Cancelling the finish confirmation keeps Referee Mode and the match active. Confirming finishes once, closes Referee Mode, and returns to the field app. |
| MGR-REF-006 | Lock Controls MUST remove all mutating controls except hold-to-unlock. Unlock requires an uninterrupted 1.2-second hold. |
| MGR-REF-007 | Escape closes only while unlocked and idle. Focus MUST remain trapped in the modal, autofocus an appropriate control, and return to the Referee trigger after close. |
| MGR-REF-008 | Actions MUST have an in-flight guard, disable duplicate input, announce pending state, and render failure inside Referee Mode. |
| MGR-REF-009 | If the underlying match ends, Referee Mode and any pending finish dialog MUST close automatically. |
| MGR-REF-010 | At 00:00 the finish action becomes visually primary/full-width while Extend remains available. |

## 8. Secondary manager surfaces

### 8.1 History and summary

| ID | Requirement and QA oracle |
|---|---|
| MGR-HIST-001 | History MUST be scoped to the current field/session and remain readable after field close. |
| MGR-HIST-002 | The summary MUST show total matches, unique captains, total play time, first and last match times, average actual duration, top captains, extension count, and manual vs automatic finishes. |
| MGR-HIST-003 | Each finished match MUST show both captains, field name, start/end time, planned and actual duration, and manual/auto result. |
| MGR-HIST-004 | Search MUST filter by either captain name and show the correct empty state. |
| MGR-HIST-005 | Replay MUST show both captain names in its confirmation, prevent duplicate submit while pending, close on success, and show an inline retryable error on failure. |

### 8.2 Captain profile

| ID | Requirement and QA oracle |
|---|---|
| MGR-CAP-001 | A captain detail entry point SHOULD be available from captain surfaces and open a bottom sheet, not a separate workflow. |
| MGR-CAP-002 | The sheet MUST show/edit nickname, tags, private note, games today, last played, and total matches. |
| MGR-CAP-003 | Edits save on blur/action without a blocking success popup. Private notes remain authenticated-staff-only. |
| MGR-CAP-004 | Removing or adding a tag MUST update the shared captain profile without changing any field queue membership. |

### 8.3 Activity

| ID | Requirement and QA oracle |
|---|---|
| MGR-ACT-001 | Activity MUST combine successful operational actions and safe exception records in reverse chronological order. |
| MGR-ACT-002 | Quick filters MUST provide All, Actions, and Exceptions. Advanced filters MUST provide action, outcome, HTTP status, from, and to. Reset restores the unfiltered feed. |
| MGR-ACT-003 | Exception rows MUST show safe status/error/request/correlation information without raw secrets, stack traces, PINs, or user-supplied sensitive payloads. |
| MGR-ACT-004 | The full log MUST use cursor pagination without duplicate or missing rows and announce the count loaded. |
| MGR-ACT-005 | Loading, filtered-empty, global-empty, retryable load error, and load-more states MUST be distinct. |
| MGR-ACT-006 | Automatic actions MUST be visually and semantically distinguishable from staff-attributed actions. |

### 8.4 Settings

| ID | Requirement and QA oracle |
|---|---|
| MGR-SET-001 | Settings MUST show an explicit link back to all fields. |
| MGR-SET-002 | Match duration MUST be adjustable in one-minute steps from 1 to 60 minutes. The displayed value is LTR/tabular. |
| MGR-SET-003 | Duration changes affect matches started afterwards and MUST NOT alter the planned duration of a live/paused match. |
| MGR-SET-004 | Wake-lock preference MUST persist locally. When enabled, the app SHOULD request screen wake lock while a match is live and release it when no match is live or the document is hidden. |
| MGR-SET-005 | Field close follows MGR-FIELD-008 through MGR-FIELD-011 and returns to landing after success. |

### 8.5 Closed field

| ID | Requirement and QA oracle |
|---|---|
| MGR-CLOSED-001 | Main for a closed field MUST show the closed-field terminal state rather than a live queue. |
| MGR-CLOSED-002 | The state MUST offer a clear route to the landing page. History remains available through the top tab. |
| MGR-CLOSED-003 | Closed fields MUST reject further queue and match mutations. |

### 8.6 Field-level public queue QR and URL

Every field receives one stable public identity from its existing session slug. No additional token, schema column, migration, stored image, or external QR service is required: the canonical public URL is `https://line.maple-group.info/line/:slug`. The client deterministically renders that URL as a QR code whenever staff request it.

| ID | Requirement and QA oracle |
|---|---|
| MGR-PUB-001 | Creating a field MUST immediately establish its canonical `/line/:slug` public URL; no match must be started first. |
| MGR-PUB-002 | Main MUST offer the current field's QR and Share/Copy actions. The manager device stays on the field while the QR overlay is open. |
| MGR-PUB-003 | The QR overlay MUST encode the exact displayed field URL. Native Share and clipboard fallback MUST transmit that same URL. |
| MGR-PUB-004 | `/line/:slug` MUST mount the existing read-only live field/queue screen for exactly that slug. It MUST mount no manager providers or mutation controls. |
| MGR-PUB-005 | The public field page MUST load the selected field snapshot and follow only that field's realtime room. A second field URL MUST not receive the first field's snapshot. |
| MGR-PUB-006 | Closing or expiring a field MUST make its public page show the unavailable state. The slug and QR MUST NOT be reassigned to another field. |
| MGR-PUB-007 | `/line` and the public-host root remain backward-compatible aliases for the current default field. Their existing default-field QR remains valid. |
| MGR-PUB-008 | Match creation, pause, finish, replay, and history MUST NOT create additional QR codes or change the field QR. |

## 9. Timer, realtime, and connectivity

### 9.1 Timer truth

```text
elapsed = (pausedAt ?? serverNow) - startedAt - accumulatedPauseSec
remaining = max(0, plannedDurationSec - elapsed)
endsAt = startedAt + plannedDurationSec + accumulatedPauseSec
```

| ID | Requirement and QA oracle |
|---|---|
| MGR-TIME-001 | Timer truth MUST be derived from stored timestamps and server-clock offset, never a decremented persisted counter. |
| MGR-TIME-002 | The client MAY render once per second but MUST recompute immediately on visibility change, snapshot, and reconnect. |
| MGR-TIME-003 | Device clock skew MUST NOT change match truth. Server time/offset is authoritative. |
| MGR-TIME-004 | API restart, screen lock, and socket reconnect MUST NOT reset or extend a match. |

### 9.2 Realtime and offline

| ID | Requirement and QA oracle |
|---|---|
| MGR-RT-001 | Joining a valid field slug MUST receive an immediate complete session snapshot. |
| MGR-RT-002 | Every successful field mutation and automatic transition MUST broadcast a replacement snapshot to that field’s room. |
| MGR-RT-003 | Missed deltas do not matter: reconnect MUST fetch/join and replace with the latest full snapshot. |
| MGR-RT-004 | After more than 2 seconds disconnected, a visible offline banner MUST appear, last known state/timer remain visible, and mutating controls MUST disable. |
| MGR-RT-005 | Reconnect MUST show a short resynced state, refresh the snapshot, recalculate clock offset, and re-enable controls. |
| MGR-RT-006 | Two contexts on field A MUST sync; a context on field B MUST receive no field-A snapshot. |

## 10. Feedback, errors, and confirmation policy

The default is state-change feedback, inline errors, disabled-with-reason, and Undo for safe reversible queue operations.

### 10.1 Deliberate confirmation exceptions

These dialogs are required and are not violations of the live-flow policy:

1. Manual Finish.
2. Referee hold-to-finish verification.
3. Finish/close field.
4. Replay a finished match.
5. Row/pair reorder and Move-to-Top/Bottom switch confirmation.
6. Session/field setup and administrative settings.

| ID | Requirement and QA oracle |
|---|---|
| MGR-FBK-001 | Errors MUST appear at the action origin or in the active modal/sheet; raw server messages MUST never be displayed. |
| MGR-FBK-002 | Successful ordinary mutations SHOULD be communicated by visible state change. Toasts are reserved for copy/install feedback, queue Undo, and informational match completion. |
| MGR-FBK-003 | Submitting controls MUST prevent duplicate actions while in flight. |
| MGR-FBK-004 | A conflict caused by another device SHOULD resolve by applying the newest snapshot plus a concise local explanation when needed. |
| MGR-FBK-005 | Unknown failures MUST fail closed, remain recoverable, and write a safe correlated exception record server-side. |

## 11. Hebrew RTL, accessibility, and visual requirements

| ID | Requirement and QA oracle |
|---|---|
| MGR-UX-001 | `<html>` MUST use `lang="he" dir="rtl"`. All user-facing copy MUST come from typed `he.json` keys. |
| MGR-UX-002 | Layout MUST use logical direction utilities/properties. Physical left/right margin, padding, or positioning is forbidden in manager components. |
| MGR-UX-003 | Times, countdowns, codes, and numeric runs MUST be LTR-isolated and use tabular numerals. |
| MGR-UX-004 | Touch targets MUST be at least 44×44px. Primary actions SHOULD be 60px high. |
| MGR-UX-005 | All states MUST use text/icon/shape in addition to color. Text contrast MUST meet WCAG AA; timer digits SHOULD target AAA. |
| MGR-UX-006 | Icon-only controls MUST have Hebrew accessible names. Focus MUST be visible and logical. Sheets/dialogs MUST trap focus and restore it on close. |
| MGR-UX-007 | Motion MUST be brief, functional, reduced-motion aware, and never required to understand state. |
| MGR-UX-008 | The dark, high-contrast, green-biased theme is fixed for the manager app. Components consume semantic/component tokens and MUST NOT contain raw color hex values. |
| MGR-UX-009 | The 375×812 viewport is the primary QA viewport. Content MUST not horizontally overflow or hide the Quick Add action behind safe-area UI. |

## 12. PWA and manager-device behavior

| ID | Requirement and QA oracle |
|---|---|
| MGR-PWA-001 | The app MUST be installable with standalone display, portrait orientation, Hebrew naming, and maskable 192/512 icons. |
| MGR-PWA-002 | Install UI MUST appear only when installation is available and MUST not falsely imply installation after the app is already installed. |
| MGR-PWA-003 | The service worker MAY cache the app shell only. API responses, manager data, auth responses, and sockets MUST remain network-only. |
| MGR-PWA-004 | A waiting application update SHOULD offer an explicit refresh action without interrupting an active match. |
| MGR-PWA-005 | iOS/Android absence of vibration, sound, share, clipboard, or Wake Lock MUST degrade to visible feedback and preserve core operations. |

## 13. Security and data correctness

| ID | Requirement and QA oracle |
|---|---|
| MGR-SEC-001 | Every manager request MUST be scoped to the authenticated center. Cross-center IDs return the same not-found behavior as unknown IDs. |
| MGR-SEC-002 | Every request body, path ID, slug, query filter, staff-authentication PIN, field password, name, and duration MUST be boundary-validated using shared schemas. |
| MGR-SEC-003 | Queue, match, action/undo, auth, schema, and migration changes are critical paths and require frozen failing tests plus adversarial/concurrency review. |
| MGR-SEC-004 | Every successful mutation MUST append its activity record in the same transaction. Rejected/failed requests MUST be recorded safely without sensitive values. |
| MGR-SEC-005 | Exactly one live/paused match is allowed per field. A captain cannot appear twice in the same live match. |
| MGR-SEC-006 | Queue renumbering and kickoff MUST be transactionally serialized. Parallel tests MUST prove exactly-one-wins and no partial deletion. |
| MGR-SEC-007 | API cookies MUST use the environment-appropriate httpOnly, Secure, and SameSite configuration; CORS/socket origins MUST be explicit. |

## 14. QA contract

### 14.1 Required test layers

| Layer | Minimum scope |
|---|---|
| Shared contract tests | Every accepted and rejected request/response shape, including optional four-digit field passwords and slug validation. |
| Domain unit tests | Timer math, pairing/ETA, field state, staff-auth lockouts, activity mapping, reducer/gesture state. |
| Component tests | Visible states, accessible names/roles, callbacks, duplicate-submit guards, focus behavior; no markup snapshots. |
| API integration | Real migrated Postgres: auth, protected/unprotected field access, re-locking, field isolation, lifecycle, history, activity, expiry, permissions, failures. |
| Concurrency | N≥5 parallel line/start/finish/access attempts for critical invariants. |
| Socket integration | Auth, slug room selection, initial snapshot, broadcast, reconnect, cross-field non-delivery. |
| Browser E2E | Mobile-first complete manager journeys. Two fields and two contexts are mandatory fixtures. |
| Manual device | iOS Safari/PWA and Android Chrome/PWA: install, Back/Forward, screen lock, reconnect, vibration/audio fallback, outdoor readability. |

### 14.2 Mandatory E2E journeys

| Journey ID | Steps and assertions |
|---|---|
| MGR-E2E-001 | Open `/` on a fresh device with no cookies → field list renders immediately with no Center Unlock, Staff Login, or any PIN screen → open a manager field route → device auto-binds via `POST /auth/device` with still no PIN prompt. Covers MGR-AUTH-001..006. |
| MGR-E2E-002 | Open `/` on a fresh device → create unprotected field A and enter directly → return to landing → create protected field B → creator sees its password gate → wrong password rejected → correct password enters → return to landing → re-enter B → password gate is shown again. Covers MGR-ACCESS-013..020. |
| MGR-E2E-003 | Add teams only to A → verify B stays empty → mutate/start A in a second context → both A contexts sync while B receives nothing. Covers all MGR-ISO IDs. |
| MGR-E2E-004 | Existing captain add (<3s) → new captain add (<5s) → duplicate soft warning → front-two Start. |
| MGR-E2E-005 | Pause → lock/wake device simulation → Resume → Extend → standard Finish cancel → confirm Finish. |
| MGR-E2E-006 | Open Referee → Lock → controls unavailable → hold Unlock → hold Finish → cancel → hold Finish → confirm. |
| MGR-E2E-007 | Single-row reorder confirm/cancel → pair drag confirm/cancel → move top/bottom → remove → Undo. Verify second device each time. |
| MGR-E2E-008 | Finish match → History summary/search → Replay cancel/confirm → both teams appended to same field. |
| MGR-E2E-009 | Activity filters actions/exceptions/status/date → paginate → retry a forced failure safely. |
| MGR-E2E-010 | Settings duration change → live match unchanged/new match changed → close with live warning → confirm → landing → closed link/history. |
| MGR-E2E-011 | Secondary tab Back/Forward contract on browser and installed Android PWA. |
| MGR-E2E-012 | Disconnect two seconds → controls disabled/banner → reconnect/resynced → latest snapshot correct. |
| MGR-E2E-013 | Create fields A and B → assert each exposes a different `/line/:slug` URL and QR → open both public pages → verify each is read-only and field-isolated → start and finish matches → assert both field URLs and QR values remain unchanged. |

### 14.3 Required fixtures

- Two authenticated staff identities.
- Two simultaneously active fields in the same center, with distinct names and slugs.
- One protected and one unprotected field.
- Duplicate captain names with different nickname/history.
- Queue lengths: 0, 1, 2, odd ≥5, and 30.
- Match states: free, live, paused, ending at 59 seconds, finishing at 0, finished, closed.
- Activity events: successful staff action, automatic action, rejected 409/423/429, failed 500 with correlation ID.
- Clock skew, visibility change, socket disconnect/reconnect, and API restart.

### 14.4 Definition of QA acceptance

A manager-app release is accepted only when:

1. All MUST requirements touched by the change have automated evidence.
2. Critical-path concurrency and adversarial gates pass.
3. No unresolved Critical or High manager defects remain.
4. The complete core journey passes at 375×812.
5. Field-isolation E2E passes with two fields and two contexts.
6. Typecheck, unit/component tests, integration tests, E2E, and build pass in the release environment.
7. Any unavailable environment gate is recorded as **blocked**, not reported as passing.

### 14.5 Source and evidence index

This table locates current implementation and regression evidence. It is an index, not a substitute for the normative requirements above.

| Requirement area | Primary implementation | Primary automated evidence |
|---|---|---|
| Authentication | `screens/AppGate.tsx`, `SwitchUser.tsx`; `api/src/auth/**` (`CenterUnlock.tsx` removed by the open-entry change; `StaffLogin.tsx` remains in the tree but is not mounted on any route) | Auth screen tests, `api/test/auth.int.test.ts`, auth guard/lockout tests |
| Landing/create/access | `HomeScreen.tsx`, `CreateCourtSheet.tsx`, `FieldAccessGate.tsx`; `api/src/fields/**` | `HomeScreen.test.tsx`, `FieldAccessGate.test.tsx`, `api/test/fields.int.test.ts` |
| Field identity/isolation | `main.tsx`, `RealProviders.tsx`, `fields.service.ts`, slug socket join | Mock session tests, fields integration, realtime slug-room integration, manager Playwright E2E |
| App shell/navigation | `App.tsx`, `useAppTabNavigation.ts`, `route.ts` | `App.navigation.test.tsx`, navigation/route unit tests |
| Main/field card | `MainScreen.tsx`, `FieldCard.tsx`, countdown/end-alert hooks | `MainScreen.test.tsx`, `FieldCard.test.tsx`, timer/hook tests |
| Quick Add/captains | `QuickAddBar.tsx`, `CaptainSearchResult.tsx`, `CaptainsService` | Quick Add/search component tests, `api/test/captains.int.test.ts` |
| Queue/pairing | `QueueList.tsx`, `QueuePairGroup.tsx`, `QueueActionsSheet.tsx`, `api/src/queue/**` | Queue component/gesture/pairing tests, `api/test/line.int.test.ts`, concurrency tests |
| Match lifecycle | `realSessionActions.ts`, `api/src/matches/**`, auto-finish service | Main/FieldCard tests, match integration/concurrency/realtime tests |
| Referee Mode | `RefereeMode.tsx`, `FinishMatchConfirmDialog.tsx`, `MainScreen.tsx` | `RefereeMode.test.tsx`, `MainScreen.test.tsx`, finish dialog tests |
| History/replay/summary | `HistoryScreen.tsx`, `SessionSummaryCard.tsx`, reads API | History/rematch tests, reads/summary integration tests |
| Activity | `ActivityFeed.tsx`, `api/src/reads/**`, exception activity writer | Activity/filter tests, activity-log integration and writer tests |
| Settings/close/expiry | `SettingsScreen.tsx`, `ClosedFieldScreen.tsx`, `FieldsService`, `ExpiryService` | Settings/closed-screen tests, fields and expiry integration/unit tests |
| PWA/public handoff | `InstallAppButton.tsx`, `PublicLineQrOverlay.tsx`, `PublicLineScreen.tsx`, field-scoped public route, service-worker config | Install/QR tests, public-line component tests, route tests, and public-host guard tests |
| Contracts/security | `packages/shared/src/**`, auth/field guards, schema/migrations | Shared contract tests, permission matrix, migration/integration suites |

## 15. Deferred scope and non-goals

The following are not release-blocking manager-app requirements until promoted here:

- Staff add/deactivate/reset-PIN UI.
- Past-session picker across every historical field; current history is the routed field/session.
- Individual player tracking, rosters, attendance, statistics, skill ratings, or balancing.
- Tournament brackets, leagues, payments, parent portal, messaging, or push notifications.
- Offline mutation queue or conflict-resolution sync.
- Public field moderation, ownership transfer, or anonymous manager access.
- Cross-center manager console, analytics export, or billing.
- Horizontal Socket.IO scaling/Redis.

## 16. Legacy requirement mapping

| Legacy area | Current authoritative decision |
|---|---|
| One field at MVP | Superseded: multiple independent fields are active manager scope. |
| One active session per center | Superseded: each field is backed by its own active session. |
| Shared queue across fields | Superseded: queue, live match, history, settings, and socket are field-scoped. |
| Anonymous/open manager writes | Refined: manager routes establish the transparent manager-device session from §2.2, with no interactive PIN screen. |
| Optional field PIN/password | Restored in v1.2: optional at creation; mandatory on every protected-field entry from the landing list, including the creator’s first entry. |
| Queue contains matches | Superseded: queue contains single teams; match is created at kickoff. |
| No confirmation dialogs in live flows | Refined: MGR §10.1 lists deliberate confirmations; removal remains Undo-first. |
| Finish undo | Superseded: manual finish uses verification and informational completion; no finish Undo action. |
| Timer never primary | Refined: true for normal Main; Referee Mode intentionally makes the timer primary. |

## 17. Revision history

| Version | Date | Change |
|---|---|---|
| 1.2 | 2026-08-03 | Restored optional four-digit field passwords. Protected fields require the password on the creator’s first entry and every re-entry from the landing list. |
| 1.1 | 2026-08-03 | Removed optional field PIN/password behavior. Shared football courts now open directly with no court-specific code or access grant. |
| 1.0 | 2026-08-03 | Consolidated current manager behavior, field isolation, optional field access code, referee mode, contextual header, and future QA contract. |
