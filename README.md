# Mini Games 🌈

Play mini board games online with friends. First game: **Wavelength**.

## Run it

**Easiest:** double-click `Start Game.bat` — it starts the server and opens the game in your browser. Keep the black window open while playing. (A portable copy of Node is bundled in the `node/` folder, so nothing needs to be installed.)

Or, if you have Node.js installed:

```bash
npm install
npm start
```

Open http://localhost:3000, create a room, and share the 4-letter code.

- **Friends anywhere:** the server automatically opens a free public link (shown in the lobby and in the server window). Send it to your friends — the first time they open it, the page asks for a "tunnel password", which is also shown in the lobby. Set `TUNNEL=off` to disable.
- **Same wifi:** friends can also join at `http://<your-local-ip>:3000` (find it with `ipconfig` on Windows).
- **A permanent home:** for a real always-on site, deploy to a free host like [Render](https://render.com) or [Railway](https://railway.app) — see below.

## Deploy to Render (free) with your own domain

One-time setup, roughly 20 minutes:

1. **GitHub:** create an account at github.com if you don't have one. Create a new repository (e.g. `mini-games`), then push this folder to it. The easiest way without command-line git is [GitHub Desktop](https://desktop.github.com): File → Add local repository → choose this folder → Publish.
2. **Render:** sign up at render.com (you can log in with GitHub). Click New → Web Service → connect your `mini-games` repo. Render reads `render.yaml` and configures itself — pick the **Free** plan and deploy. You'll get a URL like `mini-games.onrender.com`; the game works there immediately.
3. **Your domain:** in the Render service, go to Settings → Custom Domains → add your domain. Render shows you a DNS record (usually a CNAME) — add it at the site where you bought the domain. After a few minutes your domain serves the game with HTTPS.

Notes: the free plan sleeps after ~15 min without visitors and takes up to a minute to wake — fine for game nights. Every time you push changes to GitHub, Render redeploys automatically. The tunnel/share-link feature disables itself automatically on Render.

## How to play Wavelength

Two teams, 2+ players each. Each round one player on the active team is the **psychic**:

1. The psychic sees a hidden target on a dial between two opposites (e.g. *Hot ↔ Cold*) and gives a one-line clue that "sits" at that spot.
2. Their team discusses and drags the dial to where they think the clue lands, then locks it in. Bullseye = 4 pts, close = 3 or 2.
3. If it's not a bullseye, the other team guesses whether the true target is **left or right** of the needle for 1 pt.
4. Teams alternate. First to 10 wins.

If someone disconnects, they can rejoin with the same name and room code.

## Project structure

```
server.js            rooms + Socket.IO transport (game-agnostic)
games/wavelength.js  all Wavelength rules, phases, scoring, card deck
public/index.html    the whole frontend (lobby, dial UI, phases)
test/e2e.js          simulates 4 players playing a full game — run: node test/e2e.js
```

## Adding the next game (e.g. Love Letter)

1. Create `games/loveletter.js` implementing: `canStart(room)`, `create(room)`, `handleAction(room, player, msg)`, `viewFor(room, player)` — `viewFor` is where you hide each player's hand from the others.
2. Register it in the `GAMES` map in `server.js`.
3. Add a game picker to the lobby and the game's UI to `public/index.html`.
