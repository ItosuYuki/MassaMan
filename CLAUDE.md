# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**マッサマン (Massage Manager)** is a company-internal massage-room booking system. The Next.js
scaffold described in `docs/superpowers/specs/2026-09-08-nextjs-scaffold-design.md` has been
executed (see "Implementation architecture" below for what actually landed, including where it
deviates from that spec) and the login + role-based routing feature is implemented. Most of the
booking/schedule/dashboard functionality itself is still backlog (issues #5–#12) — only a
placeholder home page exists per role so far. `design/*.html` and `DESIGN.md` remain the source of
truth for what each screen should look like when those features are built.

## Repository layout

- `design/*.html` — static screen mockups (one file per screen × breakpoint, e.g.
  `user-booking-desktop.html` / `user-booking-mobile.html`). These are the source of truth for
  what each screen should look like. There is no shared stylesheet: each file is a standalone
  document with its own `<style>` block and its own Google Fonts `@import`.
- `design/notification-card-component.html` — the one shared component mockup (inlined into
  other screens via `dc-import` at design time; the real Next.js app should port it to a real
  component instead).
- `DESIGN.md` — the extracted design system (colors, type, components, layout rules) derived from
  `design/*.html`. **This is the canonical reference for any visual/UI work** — read it before
  touching colors, fonts, spacing, or component styling, instead of re-deriving tokens from the
  mockup HTML by eye.
- `docs/superpowers/specs/2026-09-08-nextjs-scaffold-design.md` — the accepted design for how the
  eventual Next.js app should be scaffolded (route structure, tooling choices, token migration
  plan). Follow it when creating the app.
- `massage-room-booking-screen-design.html` — the original published Claude Design canvas
  artifact this project's screens were drafted from. It is a self-contained canvas file (its own
  unrelated `--om-*` token system from the Design canvas tool itself, not this product's design
  tokens) and is largely superseded by the individual files under `design/`; treat `design/*.html`
  and `DESIGN.md` as authoritative instead.

## Working with the design system (`DESIGN.md`)

Read `DESIGN.md` in full before implementing or modifying any UI. Key rules that are easy to miss:

- **Colors**: cool blue palette only. Semantic colors (amber for auto-assigned warnings, gold for
  star ratings, `#C4523A` for destructive actions) are fixed and must never be replaced by brand
  blue, even when the brand rebrands again. Destructive actions are outline-style (white bg, red
  border/text), never a filled red button.
  Three role tints (`--role-user`, `--role-therapist`, `--role-admin`) share the same blue family
  at different lightness/saturation — do not give roles different hues.
- **Typography**: exactly three typefaces (Shippori Mincho for headings, Noto Sans JP for body/UI,
  JetBrains Mono for anything numeric — times, counts, percentages — paired with
  `font-variant-numeric: tabular-nums`). Do not introduce a fourth.
- **Icons**: every icon is inline SVG, `viewBox="0 0 24 24"`, `stroke-width="1.8"`, `currentColor`
  — **except the logo**, which is a traced filled illustration (a mermaid, from the project's old
  codename "Ningyo") and is the one deliberate exception. Don't "fix" the logo to match the line-art
  convention.
- **Flat design**: no drop shadows, no gradients, anywhere. Separation between elements comes only
  from a 1px border and background contrast.
- **No hidden primary controls**: decision-critical controls (gender filter, therapist picker) are
  always visible by default, never tucked behind a mode toggle.
- **Availability display**: uses three symbols directly in grid/list cells — `✓` (booked/confirmed),
  `◯` (available), `✕` (unavailable) — not text pills like "空き"/"予約済み". Always pair with a
  legend row.
- When building a new screen, find the closest existing file under `design/` and follow its
  structure (sidebar width, padding, panel nesting) rather than redesigning layout from scratch.

## Implementation architecture

Next.js has been scaffolded and the login feature is implemented (on the `login` branch, not yet
merged to `main` as of this writing). This section describes the actual state — verify it still
matches reality before relying on it, since it will keep drifting as more features land.

