# TaskTrack

> **These works are a personal project and in no way associated with my employer.**

## Purpose

TaskTrack is a lightweight day planner that pairs a simple task list with a Pomodoro timer. It keeps everything on this device, so you can plan the day, run focused sessions, and review your weekly totals without syncing to a server.

## Features

- **Daily task planning** – Capture today's tasks with titles, optional descriptions, and planned vs. completed pomodoro counts.
- **Pomodoro timer** – Switch between Focus, Short break, and Long break modes with start/pause/reset controls and a gentle alarm.
- **Active task linking** – Pick an active task so completed focus sessions automatically increment the right counter.
- **Today & This week views** – Review today's progress and see planned vs. completed pomodoros for the last seven days.
- **Appearance controls** – Toggle dark mode or choose alternate visual themes.
- **Offline-first** – Installable as a PWA with cached assets and localStorage data scoped under the `time-tracker-pomodoro-v1` prefix.

## Getting Started

Serve the repository with any static HTTP server. All logic is client-side, so no backend is required. Using `file://` will prevent the service worker from registering, so prefer a local HTTP server.

```bash
# Example: using a simple Python web server
python -m http.server 8080

# or Node's serve (if installed):
npx serve -l 8080
```

Then visit `http://localhost:8080` in your browser.

## Progressive Web App

TaskTrack is installable as a Progressive Web App (PWA):

1. The `manifest.webmanifest` file describes the app metadata and reuses the sidebar logo for install icons.
2. `service-worker.js` caches the core assets so the app can load offline after the first visit.
3. The `index.html` file registers the service worker and includes the manifest and icon references.

To install the app, open it in a supporting browser (Chrome, Edge, or mobile equivalents) and use the “Install”/“Add to Home Screen” option.

## Development Notes

- Styles are built with Tailwind CSS (CLI, v3). The source stylesheet is `src/styles.css` and the compiled output is `assets/styles.css`, which is checked into the repo so GitHub Pages can deploy without a build step.
- All application state is stored in `localStorage` using namespaced keys (for example, `time-tracker-pomodoro-v1`). Clearing the browser storage for this prefix resets the app to defaults without touching other apps built from the same template.

### Rebuilding CSS

Prerequisite: Node.js 16+ and npm.

Install dependencies (first time only):

```bash
npm install
```

Build once:

```bash
npm run build:css
```

Watch for changes during development:

```bash
npm run watch:css
```

Notes:
- Edit styles in `src/styles.css` (uses `@tailwind`/`@layer`/`@apply`).
- Do not edit `assets/styles.css` by hand; it is generated.
- If you add new HTML/JS files that include Tailwind classes, update `tailwind.config.js` `content` globs so the classes are included in the build.
