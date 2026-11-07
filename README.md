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

## Android app (APK)

Download the latest APK on your phone:
**https://github.com/grandddlc-tech/films/releases/latest/download/FilmEnglish.apk**

Every push builds a new APK with GitHub Actions (`.github/workflows/android.yml`) and publishes it as a release.
The app is a WebView wrapper around the same web app (`android/`), plus native extras: a notification
when the 30-minute timer ends (even with the app closed) and backups saved to the Downloads folder.
APKs are signed with the committed key `android/app/filmenglish.jks`, so new versions install over old ones.

## Run in a browser

Open `index.html` through any static server, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or enable **GitHub Pages** (Settings → Pages → Source: GitHub Actions); the included workflow deploys the app.
