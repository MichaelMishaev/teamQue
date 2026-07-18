# Mobile Back-to-Main Navigation Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. This is a standard-path
> web change: it must not touch API contracts, database schema/data, auth, queue,
> matches, actions, or deployment configuration. Keep the failing regression tests
> frozen and fix the implementation.

**Goal:** On a field route, make Android/browser Back return from History,
Activity, or Settings to the Main tab in the same field instead of unexpectedly
leaving for `/`, while preserving normal Back behavior when Main is already active.

**Architecture:** Promote the selected tab from private `App.tsx` state to a small,
URL-backed navigation model. Main is the canonical `/f/:slug` URL; secondary tabs
use `?tab=history|activity|settings`. The first move from Main to a secondary tab
uses `history.pushState`. Switching between secondary tabs uses `replaceState`, so
one Back always returns directly to Main rather than replaying every tab tap.
`popstate` restores the rendered tab without remounting the field/provider tree.

**Small-Fix Fast Lane boundary:** Three implementation files are in scope
(`app-tab-route.ts`, `useAppTabNavigation.ts`, and `App.tsx`), plus focused tests,
one translation key, and source-of-truth documentation. No critical-path glob is
touched.

**UX decision:** Keep the tab rail at the top for this change. Mobbin references
([Shop](https://mobbin.com/screens/34336a77-c326-41e9-935b-78f35e4241b9),
[MasterClass](https://mobbin.com/screens/0576de18-bec8-4ebd-a83f-a98d4fbc833e), and
[Linear Mobile](https://mobbin.com/screens/009fc10f-8250-49ed-b389-036d88ac0e79))
support persistent, clearly selected top-level destinations, but their bottom-bar
placement does not fit this product unchanged: `QuickAddBar` already owns the
mobile bottom edge, and the queue must remain the hero. A bottom-bar redesign would
first need a separate Quick Add composition decision and is outside this fix.

## Execution gate

The authoritative master tracker currently marks Phases 3-9 open. Writing this
plan is safe, but implementation must not claim or skip a phase gate. Before Task 1,
reconcile the tracker with the already-present App shell/secondary screens if it is
stale. If the tracker is current, the code belongs to Phase 5 (App shell) and its
installed-PWA proof belongs to Gate 8, so earlier required gates must close first.
Do not check a gate merely because the corresponding UI exists.

## Locked interaction contract

- Main is the field's start destination: `/f/:slug` (no `tab=main`).
- History, Activity, and Settings are restorable destinations represented by a
  `tab` query parameter.
- From Main to any secondary tab: add exactly one managed history entry.
- From one secondary tab to another: replace that managed entry.
- Android/browser Back from any secondary tab: show Main, retain the same field
  slug, and do not reload the app/provider tree.
- Browser Forward after that Back: restore the last secondary tab.
- Clicking Main from a secondary tab returns to the canonical field URL. If the
  secondary entry was created inside the app, pop it; if it was a direct/reloaded
  deep link, replace it so Main does not send the user outside the app.
- Back from Main is not intercepted. It may return to `/` when the field list is
  the real previous page, or leave/minimize the installed PWA when there is no
  prior in-app destination. No exit confirmation is added.
- Unknown `tab` values fail safely to Main. Existing unrelated query parameters
  and the URL hash are preserved.
- Open sheet/dialog handling is unchanged in this scoped fix; system-Back-aware
  overlays require a separate app-wide overlay-history contract.

## Global constraints

- TypeScript max-strict: no `any`, no non-null `!`; honor
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- All user-facing copy goes through `apps/web/src/i18n/he.json` and typed `t()`.
- RTL uses logical properties only. This plan needs no directional custom icon.
- Components consume semantic/component tokens only; no raw colors in JSX.
- Tab changes are navigation only. They must not duplicate, derive, or mutate the
  server-owned session snapshot.
- No blocking popup or “press Back again to exit” message.
- Preserve the current dirty worktree and commit only the explicit files in each
  task if the user later requests commits.

---

### Task 1: Lock the behavior in the product and design sources

**Files:**
- Modify: `docs/prds/features-prd.md`
- Modify: `docs/prds/client-prd.md`
- Modify: `design.md`
- Modify: `docs/plans/2026-07-10-mvp-development-plan.md` only after the execution
  gate is resolved; add the App-shell task under Phase 5 and installed-PWA check
  under Gate 8 without marking either done

**Produces:** `US-074 — Top-level navigation and system Back`, the acceptance
criteria used by the component/browser regressions below.

- [x] **Step 1: Add `US-074` after US-073 in `features-prd.md`.**

  Record these Given/When/Then cases:

  1. Given a staff member is on History, Activity, or Settings inside
     `/f/:slug`, when they press Android/browser Back, then Main becomes active
     in the same field without a full reload.
  2. Given they switched across multiple secondary tabs, one Back still returns
     directly to Main.
  3. Given Main is active, Back keeps normal system/browser behavior; the app
     does not trap or confirm exit.
  4. Given Back returned to Main, Forward restores the last secondary tab.

- [x] **Step 2: Amend `client-prd.md`.**

  Rename “Secondary screens (tabs from top bar)” to “Top-level field
  destinations.” Keep the current top tab rail, document the URL forms and Back
  rules above, and state explicitly that the bottom edge remains reserved for
  `QuickAddBar` on Main.

- [x] **Step 3: Add a navigation subsection to `design.md` interaction rules.**

  Specify persistent active state, Main as start destination, one Back step from
  secondary destinations, no exit gating, and `aria-current="page"` on the
  active destination link.

- [x] **Step 4: Add the uncompleted implementation check under Phase 5 and the
  installed-PWA Back check under Gate 8.** If tracker reconciliation proves those
  phases already closed, record this as a dated Gate 7/8 dry-run fix instead. Do
  not modify or manufacture existing completion evidence.

- [x] **Step 5: Verify the documentation-only diff.**

  Run: `git diff --check -- docs/prds/features-prd.md docs/prds/client-prd.md design.md docs/plans/2026-07-10-mvp-development-plan.md`

  Expected: no whitespace errors; every navigation statement agrees on top rail,
  URL state, Back-to-Main, and native Back from Main.

---

### Task 2: Add pure tab URL/state helpers

**Files:**
- Create: `apps/web/src/lib/app-tab-route.ts`
- Create: `apps/web/src/lib/app-tab-route.test.ts`

**Produces:**

```ts
export const APP_TABS = ['main', 'history', 'activity', 'settings'] as const
export type AppTab = (typeof APP_TABS)[number]
export type SecondaryAppTab = Exclude<AppTab, 'main'>

export function parseAppTab(search: string): AppTab
export function appTabHref(currentHref: string, tab: AppTab): string
export function managedTabState(tab: SecondaryAppTab): ManagedTabState
export function isManagedTabState(value: unknown): value is ManagedTabState
```

The managed state uses a narrow discriminator owned by this app, for example
`{ kind: 'qlm-tab', tab: 'history' }`. Do not infer ownership only from the query
parameter: a direct `?tab=history` load is valid but has no in-app Main entry to
pop.

- [x] **Step 1: Write failing pure tests.** Cover:

  - absent `tab` -> Main;
  - each supported secondary value parses;
  - `tab=main`, empty, duplicated, and unknown values -> Main;
  - Main href removes only `tab`, preserving other query parameters and hash;
  - secondary href adds/replaces only `tab`, preserving pathname/query/hash;
  - the managed-state guard accepts the exact discriminator + a secondary tab;
  - the guard rejects Main, unknown tabs, null, arrays, and unrelated objects.

- [x] **Step 2: Run the tests to prove RED.**

  Run: `pnpm --filter web test -- src/lib/app-tab-route.test.ts`

  Expected: FAIL because the module/exports do not exist.

- [x] **Step 3: Implement the smallest pure module.**

  Use `URLSearchParams` for parsing and `new URL(currentHref)` for generation.
  Return only `${url.pathname}${url.search}${url.hash}` so history stays
  same-origin. Treat a duplicated `tab` parameter as invalid rather than choosing
  an arbitrary value.

- [x] **Step 4: Re-run the focused test.**

  Run: `pnpm --filter web test -- src/lib/app-tab-route.test.ts`

  Expected: PASS.

---

### Task 3: Implement one-entry tab history as a hook

**Files:**
- Create: `apps/web/src/hooks/useAppTabNavigation.ts`
- Create: `apps/web/src/hooks/useAppTabNavigation.test.tsx`

**Consumes:** Task 2's `AppTab`, parser, href builder, and managed-state guard.

**Produces:**

```ts
export interface AppTabNavigation {
  tab: AppTab
  hrefFor: (tab: AppTab) => string
  selectTab: (tab: AppTab) => void
}

export function useAppTabNavigation(): AppTabNavigation
```

- [x] **Step 1: Write failing hook tests with `renderHook` + `act`.** Reset the
  URL/history state before every case and restore it after every case. Cover:

  1. `/f/abc234` initializes Main.
  2. Selecting History from Main calls `pushState`, selects History, and produces
     `/f/abc234?tab=history` with managed state.
  3. Selecting Activity and then Settings while secondary calls `replaceState`;
     it never adds another secondary entry.
  4. A `popstate` after returning to `/f/abc234` selects Main.
  5. A `popstate`/Forward to the managed secondary URL restores that tab.
  6. Selecting Main from a managed secondary entry uses `history.back()`.
  7. Selecting Main from a direct/reloaded `?tab=history` entry uses
     `replaceState` to canonical Main instead of leaving the field.
  8. Selecting the already-active tab is a no-op.

- [x] **Step 2: Run the hook test to prove RED.**

  Run: `pnpm --filter web test -- src/hooks/useAppTabNavigation.test.tsx`

  Expected: FAIL because the hook does not exist.

- [x] **Step 3: Implement the hook.**

  - Initialize from `window.location.search` lazily.
  - Register one `popstate` listener in an effect and remove it on cleanup.
  - Main -> secondary: `pushState(managedTabState(next), '', hrefFor(next))`.
  - Secondary -> secondary: `replaceState(managedTabState(next), '', hrefFor(next))`.
  - Managed secondary -> Main: call `history.back()` and let `popstate` own the
    final state update.
  - Direct secondary -> Main: `replaceState` to the Main href and synchronously
    set Main.
  - Do not listen to or cancel a root-level Back from Main.

- [x] **Step 4: Re-run focused helper + hook tests.**

  Run: `pnpm --filter web test -- src/lib/app-tab-route.test.ts src/hooks/useAppTabNavigation.test.tsx`

  Expected: PASS with listener cleanup verified and no React act warnings.

---

### Task 4: Wire the app shell to real destinations

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/i18n/he.json`
- Create: `apps/web/src/App.navigation.test.tsx`

**Consumes:** Task 3's hook. No screen component or provider contract changes.

- [x] **Step 1: Write the failing App regressions.** Render
  `<DemoProviders><App slug="abc234" /></DemoProviders>` at `/f/abc234` and
  cover:

  - the navigation landmark has the localized label `ניווט במגרש`;
  - all four destinations are links with canonical hrefs;
  - Main initially has `aria-current="page"`;
  - clicking Settings updates the URL, selected state, and visible screen;
  - moving from Settings to History replaces the secondary destination, and a
    single simulated Back/popstate renders Main;
  - no field-provider remount occurs during the tab transition (use a stable
    provider child/mount counter or assert state that would reset on remount).

- [x] **Step 2: Run to prove RED.**

  Run: `pnpm --filter web test -- src/App.navigation.test.tsx`

  Expected: FAIL because App still uses private `useState` and button-only tabs.

- [x] **Step 3: Add `tabs.navigationLabel` to `he.json`.**

  Value: `ניווט במגרש`.

- [x] **Step 4: Replace private tab state in `App.tsx`.**

  - Import `APP_TABS`/`AppTab` and `useAppTabNavigation`.
  - Keep the existing labels, order, active styling, top placement, and minimum
    touch target.
  - Render destination anchors with real `href` values. For an unmodified
    primary click/tap, prevent the full navigation and call `selectTab(id)`.
    Do not intercept modified clicks, non-primary clicks, or explicit new-tab
    behavior.
  - Set `aria-current="page"` only on the active link.
  - Add the localized `aria-label` to `<nav>`.
  - Keep screen selection and the closed-field Main behavior unchanged.
  - Update the App JSDoc: the hook now owns destination/history state.

- [x] **Step 5: Run all navigation tests and web typecheck.**

  ```bash
  pnpm --filter web test -- src/lib/app-tab-route.test.ts src/hooks/useAppTabNavigation.test.tsx src/App.navigation.test.tsx
  pnpm --filter web typecheck
  ```

  Expected: PASS; no hardcoded Hebrew, exact-optional, or event typing errors.

---

### Task 5: Focused mobile and browser-history verification

**Files:** none unless a regression is found. Fix regressions in the owning task,
not in this verification task.

- [x] **Step 1: Run proportional automated gates.**

  ```bash
  pnpm --filter web test
  pnpm --filter web typecheck
  pnpm --filter web build
  git diff --check
  ```

  If these expose an unrelated dirty-worktree baseline failure, record it
  separately; do not repair it under this plan.

- [x] **Step 2: Verify at `375x812` in a real browser/PWA surface.** Use the
  in-app browser controller if the local Playwright wrapper is unavailable.

  1. Start at `/`, open a field, and record its `/f/:slug`.
  2. Tap History; press browser/system Back once.
  3. Confirm Main is active, the slug is unchanged, live queue/timer state is
     preserved, and there is no full-page loading transition.
  4. Tap Activity, then Settings; press Back once. Confirm it goes directly to
     Main, not Activity and not `/`.
  5. Press Forward. Confirm Settings and its active treatment return.
  6. Reload on `?tab=history`; confirm History restores. Tap Main and confirm the
     URL canonicalizes without leaving the field.
  7. From Main, press Back. Confirm the normal previous destination (`/`) remains
     reachable and no exit confirmation appears.
  8. Confirm the top tab rail, clock/share controls, queue, and sticky Quick Add
     do not overlap or horizontally overflow in Hebrew RTL.

- [x] **Step 3: Capture evidence.** Save one screenshot on a secondary tab and
  one after Back on Main, plus a short note containing the before/after URLs and
  whether the provider tree stayed mounted.

## Out of scope

- Replacing `navigateToField(location.assign)` with `location.replace`; `/` is a
  legitimate field-list destination and remains reachable from Main.
- A bottom navigation bar or Quick Add redesign.
- App-wide Android Back handling for Sheet/Dialog overlays.
- Native Android predictive-back animation; this is a web PWA history fix.
- API, database, realtime, queue, match, auth, or deployment changes.

## Completion criteria

The plan is complete only when US-074 is documented, all focused and web-package
gates are green, the `375x812` browser flow proves one Back from every secondary
destination returns to Main in the same field, Forward restores the destination,
and Back from Main remains native and ungated.
