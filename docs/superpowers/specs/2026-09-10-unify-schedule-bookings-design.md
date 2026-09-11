# Unify therapist schedule + bookings into one page — design

## Context

Two separate therapist-facing screens exist today:

- `/schedule` — a week grid (5 weekdays × hourly rows, 9:00–20:00) where the
  therapist paints each hour "施術可能" (available) / "不可" (unavailable) /
  "休憩" (break), with drag-to-paint, a copy/paste clipboard for reusing a
  week's pattern, and a lock on past dates. Backed by `therapist_shifts` +
  `therapist_breaks`.
- `/bookings` — a per-day timeline (9:00–20:00, 30-min tick marks) listing
  confirmed reservations for today/tomorrow/+2 days, with a click-to-open
  detail popup (client name, department, note, cancel button) and a Slack
  notification toggle. Backed by `reservations` + `notification_settings`.

Hearing feedback (2026-09-10) identified that having to leave the bookings
screen to register a break on the schedule screen is annoying, and that the
two screens' underlying concept — "what is this therapist doing at this
time" — is really one thing viewed two ways. Decision: merge them into a
single page.

## Goals

- One route, one nav item, one grid: register availability (available /
  unavailable / break) and view/cancel reservations in the same view.
- Preserve all existing schedule-side tooling: tool-select + drag-to-paint,
  clipboard copy/paste (single or multi-week), past-date lock, default-to-available.
- Preserve all existing bookings-side capability: per-reservation detail
  popup (note + cancel), Slack notification toggle.
- Grid granularity becomes 30 minutes (was 60 minutes on `/schedule`; was a
  continuous pixel timeline with 30-min tick marks on `/bookings`).
- A reservation renders in the **same color as "施術可能"** — a reservation is
  a booked instance of an available slot, not a separate visual category.

## Non-goals

- No change to the reservation-creation flow (doesn't exist yet — out of scope).
- No change to `db/schema.sql` or the mock-db schema; this reuses
  `therapist_shifts`, `therapist_breaks`, `reservations`, `notification_settings` as-is.
- No sub-30-minute visual precision in the grid. A reservation that starts or
  ends off a 30-min boundary (e.g. 15:00–15:15) still renders as occupying
  the 30-min cell(s) it overlaps; its exact time is shown as text in the cell
  and in the detail popup. (15-min-granularity bookings are a user-side
  concept — see the `project_overflow_booking_rule` memory — not something
  this therapist-facing grid needs to render pixel-exactly.)

## Route & data

- New unified page at `/schedule` (keeps the existing route; `/bookings`
  and `src/app/(therapist)/bookings/` are deleted). `HOME_PATH_BY_ROLE.therapist`
  in `src/lib/dal.ts` already points at `/schedule` — no change needed there.
- Sidebar nav collapses to one item, labeled "マイスケジュール", instead of the
  current two ("勤務時間登録" / "予約確認").
- `src/app/(therapist)/schedule/page.tsx` fetches, per weekday in the
  displayed week: `getDayAvailability` (existing) AND
  `getReservationsForTherapist` (existing, from `src/lib/reservations.ts`).
  Both are cheap synchronous SQLite calls already used today.
- Notification settings (`getNotificationSettings`) move from the bookings
  sidebar into this same page's sidebar.

## Cell model

Each grid cell is one (weekday, 30-min slot) pair. Its rendered state is
computed by combining two independent sources:

1. **Availability** (`SlotState`: available / unavailable / break) — from
   `getDayAvailability`, now returning 22 slots/day (9:00–20:00 in 30-min
   steps) instead of 11.
2. **Reservation occupancy** — any confirmed reservation overlapping that
   30-min window, from `getReservationsForTherapist`.

Rendering rules, in priority order:
- If a reservation overlaps the cell: render with the "available" color
  (`bg-role-therapist text-white`, same as today's 施術可能), plus the
  client's name (truncated) as the cell's label. The cell is **not**
  paintable — clicking it opens the existing detail popup (client, department,
  note, cancel button) instead of applying the selected tool.
- Else: render by `SlotState` exactly as today (available / unavailable /
  break colors), paintable via the existing tool-select + click/drag
  mechanism.
- Past-day lock (existing behavior) still applies on top of both cases: past
  cells are non-interactive regardless of reservation occupancy.

A reservation spanning multiple 30-min cells (e.g. 45 min → 2 cells) renders
its name/label in each overlapped cell rather than one spanning block — this
keeps the cell grid a simple 2D array (like today's schedule grid) instead of
introducing the absolute-positioned overlay layer `/bookings` used. Simpler,
and acceptable per the "no sub-30-min visual precision" non-goal.

## Interaction

- Tool-select (施術可能/不可/休憩) + click/drag-to-paint: unchanged, applies
  only to non-reservation, non-past cells.
- Clicking a reservation cell: opens the same detail popup `/bookings` has
  today (ported as-is), with its own cancel button (calls the existing
  `cancelReservation` action).
- Save button: unchanged — saves the current week's painted `SlotState`s
  (reservation cells are never part of what gets saved, since they're not
  paintable).
- Copy/paste clipboard: unchanged, operates on `SlotState` only (reservations
  are never copied — copying a week's availability pattern to another week
  doesn't move anyone's actual bookings).
- Notification toggle: unchanged, ported from `/bookings`' sidebar.

## Error handling

No new failure modes: this reuses existing, already-guarded data access
(`getDayAvailability`, `getReservationsForTherapist`, `saveWeekAvailability`,
`copyWeekAvailability`, `cancelReservation`, `setBookingNotificationEnabled`)
and existing server-side past-date guards. No new Server Actions needed.

## Testing

Manual verification in the dev server (this project has no automated test
suite): today's week shows existing reservations with names in
available-colored cells; clicking one opens the detail popup and cancel
still works; painting a non-reservation cell still works; past-day lock
still applies; copy/paste and multi-week paste still work with the new
22-slots-per-day shape; `/bookings` no longer resolves (or redirects to
`/schedule`).
