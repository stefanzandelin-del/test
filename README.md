# Lawn Doctor 🌿

A mobile-friendly web app for diagnosing lawn problems and identifying weeds vs. desirable
plants in your flower beds. Take (or upload) a photo, and it uses Claude's vision model to
identify what you're looking at, then automatically runs a real web search for current,
authoritative removal/control guidance for that specific plant before suggesting a remedy.

## Features

- **Lawn Problem mode** — photograph a patch of lawn (bare spots, discoloration, weeds,
  fungus, pests) and get a likely diagnosis with organic and chemical remedy options,
  prevention tips, and timing advice.
- **Flower Bed ID mode** — photograph a plant growing among your flowers to find out if it's
  a weed/volunteer to remove or a plant worth keeping, plus a removal plan when applicable.
- **Grounded in real sources** — after identifying the plant, the app has Claude search the
  web (extension offices, master gardener programs, USDA/RHS, etc.) for how to actually get
  rid of that specific species, and shows the source links under each result rather than
  relying only on the model's memorized knowledge.
- **Camera or photo library** — works on phones (rear camera by default) and desktops.
- **History** — past scans are saved locally so you can track recurring problems.
- **Installable PWA** — "Add to Home Screen" for an app-like experience; works offline for
  the app shell (identification itself requires an internet connection).
- **Your data stays yours** — your Anthropic API key and scan history are stored only in
  your browser's local storage. Photos are sent directly from your browser to Anthropic's
  API to be analyzed; they are not sent to or stored on any other server.

## Setup

1. Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com/settings/keys).
2. Serve the `app/` folder with any static file server, for example:
   ```bash
   cd app
   python3 -m http.server 8080
   ```
   Then open `http://localhost:8080` in your browser (on your phone, use your computer's
   LAN IP instead of `localhost`, e.g. `http://192.168.1.23:8080`, so the camera works).
3. On first load you'll be prompted to enter your API key under the ⚙️ Settings menu. It's
   saved in your browser for next time.
4. Web search is on by default for most Anthropic accounts. If sources never show up, check
   Console → Settings → Capabilities to make sure web search is enabled for your
   organization/key (each scan uses up to 3 searches, which is billed alongside the normal
   per-token cost — see [Anthropic's pricing](https://claude.com/pricing) for current rates).
4. You can also deploy `app/` to any static host (GitHub Pages, Netlify, Vercel, Cloudflare
   Pages, etc.) since there is no backend server involved — the browser talks to Anthropic's
   API directly.

## Usage

1. Pick a mode: **Lawn Problem** or **Flower Bed ID**.
2. Take a photo (or choose one from your library). Get close enough that the leaf shape,
   growth pattern, and color are clearly visible.
3. Optionally add a note (e.g. "spreading fast", "appeared after the rain").
4. Tap **Identify & Suggest Remedy**.
5. Review the identification, confidence level, and remedy plan. Past results are saved
   under the **History** tab.

## Important notes

- Identifications and remedies are AI-generated suggestions, not a substitute for advice
  from a certified arborist, agronomist, or your local agricultural extension office.
- Always read and follow product labels for any chemical treatment, and keep pets/children
  away from treated areas as directed by the label.
- Some invasive or regulated plants have legal reporting/removal requirements that vary by
  region — check with your local extension office if you suspect one.

## Project structure

```
app/
├── index.html        # App shell / markup
├── css/styles.css     # Styling (light + dark mode)
├── js/
│   ├── storage.js     # LocalStorage helpers (settings + scan history)
│   ├── api.js          # Anthropic Messages API client
│   └── app.js           # UI wiring, camera capture, rendering
├── manifest.json      # PWA manifest
├── sw.js               # Service worker (app-shell offline caching)
└── icons/              # App icons
```

No build step or dependencies — it's plain HTML/CSS/JS.
