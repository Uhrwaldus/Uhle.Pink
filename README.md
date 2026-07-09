# Mini Games 🌈

Play mini board games online with friends. First game: **Wavelength** — live at [uhle.pink](https://uhle.pink).

## Run it locally

**Easiest (Windows):** double-click `Start Game.bat` — it starts the server and opens the game in your browser. Keep the black window open while playing. (Requires the portable `node/` folder, which is bundled in the Desktop copy but not in this repository.)

Or, with Node.js installed:

```bash
npm install
npm start
```

Open http://localhost:3000, create a room, and share the 4-letter code.

- **Friends anywhere (local server):** the server opens a free public link (shown in the lobby). The first time someone opens it, the page asks for a "tunnel password" — also shown in the lobby. Set `TUNNEL=off` to disable. Not needed on the hosted site.
- **Same wifi:** friends can also join at `http://<your-local-ip>:3000` (find it with `ipconfig`).

## How to play Wavelength

Each round one player is the **psychic**: they see a hidden target on a dial between two opposites (e.g. *Hot ↔ Cold*) and give a one-line clue that "sits" at that spot. Everyone else drags the dial to where they think the clue lands and locks it in. Bullseye = 4 pts, close = 3 or 2.

Before giving the clue, the psychic may **reroll the target once** and **swap the card once** per turn.

**⚔️ Teams mode** (2v2 or more): teams alternate guessing. If the guess isn't a bullseye, everyone on the other team votes whether the true target is **left or right** of the needle — majority wins +1 point, a 50/50 tie triggers a revote. First team to 10 wins.

**🤝 Co-op mode** (2+ players): everyone guesses together for 10, 20, or 30 turns. Pick a team name in the lobby — the best scores land on the **leaderboard**.

If someone disconnects, they can rejoin with the same name and room code.

## Deploy to Render (free) with your own domain

1. **GitHub:** put this repository on your GitHub account.
2. **Render:** sign up at render.com with GitHub. New → Web Service → connect the repo. Render reads `render.yaml` — pick the **Free** plan and deploy.
3. **Domain:** Render service → Settings → Custom Domains → add your domain, then create the DNS records it shows at your registrar.

Notes: the free plan sleeps after ~15 min without visitors and takes up to a minute to wake. Every push to GitHub redeploys automatically. The tunnel feature disables itself on Render. **Leaderboard caveat:** scores are saved to a JSON file, which Render's free tier wipes on every redeploy/restart — fine for a game night, but ask Claude to wire up a free database if you want scores to live forever.

## Project structure

```
server.js            rooms + Socket.IO transport + leaderboard (game-agnostic otherwise)
games/wavelength.js  all Wavelength rules: teams & co-op, phases, scoring, cards
public/index.html    the whole frontend (lobby, dial UI, phases, leaderboard)
test/e2e.js          simulates full games in both modes — run: npm test
```

## Adding the next game (e.g. Love Letter)

1. Create `games/loveletter.js` implementing: `canStart(room)`, `create(room)`, `handleAction(room, player, msg)`, `viewFor(room, player)` — `viewFor` is where you hide each player's hand from the others.
2. Register it in the `GAMES` map in `server.js`.
3. Add a game picker to the lobby and the game's UI to `public/index.html`.
