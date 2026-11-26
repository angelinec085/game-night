# Game Night With Friends — handoff

## What this project is

Game Night With Friends is a private multiplayer game site for friends, hosted on GitHub Pages. It currently has Card Auction and Life Path (a Three.js r128 game with a 2D fallback).

## Project rules

- Use plain HTML, CSS, and vanilla JavaScript only. No Node.js, npm, build tools, or app backend; the site must work on GitHub Pages.
- Multiplayer uses PeerJS/WebRTC. The host's browser is authoritative; guests send action intents and receive state updates.
- Never send hidden player information to other players. Card Auction hands stay private.
- Players use a nickname and an animal avatar; there are no accounts, photos, or microphones.
- All game art is procedural and original. Do not copy commercial characters, logos, or names.

## File map

- `index.html` — The one-page site, lobby markup, and ordered CDN/local script tags.
- `style.css` — Site, lobby, game, and responsive styles.
- `js/` — Browser JavaScript modules; no compilation step.
- `js/main.js` — Home and room screens, game picker, player lists, and the shared game lifecycle.
- `js/net.js` — PeerJS room creation/joining, host broadcasts, guest intents, and disconnect handling.
- `js/avatars.js` — The shared animal-avatar list and lookup helper.
- `js/games/` — Game implementations registered with the lobby.
- `js/games/card-auction.js` — Card Auction rules, private hands, rendering, and tie-breakers.
- `js/games/life-data.js` — Life Path board layout, tile types, careers, events, and scoring data.
- `js/games/life.js` — Life Path game rules, the existing 2D board renderer, HUD, choices, spinner, and debug controls.
- `js/life3d/` — Procedural Three.js world and view modules.
- `js/life3d/timing.js` — The shared `LIFE_TIMING` values for movement, effects, pacing, and fallback checks.
- `js/life3d/view.js` — The `LifeView` adapter, settings, and choice between the 3D view and 2D fallback.
- `js/life3d/world.js` — Terrain, sky, water, lighting, and world animation.
- `js/life3d/track.js` — 3D road and tile geometry.
- `js/life3d/props.js` — Procedural scenery and props.
- `js/life3d/renderer.js` — Three.js renderer, camera, actors, movement, effects, resizing, and debug readout.
- `HANDOFF.md` — This project and workflow handoff.
- `.github/` — Repository-specific Copilot instructions.
- `.github/copilot-instructions.md` — Short rules for future coding tasks in this repository.

There is no separate `hud.js`: the current HUD, spinner, choice cards, and 2D renderer live in `js/games/life.js`.

## Lobby, game registration, and networking

Each game file adds a game object to `window.GameNightGames`. The lobby reads that list to build its picker; it uses the game's `id`, `name`, `description`, `minPlayers`, and optional `maxPlayers`. A game provides its start/initialization, state/action handling, rendering, and optional cleanup methods. Registering another game should not require editing the picker.

The host starts the selected game and owns its authoritative state. The game's host logic calls `publish()` through the context in `js/main.js`; `js/net.js` broadcasts the public game snapshot. Guest controls call `sendAction()` to send an intent to the host, which validates and applies it before publishing the next state. For games with private data, the host supplies a per-player private-state map; `js/net.js` sends each entry only to its matching peer. Card Auction uses this for secret cards.

## Life Path architecture

- `LifeView` exposes `init`, `setPlayers`, `updateStats`, `movePlayerAlongTiles`, `focusPlayer`, `showTileEffect`, `floatText`, `playerRetired`, `gameEnded`, `setViewMode`, and `destroy`. Movement returns a Promise.
- The default view is 3D. `view.js` creates the Three.js renderer when available; user settings, WebGL/context failures, and sustained low frame rate can select the existing 2D renderer in `life.js`.
- `LIFE_TIMING` in `timing.js` centralizes movement, spinner/effect, camera, host-pacing, and fallback timing. Animations are cosmetic; game state remains authoritative.
- Settings include 3D/2D view, High/Lite quality, Fast animations, Overview camera, Legend, and the host Pace selector. High enables the full visual quality and up to 2× pixel ratio. Lite reduces visual workload; it uses pixel ratio 1 only on very weak devices.
- Settings stored in `localStorage`: `lifePathViewMode`, `lifePath3DQuality`, `lifePathFastAnimations`, and `lifePathCrownNoticeSeen`. The animal picker remembers `game-night-avatar`. A guest's reconnect details are kept in `sessionStorage` as `game-night-room`.
- Add `#debug` to the page URL to show renderer status and, for the host, the debug panel: FPS, draw calls, triangles, tile jump controls, a next-stop shortcut, and a 100K test-cash button.

## Game rules and scoring

- **Card Auction:** Each player has a private hand of cards 1–13. Over 13 rounds, players secretly lock a card as a bid on the growing pot. The highest bid takes the pot; ties carry it forward and can lead to a tie-break (Rock-Paper-Scissors for two players, Up or Down for larger ties). Spent cards cannot be reused.
- **Life Path:** Choose a game length, then move along a 100-tile main route with a college branch. Tile choices and seven stop types (including Graduation and Retirement) affect cash, Happiness, Knowledge, and Wealth. Final points are cash plus 20 points per stat token, category-leader bonuses (ties share the bonus), and any game-rule retirement rewards.

## Features already implemented

- Animal picker in the home screen and lobby.
- Host pacing: manual Continue/Next turn and the Pace selector.
- Quick, Standard, and Long game-length choices.
- Board minimap and camera controls.
- Fast animations setting.
- Life Path 2D fallback and optional 3D/2D view setting.

## Known problems and gaps

The following are reported gaps on the currently published `main` build. The recent local Life Path visual/layout fixes are not committed or published yet, so re-check these after those code changes are deliberately shipped:

- On a large Retina screen the 3D view may show only a gradient and HTML overlay; the canvas may look blurry and the game layout may extend below the window.
- Stop landmarks are generic. Boats and fireworks are missing.
- The HUD, choice cards, and spinner still need their planned visual restyling.
- PeerJS reliability in production and a complete game run through Retirement have not been comprehensively tested.

## How to test

1. Open the hosted page in two browser tabs (or windows). Add `#debug` to the URL in the host tab.
2. In the first tab, enter a nickname, create a room, choose a game, and share its four-letter code.
3. In the second tab, enter a different nickname and animal, then join with that code. Confirm the player list updates and start the game from the host tab.
4. For Life Path, use the host-only debug controls to jump to tiles or add test cash. Test the 2D fallback, view toggle, and a range of screen sizes; do not treat test controls as normal game rules.

## Publishing

When explicitly asked to publish, commit the requested changes on `main` and push to `origin main`. GitHub Pages usually updates within 1–2 minutes; then hard-refresh the page. Do not include unrelated working-tree changes in the commit.

## Working rules for future tasks

- Read this file before starting.
- Change only what the task asks for.
- Keep Card Auction and the lobby untouched unless the task specifically includes them.
- Keep the 2D fallback working.
- Comment code in plain language for a beginner.
- Do not commit or push unless explicitly asked.
