# AGENTS.md

Agent guidance for **chneau.github.io** — a Bun + Rsbuild multi-page site: a
dashboard plus thirteen sub-apps sharing one Mantine design system. The
authoritative list is `APP_META` in `src/shared/app-meta.ts` — one row per app,
which drives the build environments, the dashboard, the manifests and the
hotkeys. Read it rather than counting apps here: this sentence said six and had
drifted twice without the prose noticing, which is the argument for pointing at
the table instead of restating it.

The rules below are what this codebase has already decided. Where they differ
from a habit carried in from another repository, this file wins.

---

## 0. Code Is the Source of Truth

The code — names, types and structure — is the only specification. There is
no prose beside it: no comment, no README, no `docs/` tree, no page explaining
what a module does. A second copy of the code is a copy that goes stale without
anything failing — the preamble above said "six apps" and had drifted twice
before anyone noticed, because prose is not typechecked — and this repository
has decided the copy is not worth its drift. This section governs the whole file
and is read first.

- **FORBIDDEN**: adding a comment — line, block, JSDoc, a section banner
  (`// ----`, `// ====`), an explanatory note in any language. If a comment feels
  necessary, the code is not explicit enough; change the code.
- **REQUIRED**: make the code explicit enough to be read without prose —
  descriptive names, single-purpose functions, precise domain types, and an app
  surface that exercises the claim.
- **FORBIDDEN**: tests. There is no test suite, no `*.test.ts` / `*.test.tsx`,
  no `tests/` directory and no `bun test` step. Do not recreate one. Behaviour is
  verified by running the app, the production build and the gate.
- **FORBIDDEN**: committing a `*.md` other than this handbook. There is no
  `README.md` and no `docs/` tree: a file like either is a finding to raise in
  your reply, never a file to add.
- **DELETED documentation stays deleted.** Material removed because it had
  drifted from the code is not to be recreated, in the same shape or a new one.
  The ADRs and the README that used to sit here are in git history; the claims
  they carried are re-derived from the code, not re-documented beside it.
- **ALLOWED**, and a closed list: the comments a toolchain consumes and nothing
  else can carry — `biome-ignore`, `@ts-expect-error` / `@ts-ignore` /
  `@ts-nocheck`, a narrowly scoped `react-doctor-disable-next-line` for a
  provable false positive (§7 bounds it), and a `#!` shebang. Keep them minimal,
  keep the reason the directive itself requires, and delete one that no longer
  bites.

Section 3 says which violations are worth a suppression line and which are worth
fixing. Everything else here is enforced by the gate in §1, or by reading.

---

## 1. Commands

| Command                | What it is                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `bun start`            | Dev server for every app at `localhost:3000`                                        |
| `bun run start:<app>`  | One app in isolation (`cv`, `birthday`, `design`, …)                                |
| `bun run check`        | **The gate** — clean, Oxlint, Biome, tsc                                            |
| `bun run check:fix`    | Formatters and linters only, no typecheck                                           |
| `bun run check:export` | `ts-unused-exports`, ad hoc — not part of `bun run check`                           |
| `bun x react-doctor`   | React correctness, a11y, performance and maintainability — the React gate           |
| `bun run build`        | Production build of all environments into `dist/`                                   |
| `bun run deploy`       | Build, then publish `dist/` to GitHub Pages                                         |

- **FORBIDDEN**: `npm`, `npx`, `yarn`, `pnpm`. **REQUIRED**: `bun`, `bun x`.
  Never invoke an npm command and never recommend one.
- `bun run check` runs its steps **in order and sequentially**, and it is the
  only invocation whose output means anything. Read the script before quoting a
  figure from a differently-configured run: the same `biome` run twice in one
  session reported 7 057 errors and then 5, because the second was the project's
  own `check:biome` and the first was not, and had walked into `node_modules`.
