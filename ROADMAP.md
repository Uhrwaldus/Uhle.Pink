# uhle.pink — Roadmap

> Note to Claude: if Casper starts a session about this project, remind him of this list!
> Repo: github.com/Uhrwaldus/Uhle.Pink · Server: Hetzner 167.233.93.124 (auto-deploys from main
> every 5 min when idle) · Live version badge: bottom-right corner / uhle.pink/version

## Next up (ranked by joy-per-effort)

1. **Join links + QR code** — `uhle.pink/ABCD` pre-fills the room code; lobby shows a QR
   so phone players scan instead of typing. Biggest onboarding win (Jackbox pattern).
2. **Tonight's tally** — cross-game session scoreboard in the lobby: wins per player across
   all games this evening. Maximum trash talk per line of code.
3. **Sounds + tab notifications** — ding + flashing tab title when it's your turn / vote
   needed / new round. Fixes the "alt-tabbed to Discord" problem.
4. **Danish word decks 🇩🇰** — language toggle for Undercover pairs, Just One words,
   Codenames grid.

## Later

- **Turn timers** — host-configurable countdown on describe/clue phases.
- **Avatars & colors** — emoji faces picked in lobby, shown on all pills/buttons.
- **Custom decks** — host pastes own word pairs / Wavelength spectrums (inside jokes!).
- **Spectator mode** — join mid-game as watcher instead of being blocked.
- **Drawing game** (skribbl.io style) — the big one: synced canvas, draw & guess.
- **Classic Werewolf** — multi-night version for 7+ players (One Night exists).
- **Codenames Pictures** — needs image assets.
- **Real card art** — the ll-card component takes images; replace emoji art when available.

## Done (for context)

12 games: Wavelength (teams + co-op with leaderboard), The Mind, Hanabi, Spyfall,
Love Letter (2019 edition), Coup, Codenames, One Night Werewolf, Just One,
The Resistance, Undercover. Dashboard lobby, side-panel references + logs, card faces,
leave-room + host handover, back-to-lobby, polite auto-deploy, no-cache serving,
version badge, /busy + /version endpoints.
