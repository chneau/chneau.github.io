# AGENTS.md

Agent guidance for **chneau.github.io** — a Bun + Rsbuild multi-page site: a
dashboard plus six sub-apps (`cv`, `birthday`, `scotland-rail`,
`crimson-desert-save-editor`, `spooners`, `design`) sharing one Mantine design
system.

The rules below are what this codebase has already decided. Where they differ
from a habit carried in from another repository, this file wins.

---

## 1. Commands

| Command                | What it is                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `bun start`            | Dev server for every app at `localhost:3000`                                        |
| `bun run start:<app>`  | One app in isolation (`cv`, `birthday`, `design`, …)                                |
| `bun run check`        | **The gate** — clean, Deno fmt, Oxlint, Biome, tsc, `bun test`                      |
| `bun run check:fix`    | Formatters and linters only, no typecheck or tests                                  |
| `bun run check:export` | `ts-unused-exports` — not part of `check`; run it when adding or removing an export |
| `bun run build`        | Production build of all environments into `dist/`                                   |
| `bun run deploy`       | Build, then publish `dist/` to GitHub Pages                                         |

- **FORBIDDEN**: `npm`, `npx`, `yarn`, `pnpm`. **REQUIRED**: `bun`, `bun x`.
  Never invoke an npm command and never recommend one.
- `bun run check` runs its steps **in order and sequentially**, and it is the
  only invocation whose output means anything. Read the script before quoting a
  figure from a differently-configured run: the same `biome` run twice in one
  session reported 7 057 errors and then 5, because the second was the project's
  own `timeout 3s biome check --write --unsafe .` and the first was not, and had
  walked into `node_modules`.

---

## 2. Strict TypeScript

### Zero `any`, zero non-null assertions

- **FORBIDDEN**: `any`, `as any`, `as unknown as T`, `Record<string, any>`, and
  the non-null assertion `!`. There is not one `!` in the source tree.
- **REQUIRED**: explicit domain `type` models for records, payloads, props and
  component states. Dynamic data is narrowed by a type predicate or a
  discriminated union, never silenced.

`unknown` is permitted where it is genuinely honest, and this codebase uses it
that way — a value arriving from outside the process (a decoded PARC record, a
`fetch` body) is `unknown` until something has checked it, and `unknown` is the
correct parameter type for that (`describeError(error: unknown)`). What is
**not** permitted is `unknown` on a value a caller receives: not a return type,
not a property a component reads. Classify or narrow it before it leaves the
module that received it.

The one `any` in the tree is a canvas prototype patch in `birthday/index.tsx`
carrying a `biome-ignore` with its reason. A second widening needs a written
argument, not a stylistic choice.

### Casts

`as` tells the compiler to stop checking. Before writing one, try, in order:

1. Iterate the canonical list rather than the type's keys (`Object.keys` loses
   key types — iterate `APPS`, `APP_CATEGORIES`, a typed record list).
2. Narrow where the value arrives, so every consumer downstream already reads a
   true type (`itemsToEdit` in the save engine, `positionGeometry`-style
   discriminated unions).
3. Give the data a true type where it enters — a discriminant, a generic
   parameter, a `$type<T>()`-style annotation — before a consumer needs one.

`as const` asserts nothing and is unaffected. A cast over a third-party type
wider than our use of it (`RenderedCell`, a `string`-keyed `Object.keys`) is
tolerable; a cast that bridges two of _our_ types buys silence and owes the next
reader a lie.

### Null safety & indexed reads

`noUncheckedIndexedAccess` is on: a read from an array or dictionary is
`T | undefined` until narrowed. Handle the absence where the value is read — a
truthiness guard, optional chaining, a default — so every consumer downstream
reads a type that is already true. Optional chaining is a guard, not a tidier
spelling of `!`.

### Inference & cleanliness

`noUnusedLocals` and `noUnusedParameters` are on, so an unread import, local or
parameter is an error. A parameter a contract requires but the body does not use
is named with a leading underscore (`_event`) — the only underscore a name
carries.