- **`check:biome` carries no timeout, deliberately.** It used to be
  `timeout 3s biome check --write --unsafe .`, which made a green `check`
  indistinguishable from a truncated one — a killed run exits non-zero, but
  `--write --unsafe` has already half-mutated the tree by then, and the failure
  reads as a lint error rather than a timeout. The whole tree checks in well
  under a second, so the cap bought nothing and cost the gate its meaning. Do
  not reintroduce one. A gate that can pass without running is worse than a slow
  gate.
- **Biome's `--write --unsafe` answers an unused `export` by prefixing `_`,**
  and under `noUnusedLocals` that trades one red gate for another. It rewrote
  five `export const readContainers`-shaped declarations to
  `const _readContainers`, which silences `noUnusedParameters` — not the rule
  that was actually firing — and left five `TS6133` errors behind. The `_`
  prefix is the wrong tool for a dead export: it hides the symbol from the next
  reader without removing it, where un-exporting removes the claim and keeps the
  code. **When `check:fix` leaves `tsc` red with `TS6133` on a symbol that was
  exported a moment ago, the formatter did that, not you** — restore the
  `export` (or drop it, if the symbol is genuinely dead) and re-run, rather than
  building a workaround on top of the underscore.
- **`check:oxlint` takes its ignore set from the repository-root `.gitignore`.**
  `oxlint --fix-dangerously` decides what not to rewrite by reading the
  `.gitignore` it finds at the git root, so a checkout that does not have that
  file — a partial checkout, an unpacked tarball, a directory outside the
  repository — has no `node_modules` in that set and rewrites dependencies in
  place, deleting a package's side-effecting initialisers so the build then
  fails for a reason no diff explains. Measured here: with no `.gitignore`,
  `oxlint --fix-dangerously .` lints `node_modules`; with one naming it, or
  with `--ignore-pattern node_modules`, it does not. `biome check --write` and
  `tsc` exclude `node_modules` themselves; `oxlint` alone does not. It is the
  one autofixing step here whose scope is not self-contained, so pass
  `--ignore-pattern node_modules` when it may run without the root
  `.gitignore`.
- **`check:fix` runs with `--no-exit-on-error`, which means "keep going after a
  failing step", not "hide it".** A failed step still makes the command exit
  non-zero; read the exit code and the output, and do not treat a `check:fix`
  run that reports a failure as a success because later steps ran.

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

## 3. Suppressions and Switched-Off Rules

§0 leaves one kind of comment standing: the directive the toolchain reads. That
makes a suppression the most expensive line in the tree, so this is where the
weight sits.

- A `biome-ignore lint/<group>/<rule>: <reason>` needs the reason. Each one in
  the tree names what the rule cannot see: the dashboard's arrow-key roving
  focus, the scrollable timeline's extra tab stop, the birthday canvas stub. An
  undocumented suppression is a bug, and a directive that no longer suppresses
  anything is deleted rather than left in place.
- A rule switched off in `biome.jsonc` has no comment left to say why, so its
  record is here.
  - `noImportantStyles` is off because the reduced-motion guard in `base.css`,
    the print rules in `cv.css` and the motion overrides in `Section.css` are
    only load-bearing under `!important`; 14 elements animated under
    `prefers-reduced-motion: reduce` without it and 0 with it, and printing
    within the first ~1.2 s produced a page with a name and nothing else. That
    has already bitten: a `biome check --write --unsafe` pass stripped all of it
    and the regressions came back silently. The stylesheets are the record —
    read them before touching either the rule or the files it protects.
  - `noSvgWithoutTitle` is off for `public/icons/**`. The rule is about an
    inline `<svg>` in a page, where a screen reader cannot otherwise name the
    graphic; these files are referenced as favicons and maskable icons and are
    never inlined into the DOM, so a `<title>` element would never be exposed to
    anyone, and adding one to satisfy the rule would be decorative. If you
    inline an icon, the rule's premise arrives with it and the override must go
    rather than the `<title>` be added.
