# ShiftSwap

Tool to suggest valid shift-swap candidates for residents in a medical center's monthly on-duty schedule. Given a person and a shift they want to swap out of, return the list of (person, shift, date) tuples they could request a swap with, subject to the rules below.

This is a **recurring tool**: a new CSV is published every month, the rules stay stable, the schedule is what changes. The system must keep working month-over-month with no code changes — only a new CSV file.

**Distribution model: static SPA on GitHub Pages.** A React app the user opens in their browser. They pick the monthly CSV with a file dialog; it is parsed and queried entirely in-browser. No server, no database, no auth, no upload. PHI-adjacent schedule data never leaves the user's machine — the static site only ships JS and CSS down. If this ever needs a real backend (auth, multi-user, audit trails), the domain logic in `src/lib/swapper/` transplants verbatim; only the app shell is throwaway.

Status: live web app. Domain logic + UI complete; tests green; deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to main.

## Inputs

The reference month (July 2026) lives in `fixtures/` and is used as the test fixture for the parser:
- `fixtures/schedule_141955_d4hqth5sqw.csv` — canonical for parsing
- `fixtures/schedule_141955_d4hqth5sqw.xls` — same data
- `rules.txt` — swap rules and shift-type catalog (marked "preliminary")

CSV layout (assumed stable across months):
- Row 1: `Table 1`
- Row 2: title containing month + year, e.g. `EM Residents Schedule - July 2026,,,,,,,` — parser extracts `(year, month)` from here.
- Weekly blocks stacked vertically. Each block: a header row of day numbers (Sun..Sat) with the first column blank, then one row per shift label, then implicit boundary at next day-number row.
- Cells may contain multiple residents separated by `\n` (one name per line after split).
- Empty cells mean no one is assigned.

If next month's CSV deviates (new shift labels, header changes), the parser should fail loudly with a clear diagnostic rather than silently mis-route.

## Shift-type model (per rules.txt)

Every shift has: **shift type**, **level**, **start time**, **length**. Most shifts are 9h; SCH is 10h; Risk is 24h (6am–6am).

Shift types and levels:
- **Trauma** — `TD` (Trauma Doc), `TT` (Trauma Team)
- **H Medi** — `MED SD` (Senior), `MED JD` (Junior), `MED ND` (Non-Dyad, off-service residents)
- **UW ED** — `UW SD`, `UW JD`, `UW ND`
- **HMC** — `R4` (R4 residents) — *may correspond to the CSV's `Trauma T SR` rows; unconfirmed*
- **SCH** — Seattle Children's (10h shifts)
- **Risk** — 24h, non-swappable, blocks the resident from any other shift that day

## Swap rules (per rules.txt)

1. Rest: a swap is only valid if both residents have ≥ shift-length hours off **before and after** the shift they would take. (Rule 1, 7.)
2. Allowed level swaps (rule 2 — operative; rule 3 dropped per user as drafting error):
   - **SD ↔ SD** across UW and H Medi
   - **JD ↔ JD** across UW and H Medi
   - **TD ↔ SD** (UW or H Medi)
   - **TT ↔ TT** only
   - **ND ↔ ND** only (rule 4)
   - Cross-hospital allowed (rule 5)
3. Risk shifts cannot be swapped, but they block the resident from taking any concurrent shift (rule 8).
4. The candidate shift cannot be at the same time as the original shift (rule 9).

## Swap-candidate algorithm (intended)

Given: requester `X`, original shift `Y` on date `D_Y`.

Return all `(P, S, D_S)` where:
1. `S.level` is swap-compatible with `Y.level` (per rule 2 above).
2. `P` is not assigned to any shift overlapping `Y`'s time window.
3. `P` would have ≥ `Y.length` hours of rest before `D_Y@Y.start` and after `D_Y@Y.end`, given P's other assignments (including Risk).
4. `P` is not on Risk during `Y`.
5. Symmetrically: `X` is not assigned during `S`, has rest around `S`, and is not on Risk during `S`.
6. `(D_Y, Y.start)` ≠ `(D_S, S.start)`.
7. `P ≠ X`.

## Working assumptions (defaults — flag if any are wrong)

These were decided to keep moving; correct any that are wrong before build starts.