The compiler infers more than it is given credit for. Annotate the boundary — an
exported value, a component's props, an API input and output — and let the
interior stay unadorned. A callback handed to `map` or `filter` already has its
parameter types; a local arrow whose return type is plain in its body does not
need one written over it.

### Shape of a declaration

- **FORBIDDEN**: `interface Foo { … }`. **REQUIRED**: `type Foo = { … }`.
- **FORBIDDEN**: `function doThing() { … }`. **REQUIRED**:
  `const doThing = () => { … }`.
- **FORBIDDEN**: `export default Foo;`. **REQUIRED**: `export const Foo = …;`.
  The exceptions are the two places a third party demands it — the `i18next`
  instance in `birthday/i18n.ts` and `defineConfig` in `rsbuild.config.ts`.
  Re-export from `src/shared/index.ts` rather than adding a second entry point.

---

## 3. Comments, Suppressions and Recorded Decisions

This codebase writes its comments. A load-bearing rule, a measured regression or
a rejected alternative is prose beside the code it explains, in JSDoc or a `//`
line that says _why_ rather than _what_. Do not strip comments on the way in; a
change arriving from a codebase written the other way keeps its explanations.

What is bounded is **suppression**:

- A `// biome-ignore lint/<group>/<rule>: <reason>` needs the reason. There are
  seven in the tree — three of them one ARIA menu pattern in `AppSwitcher` — and
  each names what the rule cannot see: the dashboard's arrow-key roving focus,
  the scrollable timeline's extra tab stop, the birthday canvas stub. An
  undocumented suppression is a bug.
- A rule switched off in `biome.jsonc` needs a paragraph in the file saying what
  the rule protects, why it is wrong here, and **which test asserts the property
  so it cannot be lost**. `noImportantStyles` is off because the reduced-motion
  guard in `base.css`, the print rules in `cv.css` and the motion overrides in
  `Section.css` are only load-bearing under `!important`; 14 elements animated
  under `prefers-reduced-motion: reduce` without it and 0 with it, and printing
  within the first ~1.2 s produced a page with a name and nothing else. That has
  already bitten: a `biome check --write --unsafe` pass stripped all of it and
  the regressions came back silently. They are now guarded by
  `shared/tests/tokens-theme.test.ts`, `cv/cv-media.test.ts` and
  `shared/tests/motion.test.ts`.
- **FORBIDDEN**: silencing a finding to make the gate green. `noArrayIndexKey`
  is not pedantry — a key taken from a `.map()` index is reassigned when the
  list reorders, so React hands one element's state to another. Fix the code.
  The case that generalises: a rule about duplicate properties was once
  satisfied by moving the fallback into `@supports` rather than by deleting it.
  Both make the linter green; only one keeps the old browser working.

### A decision that outlives the diff gets an ADR

Architecture calls are written down under `docs/adr/` beside the app they govern
— `src/crimson-desert-save-editor/docs/adr/0001…0006`. The house form: the
decision in the title as a claim, what the code does now and why it is not the
obvious alternative, `_Considered:_` the options with what each costs, and the
consequences, including what would reverse it. Read them before changing the
save engine's threading, where editing happens, or how equipment is written; and
add one when a change would otherwise have to be re-litigated by the next
survey.

---

## 4. Libraries

### Zod v4

Top-level format constructors, not the string method:

- `z.uuid()`, not `z.string().uuid()`
- `z.url()`, not `z.string().url()`
- `z.iso.datetime()`, not `z.string().datetime()`
- `z.email()`, not `z.string().email()`

### Mantine v9 and the rest

Check the installed version's types before reaching for a prop; do not write an
API from memory of another major. Mantine, Recharts and Mantine Charts, Leaflet
/ React-Leaflet, Valtio for local reactive state, TanStack Query where a value
is fetched, i18next / react-i18next for the birthday app's seven locales
(covered by `birthday/tests/locales.test.ts` — a new key belongs in every locale
file). Antd conventions from another repository do not travel here; this is
Mantine.

### Generated files are read-only

