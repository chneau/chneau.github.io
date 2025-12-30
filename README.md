# 🎂 Birthday Tracker

A modern, feature-rich birthday and anniversary tracking application built with React, Ant Design, and Valtio.

## ✨ Features

- **Automated Calculations**: Calculates age, next birthday, days remaining, zodiac signs (Western & Chinese), birthstones, and more.
- **Life Statistics**: View "Life Progress" metrics like total days, weeks, and months lived.
- **Milestone Alerts**: Special highlights for "big" birthdays (1, 10, 18, 21, 30, 50, etc.) and wedding anniversaries.
- **Visual Statistics**: Beautiful charts showing age distribution, zodiac signs, birth months, and generations.
- **Shareable Cards**: Generate and download personalized birthday cards for friends and family.
- **Calendar Integration**: Subscribe to your birthdays via `.ics` (iCal/Google Calendar) or download the file directly.
- **Smart Search**: Fuzzy searching powered by Fuse.js.
- **PWA Ready**: Installable as a mobile or desktop app with offline support.
- **Dark Mode**: Supports both light and dark themes.
- **Notifications**: Optional desktop notifications for today's and tomorrow's celebrations.

## 🚀 Tech Stack

- **Frontend**: [React 19](https://react.dev/)
- **UI Framework**: [Ant Design](https://ant.design/)
- **State Management**: [Valtio](https://valtio.pmnd.rs/)
- **Build Tool**: [Rsbuild](https://rsbuild.dev/)
- **Styling**: [Styled Components](https://styled-components.com/)
- **Data Validation**: [Zod](https://zod.dev/)
- **Charts**: [@ant-design/charts](https://charts.ant.design/)
- **Fuzzy Search**: [Fuse.js](https://www.fusejs.io/)
- **Date Handling**: [Day.js](https://day.js.org/)

## 🛠️ Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/chneau/chneau.github.io.git
   cd chneau.github.io
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Start the development server:
   ```bash
   bun start
   ```

### Building for Production

```bash
bun run build
```

## 📅 Adding Your Own Birthdays

To add or edit birthdays, modify the `src/birthdays.json` file. The format is:

```json
{
  "name": "John Doe",
  "date": "1990-01-01",
  "kind": "♂️"
}
```

- **name**: The name of the person.
- **date**: Birthday in `YYYY-MM-DD` format.
- **kind**: `♂️` (Boy), `♀️` (Girl), or `💒` (Wedding).
- **isWedding**: (Optional) Set to `true` for anniversaries to enable wedding-specific milestones.

## 📄 License

MIT © [chneau](https://github.com/chneau)
