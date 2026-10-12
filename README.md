# 🍿 MovieMatch

A cozy, private, swipe-to-match movie & TV picker for two. Each of you swipes **No / Maybe / Yes** on the same deck of real titles (from TMDB), and MovieMatch reveals what you both want to watch.

- **Movie nights** – filter by type, genre, mood, runtime, decade, rating and your streaming services — or tap *Surprise us*. Decks are 10/20/30 titles, and you can deal more afterward.
- **Two ways to play** – *Pass & Play* on one phone (each person gets the deck in a different order, picks stay hidden until both finish) or *Two phones* with a 4‑letter room code and live progress.
- **Results** – Perfect matches (yes + yes) and possible matches (yes + maybe, maybe + maybe), Movie Roulette, save to watchlist, pick tonight’s movie.
- **Watchlist** – *Both want*, *Maybe later*, and *Saved* sections, movie/TV filter, roulette, or start a night from it.
- **Already watched** – timeline with individual star ratings for each of you. Watched titles are skipped in future nights unless you include rewatches.
- **History & Our Taste** – every night’s filters, votes and matches, plus agreement %, favorite genres, genre compatibility, “one loved it, one passed”, and rating gaps.
- **Discover** – search plus rails for trending, new releases, popular TV, classics, your services and recommendations based on what you both like. Titles you’ve rejected or watched stay hidden (reset any time in Settings).
- **Installable PWA** – add it to your home screen; both phones stay in sync live.

## How it works

One small Node server (Express + SQLite) serves the app, keeps your TMDB key private, stores your shared data, and pushes live updates to both phones (server‑sent events). There are no accounts — just two player profiles and an optional household passcode.

## Run it

Requires **Node 22.5+** and a free [TMDB API key](https://www.themoviedb.org/settings/api).

```bash
npm install
npm run build
TMDB_API_KEY=your_key APP_PASSCODE=something-secret npm start
# → http://localhost:8787
```

You can also leave `TMDB_API_KEY` unset and paste the key into the app’s setup screen. Data lives in `./data/moviematch.db` (set `DATA_DIR` to move it).

Development (hot reload on :5173, API on :8787):

```bash
npm run dev
npm test        # server unit tests
npm run typecheck
```

## Put it on your phones

The two phones need to reach the same server. Pick one:

1. **A computer at home + Tailscale** (simplest and private): run `npm start` on any always‑on machine, install [Tailscale](https://tailscale.com) on it and both phones, then open `http://<machine-name>:8787`. For “Add to Home Screen” to install as an app, use `tailscale serve 8787` to get an HTTPS URL.
2. **Docker** anywhere with a persistent volume:
   ```bash
   docker build -t moviematch .
   docker run -d -p 8787:8787 -v moviematch-data:/data \
     -e TMDB_API_KEY=your_key -e APP_PASSCODE=something-secret moviematch
   ```
3. **A small cloud host** (Fly.io, Railway, Render with a disk, etc.) using the Dockerfile. Mount a volume at `/data` so your history survives restarts, and set `APP_PASSCODE` since it’ll be on the internet.

Then on each phone open the URL → Share → **Add to Home Screen** (iOS Safari) or **Install app** (Android Chrome). The first phone runs setup (names, region, services); the second just picks “I’m …”.

## Configuration

| Variable | Purpose |
| --- | --- |
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | TMDB v3 key or v4 read token (or enter it in the app) |
| `APP_PASSCODE` | Optional passcode each phone enters once |
| `DATA_DIR` | Where the SQLite database is stored (default `./data`) |
| `PORT` | Server port (default `8787`) |

---

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch via TMDB.
