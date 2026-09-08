# Next.js scaffold (App Router) — design

## Context

The project has decided to build マッサマン (Massage Management) with
Next.js. The screen designs already exist as static mockups under
`design/` (15 screens covering login, user booking/reservations,
therapist schedule/bookings, admin dashboard/therapist management, and
a shared notification-card component), and the feature backlog is
tracked as GitHub issues #5–#12 in `ItosuYuki/Ningyo`, one issue per
domain area. This design covers only the initial project scaffold —
the file/folder conventions the rest of the implementation will build
on — not the feature implementations themselves.

## Setup command

Run in the repository root (`MassaMan/`), which already contains
`README.md`, `design/`, and `massage-room-booking-screen-design.html`:

```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --src-dir --app --import-alias "@/*" --eslint --turbopack
```

Choices and why:
- **TypeScript** — the domain (bookings, schedules, roles) has enough
  shape that type-checking pays for itself.
- **Tailwind CSS** — matches create-next-app's default, lets the
  design tokens already present in the mockups (see below) become
  utility classes instead of hand-written CSS.
- **`src/` directory** — keeps `app/`, `components/`, `lib/` out of
  the repo root, which already holds `design/` and top-level docs.
- **App Router** — decided by the user before this design started.
- **pnpm** — already installed locally; faster installs, less disk
  use than npm.
- **ESLint** — create-next-app default, no reason to skip it.
- Prompted to continue in a non-empty directory: answer yes (the
  existing files don't collide with anything create-next-app writes).

## Route structure

Route groups mirror the 8 feature issues so each maps to one
implementation unit:

```
src/
  app/
    (auth)/login/
    (user)/
      booking/
      reservations/
    (therapist)/
      schedule/
      bookings/
    (admin)/
      dashboard/
      therapists/
    layout.tsx
    globals.css
  components/
    notification-card/   # shared component, ported from
                          # design/notification-card-component.html
    ui/                   # shared primitives (buttons, cards, ...)
  lib/                    # auth/data-access utilities (added as
                          # each feature needs them, not scaffolded
                          # empty)
  types/
```

Route groups (`(auth)`, `(user)`, `(therapist)`, `(admin)`) organize
routes by who uses them without adding a URL segment.

## Mobile vs. desktop

`design/` has separate mockup files per breakpoint (e.g.
`user-booking-mobile.html` / `user-booking-desktop.html`). The real
app does **not** mirror this as separate routes: each route is one
page, one component tree, responsive via Tailwind breakpoints
(`sm:`, `lg:`, etc.) so mobile and desktop layouts live in the same
file.

## Design tokens

Each mockup's `:root` block defines CSS custom properties (`--bg`,
`--accent`, `--ink`, etc.) on a shared warm-neutral palette (colors
vary slightly per role — user/therapist/admin each tint their own
accent). These get moved into `tailwind.config.ts` under
`theme.extend.colors`, so components reference them as Tailwind
utilities (e.g. `bg-app`, `text-ink-soft`) instead of inline styles or
hand-written CSS variables. The exact token list is populated when the
first screen is implemented, not as part of this scaffold — this
design only establishes that tokens live in the Tailwind theme, not
scattered CSS files.

## Out of scope

Deferred to per-issue design when each feature is implemented:
- Authentication method (SSO integration details vs. employee-number
  login)
- Database / backend architecture (bookings, schedules, reviews)
- Notification delivery (Slack webhook integration, email)

This scaffold only produces the Next.js project skeleton and the
folder/route conventions above.
