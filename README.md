# PWA Template

> **These works are a personal project and in no way associated with my employer.**

## Purpose

PWA Template is a lightweight Progressive Web App shell that delivers the base installation experience, theme controls, and update surfaces for future personal finance tools.

## Features

- **Progressive Web App base** – Installable shell with offline caching managed by the service worker.
- **Custom Themes** – Toggle dark mode or choose alternate visual themes.
- **Update tools** – Check for service worker updates and review release notes from the built-in changelog.
- **Local reset** – Clear locally stored data with a single action during testing.

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

PWA Template is installable as a Progressive Web App (PWA):

1. The `manifest.webmanifest` file describes the app metadata and reuses the sidebar logo for install icons.
2. `service-worker.js` caches the core assets so the app can load offline after the first visit.
3. The `index.html` file registers the service worker and includes the manifest and icon references.

To install the app, open it in a supporting browser (Chrome, Edge, or mobile equivalents) and use the “Install”/“Add to Home Screen” option.

## Development Notes

- Styles are built with Tailwind CSS (CLI, v3). The source stylesheet is `src/styles.css` and the compiled output is `assets/styles.css`, which is checked into the repo so GitHub Pages can deploy without a build step.
- All application state is stored in `localStorage`. Clearing the browser storage resets the app to defaults.

### App Versioning

- The Settings page shows the current app version so users can reference it when sharing feedback.
- A pull request workflow (`.github/workflows/pr-version.yml`) bumps the semantic version by looking at existing `v*` tags (or the `VERSION_BASE` seed), updates `assets/version.json`, and stamps the service worker cache identifier so the change is committed alongside the rest of the PR.
- The Pages deployment workflow (`.github/workflows/static.yml`) reads the checked-in version, creates the matching `v*` tag and release on pushes to `main`, and prunes older releases to keep only the five most recent.
- The base major/minor version is sourced from `VERSION_BASE`; edit that file before opening a PR if you need to roll to a new major/minor series.
- The service worker cache is stamped with the release version so clients automatically pick up the newest assets without needing to clear site data.

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
