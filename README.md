# Hiyori (日和手帳)

> **A minimalist, offline-ready travel companion and field notebook for independent explorers.**

Hiyori is designed for travelers who want effortless, visual itinerary planning without bloated interfaces, subscription paywalls, or cluttered ads. Inspired by traditional Japanese travel handbooks (*Tabi no Shiori*), it keeps your daily schedules, interactive route maps, live weather forecasts, and expense records organized in one pocket-sized companion.

---

## Key Features

* 🗺️ **Visual Itinerary & Map Route**: Interactive timeline with OpenStreetMap routes, custom day themes, and one-tap deep navigation to Google Maps.
* 🚶 **Live Travel Companion**: Real-time GPS and destination weather forecasts, distance-to-next-stop tracking, and daily highlight notes.
* 📊 **Smart Expense Tracker & Receipts**: Multi-currency budget tracking, category breakdown charts, and built-in photo receipt storage.
* 🎒 **Packing Checklist & Field Notes**: Essential packing lists, travel scratchpad, emergency SOS contacts, and Markdown notes.
* 📄 **Printable Field Guidebook (PDF)**: Export an A4 printer-friendly pocket booklet with complete timelines, ticket checklists, and emergency info.
* ☁️ **Cloud Sync & Offline-First**: Instant real-time multi-device sync via Google Sign-In (Firebase), paired with 100% offline local caching and PWA installation.

---

## Quick Start

### Prerequisites
* Node.js 20+
* npm or bun

### Local Development
```bash
# Clone the repository
git clone https://github.com/noworneverev/hiyori-trip.git
cd hiyori-trip

# Install dependencies
npm install

# Start local development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
# Build static production assets
npm run build

# Preview production build locally
npm run preview
```

---

## Deployment (GitHub Pages)

This project is a static Single Page Application (SPA) configured for automated deployment via **GitHub Actions**.

1. Fork or clone this repository.
2. Go to repository **Settings** ➔ **Pages** ➔ Set **Source** to **GitHub Actions**.
3. Push changes to the `main` branch. GitHub Actions will automatically compile and deploy your site to `https://<your-username>.github.io/<repo-name>/`.

---

## Tech Stack

* **Frontend**: React 19, TypeScript, Vite
* **Styling**: Tailwind CSS v4
* **Mapping**: Leaflet, OpenStreetMap
* **Charts**: Recharts
* **Backend & Sync**: Firebase Authentication & Cloud Firestore
* **PWA & Offline**: Vite PWA Plugin, Service Worker, LocalStorage cache

---

## License

MIT License © 2026 Hiyori Itinerary Project.
