# 🚀 chneau.github.io

A collection of interactive web applications, data visualisations, and
client-side tools built and hosted on GitHub Pages. Every app shares one Mantine
design system, a common header/navigation, light & dark themes, and keyboard
navigation.

🔗 **Live Site**: [chneau.github.io](https://chneau.github.io)

---

## 📦 Applications

### 🏠 [Dashboard](https://chneau.github.io/)

The hub that links every app, rebuilt around fast discovery and personalisation.

- **Inline Search**: Press `/` to focus the search field; fuzzy matching
  (Fuse.js) covers titles, tags, categories, and descriptions. `Enter` opens the
  first result and `Esc` clears the query.
- **Category Filters**: Chips filter the grid by app category (`All`, plus the
  `Personal`, `Play`, and `Build` groups).
- **Pinned Apps**: Pin or unpin any card to keep favourites in a dedicated
  section at the top.
- **Recently Opened**: The last few apps you visited appear in a compact chip
  strip, persisted per browser.
- **"Surprise me"**: A shuffle button (and command-palette action) that opens a
  random app.
- **Live Greeting & Clock**: A time-aware greeting with the current date, plus
  app-count, privacy, and last-build stats.
- **Shared `AppCard`**: One card component renders every grid — pinned, recent,
  search results, and all apps — with roving arrow-key focus.
- **Privacy Control**: A footer switch (and palette action) opts analytics in or
  out at any time; Do Not Track and Global Privacy Control are honoured.

Launch hotkeys (`1`–`6` and `7`, plus letters on the save editors), `T` to
toggle the theme, and `?` for the shortcut reference all still work.

### 1. 📄 [Curriculum Vitae](https://chneau.github.io/cv/)

A print-friendly CV with light & dark themes and downloadable PDF/DOCX versions.

### 2. 🎂 [Birthday Tracker](https://chneau.github.io/birthday/)

A feature-rich birthday and anniversary tracker with deep statistical insights,
planetary ages, and calendar integration.

- **Automated Calculations**: Age, upcoming birthdays, days remaining, Western &
  Chinese zodiac signs, birthstones, and numerology life paths.
- **Life Statistics & Biorhythms**: 30-day biorhythm cycles, heartbeats,
  breaths, and cosmic distance travelled.
- **Milestone Tracking**: Milestone birthdays and wedding anniversaries.
- **Visual Analytics**: Charts for age distribution, gender breakdown, birth
  heatmaps, and generations.
- **Calendar & Weather Integration**: iCal/Google Calendar (`.ics`) feed and
  weather forecasts via `wttr.in`.
- **PWA & Offline Ready**: Service worker, local storage, multi-language support
  (English, French, Spanish, German, Scottish Gaelic, and more), and desktop
  notifications.

### 3. 🚆 [A Day in Scottish Rail](https://chneau.github.io/scotland-rail/)

An interactive 24-hour time-lapse train replay across Scotland's rail network.

- **High-Performance Canvas Simulation**: Smooth Catmull-Rom spline
  interpolation rendering hundreds of active passenger and freight trains.
- **Interactive Timetable & Calling Points**: Live status, dwell monitoring,
  route progression, and timeline scrubbing.
- **Spatial Audio & Sound Effects**: Dynamic audio engine with ambient railway
  effects.
- **Analytics & Fleet Statistics**: Cruising trains, total distance, fleet speed
  records, and category breakdown.

### 4. ⚔️ [Crimson Desert Save Editor](https://chneau.github.io/crimson-desert-save-editor/)

A 100% client-side, privacy-focused save editor for _Crimson Desert_.

- **Client-Side Binary Engine**: Parses and modifies binary PARC save containers
  in the browser using typed arrays and WebCrypto.
- **Zero Server Uploads**: Your save files never leave your machine.
- **Inventory & Equipment**: Add catalog items, edit stack counts, tune
  equipment refinements, unlock sockets, and customise dyes.
- **Character Progression & Quests**: Manage level, bond experience, skill
  unlocks, quest completions, and companion rosters.

### 5. 💾 [Save Editors](https://chneau.github.io/#main)

Seven client-side save editors, one per game. Each is a decoder written for that
format and nothing else: your file is parsed in the tab, changes are staged
rather than applied, and a rebuilt file is decoded again and compared against
what you asked for before it is handed over. A rebuild that does not read back
is never offered.

| App                                                                                    | Format                      |
| -------------------------------------------------------------------------------------- | --------------------------- |
| [Crimson Desert](https://chneau.github.io/crimson-desert-save-editor/)                 | ChaCha20 + HMAC + PARC      |
| [Power Fantasy](https://chneau.github.io/power-fantasy-save-editor/)                   | PBKDF2 + AES-128-CBC        |
| [No Rest for the Wicked](https://chneau.github.io/no-rest-for-the-wicked-save-editor/) | CERIMAL, xxHash64           |
| [DYSMANTLE](https://chneau.github.io/dysmantle-save-editor/)                           | 10TONS container, zlib, XML |
| [Cyberpunk 2077](https://chneau.github.io/cyberpunk-2077-save-editor/)                 | VASC, LZ4, REDengine 4      |
| [Deadly Days Roadtrip](https://chneau.github.io/deadly-days-roadtrip-save-editor/)     | GVAS (Unreal Engine 5)      |
| [Tails of Iron 2](https://chneau.github.io/tails-of-iron-2-save-editor/)               | UTF-8, XOR 0x81             |
| [Witcher 3](https://chneau.github.io/witcher-3-save-editor/)                           | SNFH/FZLC, LZ4, SAV3, REDkit |

They share one workbench, one inspector and one edit model (`src/shared/save/`);
a game contributes its format and its quick actions and nothing else.

The Witcher 3 editor is the one that writes: it decodes the `SNFH`/`FZLC` LZ4
container, the `SAV3` stream and the REDkit token stream, then overwrites
money, level, difficulty, skill points, experience and per-item quantities
**in place** and rebuilds the file. A `.sav` carries no checksum, so a
width-preserving edit needs none recomputed — but changing a field's width would,
so the edits that resize the stream (appending an item record, filling in absent
mutation fields) are the narrow exceptions, each justified in its own module.
Adding a *skill* remains out of reach by design
(`src/witcher-3-save-editor/docs/adr/0007-only-width-preserving-edits.md`).

Its inventory reader is **build-agnostic**: each game's item records carry a
different four-byte tag pair, and it is recovered from the save rather than
hardcoded, so a save from an earlier patch of the game reads as fully as the
latest one. Durability is read from the same records rather than filtering them
out, which is what recovering those 27% of records restored.

It is also the most-readable save here, because a Witcher 3 `.sav` turns out to
hold a great deal that is decodable but **not writable**: resistances, base
stats, the whole experience curve, per-quest step detail, books read and
schematics collected, map-pin discovery, world-entity flags, pending scene
dialogs, and the NPC attitude matrix. All of it is projected read-only, and each
module states in its header what it deliberately does *not* claim — that a save
contains no dialogue graph at all, that the four core attributes (Might,
Agility, Sign Power, Courage) sit in an undecoded engine-native struct, and that
the `immortalityFlags` bit meanings are not recoverable from the game's scripts.

Two of those refusals are load-bearing rather than modesty:

- **Quest completion is read from two sources, because they disagree.** The
  fact-name heuristic and the game's own journal disagree on about a quarter of
  comparable quests, always the same way — the journal records success and the
  heuristic says in progress. The journal is authoritative, so the heuristic's
  field is named `inferredState` and the summary reports how many comparable
  quests the two disagree on rather than leaving a reader to pick. The journal's
  per-quest answer is stored once, in `journal.quests[]`; a copy on each quest row
  was two fields over one fact, and editing one made the summary's own two rows
  contradict each other. It is still a *partial* view: 17 of 43 quests on one
  fixture have no journal entry at all, and 935 of 972 entries cannot be
  attributed to a quest — 650 whose head resource is empty, 285 whose resource
  names a `.journal` container that is not a quest. (This said "650 of 972",
  which is only the empty-resource class and understates the unattributable
  fraction by about 30%.) Both counts are in the document rather than glossed
  over.
- **Enum values resolve through each save's own `MANU` table, never by ordinal.**
  The same resistance is index 90 on one build and 240 on another, so an ordinal
  lookup would name most of them wrongly on one of the two.

### 6. 🍺 [Spooners](https://chneau.github.io/spooners/)

See what every pub charges for the same drink or dish — a searchable map,
cheapest-to-dearest rankings, and price distribution charts.

### 7. 🎨 [Design System](https://chneau.github.io/design/)

The shared tokens, components, and patterns behind every app on this site.

---

## 🛠️ Tech Stack & Architecture

- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Bundler & Build Tool**: [Rsbuild](https://rsbuild.dev/) (multi-environment
  MPA architecture — one app per environment)
- **UI & Components**: [React 19](https://react.dev/),
  [Mantine v9](https://mantine.dev/), [Lucide Icons](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/) and
  [Mantine Charts](https://mantine.dev/charts/getting-started/)
- **State Management**: [Valtio](https://valtio.pmnd.rs/) (proxy-based reactive
  state) and [TanStack Query](https://tanstack.com/query)
- **Maps**: [Leaflet](https://leafletjs.com/) / React-Leaflet
- **Data & Utilities**: [Zod](https://zod.dev/), [Day.js](https://day.js.org/),
  [Fuse.js](https://www.fusejs.io/), [es-toolkit](https://es-toolkit.dev/)
- **Shared design system**: `src/shared/` holds the tokens, theme factory,
  header/app-switcher, and reusable primitives (buttons, stats, empty states,
  footer, keyboard-shortcut dialog, the `AppCard` tile, …)
- **Shared State Layer**: `src/shared/hooks/` provides `usePersistentState`
  (localStorage-backed with cross-tab sync and SSR/blocked-storage fallbacks)
  and `useThemeMode` + `initTheme` (light/dark/auto modes applied before the
  first paint). The dashboard's recents and pinned apps (`useRecents`,
  `usePinnedApps` in `src/shared/recent.ts`) are built on it.
- **Code Quality**: [Biome](https://biomejs.dev/) (formatter and linter),
  [Oxlint](https://oxc.rs/), [TypeScript](https://www.typescriptlang.org/)

---

## 💻 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) $\ge$ 1.2

### Installation

```bash
git clone https://github.com/chneau/chneau.github.io.git
cd chneau.github.io
bun install
```

### Development

Start the unified local development server serving all apps at
`http://localhost:3000`:

```bash
bun start
```

Or run an isolated app environment:

```bash
bun run start:cv
bun run start:birthday
bun run start:scotland-rail
bun run start:spooners
bun run start:design
bun run start:crimson-desert-save-editor
bun run start:power-fantasy-save-editor
bun run start:no-rest-for-the-wicked-save-editor
bun run start:dysmantle-save-editor
bun run start:cyberpunk-2077-save-editor
bun run start:deadly-days-roadtrip-save-editor
bun run start:tails-of-iron-2-save-editor
bun run start:witcher-3-save-editor
```

### Testing & Verification

```bash
bun test         # The whole suite (~1450 tests). Not run by `bun run check` — nothing runs it for you.
bun run check    # Oxlint, Biome, unused-export check, and tsc. Rewrites files.
```

### Production Build & Deployment

```bash
bun run build    # Builds every environment into dist/ (one per APP_META row)
bun run deploy   # Builds and publishes to GitHub Pages (master branch)
```

---

## ⌨️ Keyboard Shortcuts

Press `?` anywhere to see the shortcuts for the current app.

| Shortcut     | Action                                                            |
| ------------ | ----------------------------------------------------------------- |
| `/`          | Focus the dashboard search                                        |
| `Enter`      | Open the first search result                                      |
| `1`–`7`      | Launch an app from the dashboard                                  |
| `T`          | Toggle light / dark theme                                         |
| `?`          | Open the shortcut reference                                       |
| `⌘/Ctrl + K` | Open the command palette to jump to any app or run a quick action |

`Esc` closes the command palette or shortcut dialog, or clears the dashboard
search; arrow keys move focus across the dashboard card grid.

---

## 🛟 Resilience

Every app is installable (PWA manifest + theme colour) and registers a shared
service worker that serves an offline fallback when the network drops. Unknown
URLs render a branded 404 page linking back to the hub.

---

## 📄 License

MIT © [chneau](https://github.com/chneau)
