# 🚀 chneau.github.io

A collection of interactive web applications, data visualizations, and
client-side tools built and hosted on GitHub Pages. Every app shares one Mantine
design system, a common header/navigation, light & dark themes, and keyboard
navigation.

🔗 **Live Site**: [chneau.github.io](https://chneau.github.io)

---

## 📦 Applications

### 🏠 [Dashboard](https://chneau.github.io/)

The hub that links every app, with launch hotkeys (`1`–`6`), `T` to toggle the
theme, and `?` for the shortcut reference.

### 1. 📄 [Curriculum Vitae](https://chneau.github.io/cv/)

A print-friendly CV with light & dark themes and downloadable PDF/DOCX versions.

### 2. 🎂 [Birthday Tracker](https://chneau.github.io/birthday/)

A feature-rich birthday and anniversary tracker with deep statistical insights,
planetary ages, and calendar integration.

- **Automated Calculations**: Age, upcoming birthdays, days remaining, Western &
  Chinese zodiac signs, birthstones, and numerology life paths.
- **Life Statistics & Biorhythms**: 30-day biorhythm cycles, heartbeats,
  breaths, and cosmic distance traveled.
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
  equipment refinements, unlock sockets, and customize dyes.
- **Character Progression & Quests**: Manage level, bond experience, skill
  unlocks, quest completions, and companion rosters.

### 5. 🍺 [Spooners](https://chneau.github.io/spooners/)

See what every pub charges for the same drink or dish — a searchable map,
cheapest-to-dearest rankings, and price distribution charts.

### 6. 🎨 [Design System](https://chneau.github.io/design/)

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
  footer, keyboard-shortcut dialog, …)
- **Code Quality**: [Biome](https://biomejs.dev/), [Oxlint](https://oxc.rs/),
  [Deno fmt](https://deno.land/), [TypeScript](https://www.typescriptlang.org/)

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
bun run start:crimson-desert-save-editor
bun run start:spooners
bun run start:design
```

### Testing & Verification

```bash
bun test         # Unit tests (Crimson Desert save engine)
bun run check    # Deno fmt, Oxlint, Biome, unused-export check, and tsc
```

### Production Build & Deployment

```bash
bun run build    # Builds all seven apps into dist/
bun run deploy   # Builds and publishes to GitHub Pages (master branch)
```

---

## ⌨️ Keyboard Shortcuts

Press `?` anywhere to see the shortcuts for the current app. Globally, `1`–`6`
launch apps from the dashboard, `T` toggles the theme, and `Esc` closes the top
panel or returns to the dashboard.

---

## 📄 License

MIT © [chneau](https://github.com/chneau)
