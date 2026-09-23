# 🚀 chneau.github.io

A collection of interactive web applications, data visualizations, and client-side tools built and hosted on GitHub Pages.

🔗 **Live Site**: [chneau.github.io](https://chneau.github.io)

---

## 📦 Applications

### 1. 🎂 [Birthday Tracker](https://chneau.github.io/birthday/)
A feature-rich birthday and anniversary tracker with deep statistical insights, planetary ages, and calendar integration.
- **Automated Calculations**: Computes age, upcoming birthdays, days remaining, Western & Chinese zodiac signs, birthstones, and numerology life paths.
- **Life Statistics & Biorhythms**: Visualizes 30-day biorhythm cycles (physical, emotional, intellectual), heartbeats, breaths, and cosmic distance traveled.
- **Milestone Tracking**: Highlights milestone birthdays and wedding anniversaries with personalized cards.
- **Visual Analytics**: Interactive Ant Design Charts for age distribution, gender breakdown, birth heatmaps, and generations.
- **Calendar & Weather Integration**: Live iCal/Google Calendar (`.ics`) subscription feed and real-time weather forecasts via `wttr.in`.
- **PWA & Offline Ready**: Local storage synchronization, multi-language support (English, Scottish Gaelic), and desktop notifications.

### 2. 🚆 [A Day in Scottish Rail](https://chneau.github.io/scotland-rail/)
An interactive 24-hour time-lapse train replay across Scotland's rail network.
- **High-Performance Canvas Simulation**: Smooth 60fps Catmull-Rom spline interpolation rendering hundreds of active passenger and freight trains.
- **Interactive Timetable & Calling Points**: Real-time live status, dwell monitoring, route progression, and timeline scrubbing.
- **Spatial Audio & Sound Effects**: Dynamic audio engine with ambient railway effects.
- **Analytics & Fleet Statistics**: Live tracking of cruising trains, total distance, fleet speed records, and category breakdown (ScotRail, LNER, Avanti, Caledonian Sleeper, Freight).

### 3. ⚔️ [Crimson Desert Save Editor](https://chneau.github.io/crimson-desert-save-editor/)
A 100% client-side, privacy-focused save editor for *Crimson Desert*.
- **Client-Side Binary Engine**: Parses and modifies binary PARC save containers directly in your browser using typed arrays and WebCrypto.
- **Zero Server Uploads**: Your save files never leave your machine.
- **Inventory & Equipment**: Add catalog items, edit stack counts, tune equipment refinements, unlock sockets, and customize dyes.
- **Character Progression & Quests**: Manage player level, bond experience, skill unlocks, quest completions, and companion rosters.

---

## 🛠️ Tech Stack & Architecture

- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Bundler & Build Tool**: [Rsbuild](https://rsbuild.dev/) (Multi-Environment MPA Architecture)
- **UI & Components**: [React 19](https://react.dev/), [Ant Design v6](https://ant.design/), [Mantine v9](https://mantine.dev/), [Lucide Icons](https://lucide.dev/)
- **State Management**: [Valtio](https://valtio.pmnd.rs/) (Proxy-based reactive state)
- **Data & Charts**: [@ant-design/charts](https://charts.ant.design/), [Zod](https://zod.dev/), [Day.js](https://day.js.org/), [Fuse.js](https://www.fusejs.io/)
- **Code Quality**: [Biome](https://biomejs.dev/), [Oxlint](https://oxc.rs/), [Deno fmt](https://deno.land/), [TypeScript](https://www.typescriptlang.org/)

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
Start the unified local development server serving all apps at `http://localhost:3000`:
```bash
bun start
```

Or run an isolated app environment:
```bash
bun run start:birthday
bun run start:scotland-rail
bun run start:crimson-desert-save-editor
```

### Testing & Verification
```bash
bun test         # Run unit and integration test suite (116 tests)
bun run check    # Run comprehensive linting, formatting, export, and type checks
```

### Production Build & Deployment
```bash
bun run build    # Builds all 4 apps concurrently into dist/ in ~3 seconds
bun run deploy   # Builds and publishes to GitHub Pages (master branch)
```

---

## 📄 License

MIT © [chneau](https://github.com/chneau)