- **FORBIDDEN**: silencing a finding to make the gate green. `noArrayIndexKey`
  is not pedantry — a key taken from a `.map()` index is reassigned when the
  list reorders, so React hands one element's state to another. Fix the code.
  The case that generalises: a rule about duplicate properties was once
  satisfied by moving the fallback into `@supports` rather than by deleting it.
  Both make the linter green; only one keeps the old browser working.

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
is fetched, i18next / react-i18next for the birthday app's seven locales — a
new key belongs in every locale file. Antd conventions from another repository
do not travel here; this is Mantine.

### Generated files are read-only

- `public/birthdays.ics` is written by `src/birthday/_genIcs.ts` at build time
  and by `birthday/ics.ts` in the browser, through the same generator, so the
  two always agree. Edit the generator, never the `.ics`.
- `src/crimson-desert-save-editor/lib/generated/*.json` and the save fixtures
  under `saves/` and `assets/image-archive/` are inputs to the engine, produced
  by `scripts/`. A hand edit is lost the next time they are
  produced and leaves the file agreeing with neither its source nor the engine.
- A rule the generated vocabulary cannot carry goes in a hand-written sibling
  module (`lib/add-plan.ts`, `lib/staged-projection.ts`), never inside the
  generated file.

---

## 5. Architecture

- One **Rsbuild environment per app**, declared in `rsbuild.config.ts` with its
  entry, HTML template, title, meta, icons and manifest. An environment that
  surfaces a build stamp declares `define: { BUILD_DATE }`; one that does not,
  must not — an unused define is dead config. Every environment is built from
  the one shared shell, `src/shared/template.html`, which is the only place
  `<html lang>` is declared: Rsbuild's built-in template has no `lang`, and the
  dashboard's runtime patch for it left the other thirteen documents without
  one. The birthday app writes `document.documentElement.lang` from `i18n.ts`,
  because it is the one document whose language changes.
- A new app means: its environment in `rsbuild.config.ts`, `start:<name>` and
  `build:<name>` scripts, an entry under `src/<name>/`, an `AppEntry` in
  `src/shared/apps.tsx` (which also drives the hotkeys, search, palette and
  404), its six-file `public/icons/<slug>-*` set (`.svg`, `-32`, `-192`,
  `-512`, `-maskable-512`, `-maskable.svg`, named from the `APP_META` slug and
  not generated by any script).
- **Two branches, deliberately different.** `src` is the source of record;
  `master` is the *publishing* branch, holding `dist/` because `deploy` writes
  it there. `git push origin HEAD:master` is always rejected — push to `src`.
- **`src/shared/`** holds the design system: `tokens.css`, the theme factory,
  header, app switcher, footer, command palette, `AppCard`, `EmptyState`,
  `Stat`, `SkipLink`, `SchemeToggle`, the shortcut reference, plus
  `usePersistentState` (localStorage with cross-tab sync and blocked-storage
  fallbacks) and `useThemeMode`/`initTheme`, which apply the theme before the
  first paint. Reuse it; do not fork a variant into an app. The `design` app
  renders those tokens and patterns, so a change to either shows up there.
  `base.css` also repoints Mantine's `--mantine-color-dimmed` at
  `--app-text-muted`, because Mantine's own value is 3.02:1 on `--app-bg`; that
  override is only sound while it names both schemes and `base.css` is imported
  after `@mantine/core/styles.css`.
- Anything visual, motion or keyboard-related is a contract: contrast, reduced
  motion, the print path, the grid's roving focus, focus rings, the skip link
  and `aria` names. Read the code that implements it and verify the surface in
  a browser before changing the markup.
- The site is installable and offline-capable: the shared service worker, the
  per-app manifest and the branded 404 all live in shared code.
- The Crimson Desert editor never uploads a save and keeps its engine on the
  main thread, yielding through a `setTimeout` macrotask. Do not move work into a
  worker or add a server round-trip.

