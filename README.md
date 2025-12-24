<h1 align="center">MapDraw</h1>

<div align="center">
  <strong>MapDraw is a small, client-side map drawing web app. Use it to sketch shapes, edit features and export the result as GeoJSON. The app is intentionally lightweight and runs entirely in the browser.</strong>
  <br/><br>
  <img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/GabrielProjects/MapDraw">
  <img alt="GitHub contributors" src="https://img.shields.io/github/contributors/GabrielProjects/MapDraw">


</div>

**🌐 Live Demo:** [https://gabrielprojects.github.io/MapDraw](https://gabrielprojects.github.io/MapDraw)  
**📦 Repository:** [https://github.com/GabrielProjects/MapDraw](https://github.com/GabrielProjects/MapDraw)

## What this repo contains

- `index.html` — application entry point and UI
- `style.css` — app styling
- `app.js` — main application logic (drawing, editing, export/import hooks)
- `colorpicker.js` — color picker helper/control used by the UI
- `drawn_map.geojson` — example GeoJSON exported from the app
- `icons/` — icon assets used by the UI
- `main.py` — auxiliary script (if present) — see note below

If any of these files are missing or named differently in your workspace, update the README or let me know and I will adapt it.

## Quick start

From the project root, you can either open `index.html` directly in a browser or run a tiny local server (recommended to avoid file:// limitations):

PowerShell (Windows):

```powershell
# serve current folder at http://localhost:8000 and open it in your default browser
python -m http.server 8000; Start-Process "http://localhost:8000"
```

Node/npm (if you want an npm-based option):

```powershell
# install once if needed
npm install -g http-server
# then run
http-server -c-1 . -p 8000
Start-Process "http://localhost:8000"
```

Open the app in a modern browser (Chrome/Edge/Firefox). The main UI provides tools to draw polygons/lines/points, pick colors and export GeoJSON.

## Tools and shortcuts

- Marker: place pins with labels — `M`
- Draw: freehand polyline with selected color/width — `D`
- Line: two-click straight segment (start → end) — `L`
- Circle: two-click circle (center → radius) with live preview — `C`
- Eraser: cut lines or remove markers — `E`

Notes:
- Circles are persisted in GeoJSON as a `Point` feature with properties `{ shape: "circle", radius: <meters>, color, weight }`. On import, they are reconstructed as Leaflet circles.
- Lines are persisted as standard `LineString` with style properties `{ color, weight }`.

## Typical workflow

1. Draw shapes using the provided tools in the UI.
2. Edit vertices or properties (if the UI exposes an attributes panel).
3. Export/save the result as GeoJSON (download or copy to clipboard). The sample file `drawn_map.geojson` demonstrates the output format.

## Development notes

- This is a client-side web app built with plain HTML/CSS/JS. No framework required.
- If you add new scripts or libraries, prefer adding them under a `vendor/` or `libs/` folder and reference them from `index.html`.
- If you want to implement a build step, I can add a minimal `package.json` and npm scripts.

## main.py

If `main.py` exists, it is not required to run the web UI. It may contain utility scripts (e.g., simple export helpers or conversion scripts). Open it to check its purpose — if you'd like, I can inspect and document it.

## Troubleshooting

- If icons or scripts don't load when opening `index.html` directly, use a local server (see Quick start).
- If exported GeoJSON looks invalid, validate it with https://geojsonlint.com/ or similar tools and report the file contents.

## Contributing and next steps

Small improvements that add value:

- Add an import/upload control to load arbitrary GeoJSON into the editor.
- Add an explicit export/download button (if missing) and a copy-to-clipboard option.
- Add a demo screenshot or short GIF and embed it in the README for quick visual onboarding.
- Provide sample GeoJSON examples in a `examples/` folder.
- Add a minimal `package.json` with an `npm start` script to run a static server.

If you'd like, I can implement any of the above. Tell me which item to do next — I can add a `package.json`, implement import/export UI in `app.js`, or create a screenshot and update the README.

---

If this README still doesn't match what you want, tell me specific items to include (project purpose, intended users, features to highlight, or developer setup) and I'll update it immediately.
>>>>>>> 7441dc6 (Modernize circle modal UI with refined styling and inline controls)