- `public/birthdays.ics` is written by `src/birthday/_genIcs.ts` at build time
  and by `birthday/ics.ts` in the browser, through the same generator, so the
  two always agree. Edit the generator, never the `.ics`.
- `src/crimson-desert-save-editor/lib/generated/*.json` and the save fixtures
  under `saves/` and `assets/image-archive/` are inputs to the engine and its
  tests, produced by `scripts/`. A hand edit is lost the next time they are
  produced and leaves the file agreeing with neither its source nor the engine.
- A rule the generated vocabulary cannot carry goes in a hand-written sibling
  module (`lib/add-plan.ts`, `lib/staged-projection.ts`), never inside the
  generated file.

---

## 5. Architecture

- One **Rsbuild environment per app**, declared in `rsbuild.config.ts` with its
  entry, HTML template, title, meta, icons and manifest. An environment that
  surfaces a build stamp declares `define: { BUILD_DATE }`; one that does not,
  must not — an unused define is dead config.
- A new app means: its environment in `rsbuild.config.ts`, `start:<name>` and
  `build:<name>` scripts, an entry under `src/<name>/`, an `AppEntry` in
  `src/shared/apps.tsx` (which also drives the 1–6 hotkeys, search, palette and
  404), its tests, and a README section.
- **`src/shared/`** holds the design system: `tokens.css`, the theme factory,
  header, app switcher, footer, command palette, `AppCard`, `EmptyState`,
  `Stat`, `SkipLink`, `SchemeToggle`, the shortcut reference, plus
  `usePersistentState` (localStorage with cross-tab sync and blocked-storage
  fallbacks) and `useThemeMode`/`initTheme`, which apply the theme before the
  first paint. Reuse it; do not fork a variant into an app. The `design` app
  renders those tokens and patterns, so a change to either shows up there.
- Anything visual, motion or keyboard-related is a contract with a test behind
  it: contrast, reduced motion, the print path, the grid's roving focus, focus
  rings, the skip link, `aria` names. Read the relevant test before changing the
  markup, and add to it when you change the contract.
- The site is installable and offline-capable: the shared service worker, the
  per-app manifest, and the branded 404 all live in shared code and are covered
  by `shared/tests/sw.test.ts`.
- The Crimson Desert editor never uploads a save and keeps its engine on the
  main thread, yielding through a `setTimeout` macrotask (ADR-0001, ADR-0003).
  Do not move work into a worker or add a server round-trip.

---

## 6. Dependencies

- `bun add` / `bun add -d`, then let the lockfile change be part of the change
  that needed it.
- **FORBIDDEN**: folding an unexplained `bun.lock`, manifest or checksum diff
  into a change. If a dependency moved and no upgrade was run, that is a finding
  to surface and leave exactly where it is — it is an unreviewed bump wearing
  someone else's message.
- The same applies to a behaviour change that follows from a fix: when a default
  becomes generated, every consumer of that default changes too, and the
  consumers are part of the fix.

---

## 7. Verification

```bash
bun run check     # the gate: clean, Deno fmt, Oxlint, Biome, tsc, bun test
bun test          # the suites on their own
bun run build     # the real production build, per environment
```

- Target **0 errors, 0 warnings**. `check` runs tsc (`bun run lint`), so
  `noUnusedLocals`, `noUnusedParameters` and `noUncheckedIndexedAccess` are
  enforced; CI runs `bun install --frozen-lockfile`, `bun run lint`,
  `bun run test`, `bun run build`, so a forgotten lockfile update, a type error,
  a failing test and a broken build are each a separate red.
- **`bun run check` is the source of truth and it rewrites files** — Deno fmt
  with `--use-tabs`, Oxlint with `--fix`, Biome with `--write --unsafe`. It may
  reformat files unrelated to the change you were asked for. Accept the output
  and keep it; do not hand-edit formatting to a personal preference and do not
  discard a formatter's work. The tree is kept at the tools' canonical
  formatting on purpose.
- **Fix real problems by changing the code.** Suppressions are bounded by §3 and
  are not a route to a green gate.