### React: hooks, effects and identity

React 19, with `react-doctor` as the standing reviewer of the rules below.

- An effect declares every value it reads. A value that changes and is used
  inside an effect belongs in the dependency array; a value deliberately read
  once, because re-running on it would be wrong, is named for what it is
  (`useRef`, a ref guard) rather than left to a lint suppression.
- No effect that only derives state from props — compute it during render. An
  effect that fetches, subscribes, measures the DOM or writes to the browser is
  an effect; its cleanup returns.
- A key is derived from what the element **is** (`item.href`, an id), never from
  the `.map()` index. An index key is reassigned on reorder, so React hands one
  element's state to a different element — it typechecks, lints and passes.
- A callback or object passed to a child is stable, or the child is memoised
  deliberately and its props say why. An inline arrow in a hot list is a
  re-render on every parent tick.
- Long work yields rather than blocking, and the progress it produces is visible
  wherever the user has since gone — the indicator lives in shared chrome, not
  only on the page that started it.
- Rendering is a function of props and state; mutating a value that a render
  already read is the stale read §7 warns about, and no tool will catch it.

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
bun run check     # the gate: clean, Oxlint, Biome, tsc
bun run build     # the real production build, per environment
bun x react-doctor@latest   # the React gate: correctness, a11y, performance, maintainability
```

- Target **0 errors, 0 warnings**, and `Score: 100 / 100` from `react-doctor`.
  `check` runs tsc (`bun run lint`), so `noUnusedLocals`, `noUnusedParameters`
  and `noUncheckedIndexedAccess` are enforced.
- **There is no CI.** The GitHub Actions workflow has been removed, so nothing
  runs automatically on push or on a pull request. Every gate is run by hand.
  Before calling work finished:

  ```bash
  bun install --frozen-lockfile   # catches a forgotten lockfile update
  bun run check                   # style and types (rewrites files)
  bun run build                   # the real per-environment build
  ```
- **Two gates, neither optional, and neither a substitute for the other.**
  `check` is the style, typing and dead-code gate; `react-doctor` is the
  React-correctness gate, and this is a React 19 codebase, so a rule about a
  hook's dependencies, an effect that never re-runs, a re-render, an unstable
  callback or a missing key belongs to it. A change can pass one while failing
  the other. `react-doctor` is invoked ad hoc rather than wired into `check` —
  run it on anything touching a component before calling the work finished.
- **FORBIDDEN**: "fixing" a `react-doctor` finding by suppressing it. A
  `doctor.config.json`, a `reactDoctor` key in `package.json`, or an inline
  `react-doctor-disable-next-line` switches a rule off and fixes nothing; it
  hides the defect from the next reader. Refactor instead.
  The only acceptable suppression is a narrowly scoped one for a provable false
  positive, it carries a `biome-ignore`-style reason, and it needs a second pair
  of eyes — §3 governs.
- **`bun run check` is the source of truth and it rewrites files** — Oxlint with
  `--fix`, Biome with `--write --unsafe`. It may reformat files unrelated to the
  change you were asked for. Accept the output and keep it; do not hand-edit
  formatting to a personal preference and do not discard a formatter's work. The
  tree is kept at the tools' canonical formatting on purpose.
- **Biome is the only formatter. Do not reintroduce `deno fmt`.** The pipeline
  ran both, deno first, and they disagreed about 225 files: `deno fmt` rewrote
  every one and `biome check --write` then rewrote all 225 straight back, so the
  deno step was pure churn that doubled the cost of the gate and changed nothing.
  `check:ci` has always enforced Biome's formatting, which is why the tree is
  Biome-shaped. Every file deno wanted to touch — 124 `.ts`, 99 `.tsx`, one
  `.js`, one `.css` — is one Biome also formats; no extension made deno the only
  formatter. The `.zip` payload under
  `crimson-desert-save-editor/assets/image-archive/` that `deno.json` excluded
  is ignored by Biome outright, and the two bulk JSON paths are already excluded
  in `biome.jsonc`. `deno.json` and the `deno` devDependency went with the step.
- **Fix real problems by changing the code.** Suppressions are bounded by §3 and
  are not a route to a green gate.
- **A green component render is not a green page.** A component rendered into
  a detached container reports no layout, so a problem that needs computed
  styles or rendered text cannot appear: missing `<html lang>`, an `aria-label`
  that hides its own visible text, a heading order, a card colour below
  contrast. Run the **built pages** in a browser for anything touching markup,
  colour or headings, and say which pages were opened.
- **A change worth more than a typo gets a review round by fresh sub-agents.**
  Spawn reviewers created for the review, with no prior context on the change
  and nothing invested in it, rather than re-reading your own diff — the
  author's summary is not a review, and the agent that wrote the change is the
  worst-placed reader of it. Give each one a **distinct slice** so the round is
  not the same eyes twice (one on build paths, environments and the service
  worker; another on behaviour, state and the built page), point them at the
  diff, and ask for **defects with evidence** rather than confirmation that the
  change is correct. A review round does **not** replace the gates above: run
  `bun run check`, `bun run build` and `react-doctor` as well.
  **Record the outcome** — fix what it finds or answer it, since a silently
  ignored finding defeats the point of spawning the reviewers.
- **The gates do not replace reading the code.** `tsc`, `biome` and
  `react-doctor` are all silent about a _stale read_ — a value read outside
  render that only stays fresh because of a read render used to do. Such a bug
  typechecks, lints, passes the gate and scores 100 while being plainly broken
  at runtime. So is the reverse: a check that passes because it reads what the
  code writes.

---

## 8. How the Work Is Done

Sections 2–7 say what the code must be. This one says how a change is arrived
at, because the distance between a correct change and a plausible one is
invisible in the diff. It is written from failures that actually happened here.

### Establish the baseline before changing anything

Run the gate and record what it **already** reports, before the first edit. A
finding that was there beforehand was not caused by this change, and telling
those two apart is what decides whether the work is finished.

### A pass once is not a pass

Re-run the app and the gate before believing a result. A build that succeeded
once and failed one time in five is a defect wearing a pass; so is a page that
loaded correctly for the one path that was tried. **FORBIDDEN**: reporting a
surface as working on the strength of a single run.

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

### Git is the user's to drive

**FORBIDDEN**: staging or committing on your own initiative. `git add`,
`git commit`, `git push`, `git rebase` and a branch switch happen only when the
user asked for them in this conversation; otherwise a finished change is a
finished working tree, and the diff is what you report. A clean `bun run check`
and a green gate do not make a commit yours to make. When a commit *is*
asked for, keep it granular and well-described with a conventional prefix
(`feat:`, `fix:`, `chore:`, `refactor:`), and mind §5's two-branch rule — the
publishing branch is not the one to push to.

### Carry the method, not the style

What travels between repositories is the method — the baseline, the re-run, the
distinction between reasoned and observed — and never the formatting or the
conventions. A change lands in _this_ repository, and these rules govern the
result even where they differ from the habits it arrived with.

---

## 9. British English in Everything We Ship

- **REQUIRED**: British spelling in every string a person reads — JSX text,
  `title`/`label`/`description`/`message`/`placeholder`/`aria-label`, validation
  and error messages, toast and status text, log lines, and this document — and
  in the names that carry them (`colour`, `centre`, `honour`, `favourite`).
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
- Keep the `biome.jsonc` exclusions intact when adding bulk data
  (`src/spooners/data`, the generated catalogs and image archives): they are
  there so a formatter cannot rewrite a multi-megabyte payload.
- Never edit a file another app's build depends on "just for this case". A
  change in `src/shared/` is a change to every app on the site.