- **Time mismatches** (CSV `10p` vs rules `9p` for UW SD/ND evening): **CSV is binding** (confirmed by user). `rules.txt` is preliminary and the source of truth for shift start times is the CSV header label (e.g., `UW ED UW SD 10p` → 10:00 PM start).
- **Person's level**: computed per-shift, not per-person. The same name can appear in different shift types across the month; the level used for swap-matching is the level of the specific shift being swapped.
- **Month boundary (June 30 / Aug 1 spillover)**: ignore for v1 — treat July as self-contained for rest calculations. Revisit when adjacent-month data is available.
- **SCH (Seattle Children's)**: default to **SCH ↔ SCH only** since rules don't list cross-class matches. 10h rest window.
- **H Medi Clinic**: exclude from the swap system in v1 (no time/length defined, possibly outpatient and not in scope). Person on Clinic is treated as "unavailable that day" for rest checks.
- **Risk Senior Back Up**: treat like Risk for blocking purposes (resident is unavailable 6am–6am that day), and not swappable.

## Resolved (was open)

- **`Trauma T SR` rows = HMC R4 shifts.** Swap class: **Senior-equivalent** — R4 shifts swap with SD shifts (UW or H Medi) and with TD shifts, same as SD↔TD↔SD.

## Open questions

None blocking. Add new items here as rules.txt is revised.

## Maintainer profile

**Builder ≠ long-term maintainer.** The current user (Guna) is doing the initial build and will hand off. Expected primary long-term maintainer: a resident physician — domain expert, not a software professional. Hospital IT may take over later. Every architecture choice should optimize for hand-off readability and AI-assisted iteration by the resident, not for build-time velocity. Implications:

- Prefer **established, well-documented frameworks** over modern-but-niche ones. An LLM assistant should be able to write idiomatic code for the stack on first try.
- Prefer **plain server-rendered or static** over heavy client-side state, but a SPA is fine here because the entire app is one screen.
- Keep the directory tree small and the number of distinct concepts low.
- One toolchain (Node only). No Rust, no Docker, no database.

## Stack

All TypeScript end-to-end. No server, no DB. Distributed as static files via GitHub Pages.

- **Language**: TypeScript.
- **Bundler / dev server**: **Vite**.
- **UI framework**: **React 19**.
- **Styling**: **Tailwind CSS v4** (via `@tailwindcss/vite`). UW Husky Purple (`#32006e`) is the only accent over Tailwind's default slate scale.
- **CSV parsing**: **papaparse**.
- **Date math**: **date-fns**.
- **Tests**: **Vitest** against the July 2026 fixture in `fixtures/`.
- **Hosting**: **GitHub Pages**, deployed by `.github/workflows/deploy.yml` on push to `main`. The workflow sets `BASE_PATH=/${repo}/` so the Vite build uses the correct asset base for `https://<user>.github.io/<repo>/`.
- **Layout**:
  - `src/`
    - `lib/swapper/` — **framework-free domain logic**. Portable to any future shell.
      - `parser.ts` — CSV → normalized `(date, shiftLabel, personName)` rows.
      - `shifts.ts` — shift catalog: label → `{ type, level, startHour, lengthHours, swapClass }`.
      - `rules.ts` — swap eligibility (level matching, rest windows, Risk blocking, same-time exclusion).
      - `finder.ts` — candidate search + grouping helpers.
      - `types.ts` — shared types.
    - `App.tsx` — the one screen.
    - `platform.ts` — browser-only helpers (`<input type="file">` + `localStorage`).
    - `index.css` — Tailwind import + base styles.
    - `main.tsx` — React mount.
  - `tests/` — Vitest tests against the July 2026 fixture.
  - `fixtures/` — reference CSVs.
  - `.github/workflows/deploy.yml` — GitHub Pages deploy.

## Persistence model

There isn't one in the traditional sense.

- **In-memory state**: when the user opens a CSV, `parser.ts` produces a normalized `Schedule` object (a list of `Assignment` rows). The whole app queries that object directly.
- **On disk**: only `localStorage` for the last-used filename (display hint — browsers cannot reopen a file by path without a fresh user gesture). No PHI is persisted client-side.
- **Nothing leaves the browser.** No fetch calls to a backend; the static site only ships JS and CSS down.

If a future hosted multi-user version is built, the `Schedule` / `Assignment` / `ShiftCatalogEntry` types in `src/lib/swapper/types.ts` are the contract.

## Lifecycle / multi-month operation

- **Opening a month**: user clicks "Open CSV", browser file dialog opens, they pick the month's CSV. The app parses it in memory.
- **No "last opened reopen"**: the browser sandbox can't silently re-read a file. The user re-picks at the start of each session.
- **Switching months**: click "Open different CSV" and pick another file. Only one schedule is loaded at a time.
- **Cross-month rest**: v1 treats each opened CSV as self-contained. The rest-window check stops at the file's boundaries; near month edges, candidates may be slightly over-permissive. Documented as a known limitation.
- **Shift catalog**: hardcoded from `rules.txt` + CSV labels observed in July 2026. If a CSV has a label not in the catalog, the parser raises a clear error and the UI shows it. The catalog is edited in code and a new build is released (automatic via the GitHub Action). Admin-editable catalog is a v2 feature.

## Working agreement

- The reference July 2026 CSV is the regression fixture for every domain-logic layer.
- User-facing flow: open CSV → pick yourself by name → pick which of your shifts to swap (calendar chip click) → see candidates grouped by person → optionally filter by date by clicking a candidate day in the calendar.
- The candidate contacts the requester outside the app (text, email, page). No in-app swap workflow.
- v2 candidates (out of scope): swap-request tracking, notifications, hospital SSO, admin-editable shift catalog, mobile-first redesign, cross-month rest checks.
