# Film English 🎬

A blood-red & black web app for learning English by watching films **30 minutes a day**.

- **Plan:** from Sunday 8 Nov 2026 to **29 Esfand 1405 (Sat 20 Mar 2027)**, the last day before Nowruz.
- **Session days:** Saturday, Monday, Wednesday, Friday — 76 sessions (38 hours).
- **Add a film by name:** the app searches online and fills in the poster/wallpaper, release year, country and runtime.
  - Default sources (no key needed): IMDb suggestions (poster, year) + Wikidata (country, runtime).
  - Optional: paste a free [TMDB](https://www.themoviedb.org/settings/api) API key in Settings for HD wallpapers.
- **30-minute timer** with an alarm, then log the minutes you watched and the **new words & expressions** you learned.
- The app remembers where you stopped ("resume at 0:30:00") and estimates when each film will be finished.
- **Tick ✓** a film when it's done and the next one in your queue becomes "Now watching".
- Words tab collects every note; export to `.txt`. Settings has backup export/import.

All data is stored in your browser (localStorage). Installable as a PWA (Add to Home Screen).

## Run

Open `index.html` through any static server, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or enable **GitHub Pages** (Settings → Pages → Source: GitHub Actions); the included workflow deploys the app.
