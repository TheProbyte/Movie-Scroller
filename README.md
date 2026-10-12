# 🍿 MovieMatch

A cozy, private, swipe-to-match movie & TV picker for two. Each of you swipes **No / Maybe / Yes** on the same deck of real titles (from TMDB), and MovieMatch reveals what you both want to watch.

- **Movie nights** – filter by type, genre, mood, runtime, decade, rating and your streaming services — or tap *Surprise us*. Decks are 10/20/30 titles, and you can deal more afterward.
- **Two ways to play** – *Pass & Play* on one phone (each person gets the deck in a different order, picks stay hidden until both finish) or *Two phones* with a 4‑letter room code and live progress.
- **Results** – Perfect matches (yes + yes) and possible matches (yes + maybe, maybe + maybe), Movie Roulette, save to watchlist, pick tonight’s movie.
- **Watchlist** – *Both want*, *Maybe later*, and *Saved* sections, movie/TV filter, roulette, or start a night from it.
- **Already watched** – timeline with individual star ratings for each of you. Watched titles are skipped in future nights unless you include rewatches.
- **History & Our Taste** – every night’s filters, votes and matches, plus agreement %, favorite genres, genre compatibility, “one loved it, one passed”, and rating gaps.
- **Discover** – search plus rails for trending, new releases, popular TV, classics, your services and recommendations. Titles you’ve rejected or watched stay hidden (reset any time in Settings).
- **Installable PWA** – add it to your home screen; both phones stay in sync.
- **Video-store style** – early-2000s glossy buttons, DVD-case covers, LED counters, sparkles, confetti and little synthesized sound effects (mute them in Settings or on the swipe screen).

## Put it online for free (Cloudflare)

MovieMatch runs on Cloudflare’s **free plan** — a Worker serves the app and a D1 database stores your watchlist, history and votes. Nothing needs to stay running on your computer, and no credit card is required.

You need: a free [Cloudflare account](https://dash.cloudflare.com/sign-up), a free [TMDB API key](https://www.themoviedb.org/settings/api), and [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run deploy
```

`npm run deploy` does everything: opens a browser to log in to Cloudflare, builds, deploys (creating the database the first time), and asks you for a household passcode and your TMDB key. When it finishes it prints your address, like `https://moviematch.<your-name>.workers.dev`.

Then on each phone open that address and **Add to Home Screen** (iPhone Safari: Share → Add to Home Screen; Android Chrome: menu → Install app). The first phone runs setup (names, region, streaming services); the second just taps “I’m …”.

To update after changing something, run `npm run deploy` again — your data stays put.

### Automatic updates (recommended)

Let Cloudflare redeploy by itself whenever new code lands on GitHub — no PC needed:

1. In the [Cloudflare dashboard](https://dash.cloudflare.com) open **Workers & Pages → moviematch → Settings → Build**.
2. Under **Git repository**, click **Connect** and pick your GitHub repo (authorize Cloudflare’s GitHub app if asked).
3. Set the **production branch** to the branch you deploy from, **build command** to `npm run build`, and leave the **deploy command** as `npx wrangler deploy`.
4. Save. Cloudflare doesn't build at connection time — it builds on the **next push** to that branch, then on every push after. (To trigger a build without changing code, open **Deployments → Retry build**, or push any commit.) Your database, passcode and TMDB key carry over automatically.

> **Windows tip:** if PowerShell says “running scripts is disabled”, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd run deploy`.

### Free-plan limits (plenty for two people)

Workers Free allows 100,000 requests/day, and D1 Free allows 5 million reads and 100,000 writes/day. A movie night uses a few hundred requests. Two phones left open stay well under the cap, because background tabs stop polling.

## Develop locally

```bash
npm run preview     # build, then run the Worker + local database on http://localhost:8787
npm run dev         # hot-reloading UI on :5173 with the Worker on :8787
npm test            # unit tests
npm run typecheck
```

Local secrets (optional) go in `.dev.vars` — see `.dev.vars.example`.

## How it works

- **Frontend:** React + Vite PWA served as static assets by the Worker.
- **Backend:** one Cloudflare Worker (Hono) under `/api`, which keeps your TMDB key private, caches titles, and stores everything in D1 (SQLite). Tables are created automatically on first request.
- **Syncing phones:** the apps poll every few seconds while a movie night is open (and every 20s elsewhere); no always-on connection is needed.
- **Privacy:** no accounts; an optional passcode (`APP_PASSCODE` secret) protects the whole app.

| Setting | Where |
| --- | --- |
| `APP_PASSCODE` | Worker secret (asked by `npm run deploy`) |
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | Worker secret, or paste it in the app’s setup screen |

---

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch via TMDB.