- **The gate does not replace reading the code.** `tsc`, `biome` and `bun test`
  are all silent about a _stale read_ — a value read outside render that only
  stays fresh because of a read render used to do. Such a bug typechecks, lints
  and passes every suite while being plainly broken at runtime. So is the
  reverse: a test that passes because it reads what the code writes.

---

## 8. How the Work Is Done

Sections 2–7 say what the code must be. This one says how a change is arrived
at, because the distance between a correct change and a plausible one is
invisible in the diff. It is written from failures that actually happened here.

### Establish the baseline before changing anything

Run the gate and record what it **already** reports, before the first edit. A
finding that was there beforehand was not caused by this change, and telling
those two apart is what decides whether the work is finished.

### A green run once is not a green run

Re-run a suite that passed before believing it — green once and red one time in
five is a defect wearing a pass. A flaky test is a broken test, and the usual
cause is the test contending with the code it is meant to observe: one recorded
failure hit ~40 % of runs by reading from a channel the code under test was
draining at the same moment. **FORBIDDEN**: reporting a suite as passing on the
strength of a single run.

### A finding is a cause, not an obstacle

Read what the rule protects, decide whether it is right, and fix the code when
it is. Silencing anything is a gate that lies (§3).

### Reasoned is not observed

Say which conclusions were observed and which were reasoned. "Fixed: the row
kept the browser's default background because the project ships no reset" and
"fixed, and I watched it render" are different claims, and the second is the one
worth much. Name the unverified thing in the same breath as the fix — a browser
that was never opened, a locale never loaded, a layout reasoned from the cascade
but never looked at. **FORBIDDEN**: describing a change as working when the
evidence is a typechecker.

### Prove it end to end, then say so

Drive the thing, not just compile it. A save round-trip, a keyboard flow, the
offline service worker, a production build, the 404. Start it, watch it answer.
Most defects worth finding in this codebase are not type errors: a value that is
stale, a prop that is inverted, a request refused for a reason nobody can see.

### Read the script before running it

Open `rsbuild.config.ts`, the build scripts and `deploy` and read what they do
before running them — `bun run check` starts with a `rm -rf dist out build`, and
`deploy` publishes the result. **FORBIDDEN**: running a destructive or
publishing step because it is a step in a script whose earlier steps are wanted.

### Carry the method, not the style

What travels between repositories is the method — the baseline, the re-run, the
distinction between reasoned and observed — and never the formatting or the
conventions. A change lands in _this_ repository, and these rules govern the
result even where they differ from the habits it arrived with.

---

## 9. British English in Everything We Ship

- **REQUIRED**: British spelling in every string a person reads — JSX text,
  `title`/`label`/`description`/`message`/`placeholder`/`aria-label`, validation
  and error messages, toast and status text, log lines, the README and this
  document — and in the names that carry them (`colour`, `centre`, `honour`,
  `favourite`).
- **FORBIDDEN** in that same set: `color`, `behavior`, `optimize`, `analyze`,
  `center`, `favorite`, `artifact`, `traveled`, `labeled`, `modeled`,
  `organize`, `visualize`, `utilize`.
- British English keeps the doubled consonant: `cancelled`, `cancellation`,
  `modelling`, `travelled`, `labelled` are already correct and must not be
  shortened.
- **EXEMPT**: a name that is a contract rather than prose — Mantine and Leaflet
  props (`color`, `textAlign: "center"`), CSS custom properties and colour
  keywords, third-party API names, generated catalog keys and fixture data.
  Renaming one of those is a migration, not a spelling fix; only the text a
  reader sees changes.

---

## 10. Repository Hygiene

- When searching with a grep or a file tool, keep `node_modules` and every
  gitignored path out of the results. A match inside a dependency is not a match
  in this codebase — and the same applies to a linter run outside
  `bun run check`.
- Keep `deno.json` and `biome.jsonc` exclusions intact when adding bulk data
  (`src/spooners/data`, the generated catalogs and image archives): they are
  there so a formatter cannot rewrite a multi-megabyte payload.
- Never edit a file another app's build depends on "just for this case". A
  change in `src/shared/` is a change to every app on the site.
