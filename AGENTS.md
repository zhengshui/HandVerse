# Repository Guidelines

This repository contains two browser-based gesture demos built with vanilla JavaScript, WebGL, and MediaPipe Hands. The entry points are static HTML files that pull JS/CSS from `assets/` and CDN scripts.

## Project Structure & Module Organization
- `cyberpunk.html` and `neon-gesture.html` are the main entry pages.
- `assets/cyberpunk-particle/` holds the cyberpunk demo: `main.js`, module files in `assets/cyberpunk-particle/js/`, and `styles.css`.
- `assets/neon-gesture-flux/` holds the neon demo: `main.js`, module files in `assets/neon-gesture-flux/js/`, and `styles.css`.
- Shared media lives in `assets/` (e.g., `assets/laser.mp3`, `assets/scanlines.svg`, `assets/holo-grid.svg`).

## Build, Test, and Development Commands
There is no build step or package manager in this repo. Serve the files locally so camera access works:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173/cyberpunk.html` or `http://localhost:5173/neon-gesture.html`.

## Coding Style & Naming Conventions
- Use 2-space indentation, semicolons, and double quotes in JS to match existing files.
- Prefer `const` for configuration values (see `assets/cyberpunk-particle/js/config.js`).
- Keep modules as ES modules (`import`/`export`) under `assets/**/js/`.
- File names use kebab-case (e.g., `audio-ar.js`, `text-system.js`).

## Testing Guidelines
There are no automated tests. Manually verify:
- The page loads without console errors.
- Camera permission prompts appear and hand tracking activates.
- Visual effects update for at least one gesture sequence.

## Commit & Pull Request Guidelines
Git history only includes `init`, so there is no established convention. Use short, imperative subjects and add a scope when helpful, for example: `neon: tune gesture thresholds`.
For PRs, include a brief description, the entry page you tested, and a screenshot or short capture for visual changes.

## Security & Configuration Tips
- Hand tracking requires camera access, which only works on `https` or `localhost`.
- MediaPipe, Tailwind, and fonts are loaded from CDNs; offline use requires local copies.