- **Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, `src/` directory, pnpm, ESLint,
  Turbopack.
- **One route = one component**: unlike the mockups (separate `-mobile.html`/`-desktop.html`
  files per screen), the real app has a single page/component per route, made responsive via
  Tailwind breakpoints (`sm:`, `lg:`). Never create separate mobile/desktop routes.
- **Route groups mirror the three user roles** (no URL segment added):
  ```
  src/app/(auth)/login/
  src/app/(user)/booking/
  src/app/(therapist)/schedule/
  src/app/(admin)/dashboard/
  ```
  Only the role *home* route exists so far per group (the one the login redirect targets).
  `reservations`, `bookings`, `therapists` etc. from the original plan are still backlog
  (issues #5–#12) and not yet created.
- **Design tokens live in `src/app/globals.css`'s `@theme` block, not `tailwind.config.ts`.**
  Tailwind v4 is CSS-first — `tailwind.config.ts` is not used at all. Fonts (Shippori Mincho /
  Noto Sans JP / JetBrains Mono) are loaded via the same Google Fonts `@import` every
  `design/*.html` mockup uses (placed *before* `@import "tailwindcss"` — required by Tailwind
  v4/PostCSS's `@import`-ordering rule), not `next/font/google` — this repo's dev sandbox could
  not resolve `next/font/google`'s build-time font fetch reliably, and the CSS `@import` approach
  is also what DESIGN.md §3 already documents.
- `src/components/` — shared components (currently just `role-home.tsx`, the placeholder each
  role's home page renders after login).
- `src/lib/` — `session.ts` (jose-based signed session cookie), `dal.ts` (`verifySession`/
  `requireRole`, the Data Access Layer per Next.js's own auth guidance), `db.ts` (opens a
  `postgres.js` connection to the local Docker-run PostgreSQL, wrapped in Drizzle ORM —
  see `src/db/schema.ts` for the schema and `docker-compose.yml` for the local server),
  `employees.ts` (`findEmployeeByCode`, queries that database — see below), `booking/data.ts`
  (the reservation/review data-access + business logic for the user booking flow, same
  database), `reservations.ts`/`shifts.ts`/`shift-slots.ts` (the therapist-facing schedule
  screen's equivalent layer).
- `src/proxy.ts` — Next.js 16 renamed `middleware.js` to `proxy.js`; does the optimistic
  (cookie-only) auth redirect. Per-route/Server Action checks still happen via `dal.ts` — Next's
  own docs are explicit that Proxy alone is not sufficient.

### Auth (login branch)

- **Method**: employee number + password, via a Server Action (`src/app/actions/auth.ts`).
  There's also a disabled "社内アカウントでログイン" (SSO) button in the UI, matching the
  mockups — no SSO provider is chosen yet, so it's inert.
- **Credential store**: `src/lib/employees.ts` queries the real PostgreSQL database (via
  Drizzle ORM, `src/db/schema.ts`) — see `docs/database-auth-design.md` and its §5 for the
  8 test accounts / shared test password. Run `docker compose up -d` to start Postgres
  locally, then `pnpm db:generate && pnpm db:migrate && pnpm db:seed` to build the schema
  and populate test data before running the app (see
  `docs/superpowers/specs/2026-09-10-postgres-migration-design.md` for the full migration
  design).
- **Session**: signed (HS256, `jose`), stored in an `httpOnly` cookie. Secret comes from
  `SESSION_SECRET` in `.env.local` (see `.env.example`; generate with `openssl rand -base64 32`).
- Reservation creation (issue #6) is implemented and reads/writes the same PostgreSQL
  database via `src/lib/booking/repo.ts` — rooms are fixed per therapist
  (`therapist_profiles.room_id`), not chosen freely per booking. The rest of the
  booking/schedule/dashboard screens remain separate GitHub issues (#5, #7–#12 in the
  `ItosuYuki/Ningyo` repo history) to be designed per-feature. `db/schema.sql` is designed
  and verified (see its own commit and `docs/database-auth-design.md`); `src/db/schema.ts`
  is the Drizzle source of truth it was ported from.
