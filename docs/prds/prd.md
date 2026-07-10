```md
# Football Match Queue Manager (MVP) - Product Requirements Document (PRD)

## 1. Overview

### Purpose

A mobile-first application for youth center staff to manage football matches quickly, fairly, and with minimal effort.

The application is designed for environments where dozens of teens continuously arrive, leave, and reorganize teams. The goal is to minimize manual work while helping staff remember who played and when.

The app is **not** a tournament manager.

It is a **live match queue manager**.

---

# 2. Design Principles

The application must always prioritize:

- Speed over features
- Simplicity over flexibility
- One-handed operation
- Minimal typing
- Minimal taps
- Zero unnecessary popups
- Never interrupt the manager during live operation

The application should feel like operating an airport control tower rather than filling out forms.

---

# 3. Core Concept

The system tracks **captains (team leaders)** only.

A captain represents an entire team.

Players inside the team are intentionally **not tracked** because:

- Teams constantly change.
- Players arrive and leave.
- Tracking individuals is too slow.
- The manager only needs to know which captain/team played.

---

# 4. Main Entities

## Captain

Fields:

- ID
- Name
- Optional nickname
- Optional note
- Optional tags
- Total matches (all time)

Daily calculated values:

- Games today
- Last match start time

---

## Session

A football evening.

Contains:

- Date
- Location
- Match duration
- Fields
- Queue
- Match history

---

## Field

Example:

- Main field
- Small field

Each field has:

- Active match
- Queue
- Timer
- History

---

## Match

Contains:

- Captain A
- Captain B
- Field
- Status
- Queue position
- Start time
- End time
- Planned duration
- Actual duration
- Started by
- Ended by

---

## Staff Member

Contains:

- Name
- Role
- Activity log

---

# 5. Main Screen

Everything needed during live management must exist on one screen.

The manager should rarely navigate elsewhere.

---

## Active Match Card

Shows:

- Captain A
- Captain B
- Field
- Countdown timer

Buttons:

- Start Match
- Pause
- Resume
- End Match
- Extend Time

---

## Queue

Shows upcoming matches.

Each row displays:

- Captain A
- Captain B
- Queue position

Actions:

- Drag to reorder
- Move to top
- Move to bottom
- Remove
- Play Again (duplicate match)
- Change captains

---

## Quick Add Match

Fast search.

Search existing captain.

Immediately display:

- Games today
- Last match start time

If captain doesn't exist:

Create and queue immediately.

No additional forms.

---

# 6. Match Lifecycle

Created

↓

Queued

↓

Started

↓

Paused (optional)

↓

Finished

↓

History

---

# 7. Timer

Configurable duration.

Example:

6 minutes

Features:

- Manual start
- Automatic countdown
- Automatic finish
- Manual finish
- Pause
- Resume
- Extend time

Requirements:

- Continues after screen lock
- Continues after reconnect
- Never loses remaining time

---

# 8. Captain Information

Whenever searching for a captain, immediately show:

- Games today
- Last match start time

Example:

Daniel

Games today: 3

Last played: 18:42

No extra tap required.

---

# 9. History

Every match stores:

- Captain A
- Captain B
- Field
- Start time
- End time
- Planned duration
- Actual duration
- Started automatically/manually
- Staff member who started
- Staff member who ended

History must remain permanently available.

---

# 10. Staff

Multiple staff members can use the application simultaneously.

Examples:

Sarah

David

Michael

Requirements:

- Real-time synchronization
- No device ownership
- Multiple active managers allowed

---

# 11. Staff Activity Log

Every action records:

- Staff member
- Timestamp
- Field
- Action

Example:

18:42

Sarah started Daniel vs Noam

18:48

Automatic finish

18:50

David moved Daniel to Queue Position #1

---

# 12. Multiple Fields

Support multiple football fields.

Example:

Field 1

- Active match
- Queue
- Timer

Field 2

- Active match
- Queue
- Timer

Captains cannot play simultaneously on two fields.

---

# 13. Fairness

The system never forces fairness.

Instead it provides visibility.

When choosing a captain, staff immediately sees:

- Games today
- Last match start time

This helps avoid selecting teams that played recently.

---

# 14. Private Notes

Each captain may contain optional private notes.

Examples:

- Needs supervision
- Very cooperative
- New participant

Visible only to staff.

---

# 15. UX Rules

## Speed First

Every common action should take only a few seconds.

---

## No Blocking Popups

Avoid confirmation dialogs.

Prefer:

- Undo
- Soft warnings
- Disabled actions

Only block technically impossible actions.

---

## One Screen

The manager should not leave the main dashboard during normal operation.

History and Settings are secondary screens.

---

## Large Touch Targets

Designed for quick use outdoors.

---

## Minimal Typing

Existing captain:

Search → Tap

New captain:

Type name → Enter

Done.

---

# 16. Edge Cases

The application should gracefully handle:

- Late arrivals
- Teams reshuffling
- Captains wanting another match
- Queue reordering
- Priority teams inserted into queue
- Match canceled before start
- Match ended early
- Match extended
- Pause/resume
- Device lock
- Internet reconnect
- Wrong action (Undo)
- Duplicate captain names
- Multiple staff members
- Multiple fields
- Different manager tomorrow
- History review weeks later

---

# 17. Non-Goals (MVP)

Not included:

- Individual player tracking
- Team rosters
- Player statistics
- League tables
- Tournament brackets
- Parent portal
- Payments
- Notifications
- Messaging

---

# 18. Success Criteria

The application succeeds if:

- Existing captain can be queued in under **3 seconds**.
- New captain can be created and queued in under **5 seconds**.
- Managers rarely leave the main screen.
- Managers can instantly answer:
  - Who played last?
  - How many games has this captain played today?
  - When did they last play?
- No unnecessary popups interrupt live management.
- The application remains fast with **50+ captains** in a single session.

---

# 19. Future Ideas (Post-MVP)

- QR code for captain registration
- Photo avatars
- Skill balancing
- AI fairness recommendations
- Tournament mode
- Reports and analytics
- Export session history
- Offline mode with synchronization
- Cross-device notifications
- Attendance integration
```
