# LANDBLOCK

A 2D multiplayer pixel farming & sandbox game. Every player owns a personal land where they farm potatoes, build structures, collect gear and pets, feed monsters, and trade with other players.

## Features

- **Personal land system** — every account gets a generated land with spawn point, farm area, and machines
- **Player movement** — side-scrolling 2D pixel world with physics (WASD + Space to jump)
- **Block placing & breaking** — build houses, fences, decorations (left-click place, right-click break)
- **Farming** — plant seeds, watch crops grow through 5 stages, harvest potatoes
- **Potato economy** — 6 rarities (Common → Mutated) with different values
- **Inventory system** — hotbar + full inventory with blocks, seeds, potatoes, tools, gear, materials, pet eggs
- **Equipment & gear sets** — hats, shirts, pants, shoes, back accessories with set bonuses
- **Tools** — 5 rarities of hoes that improve yield/speed/rare chance/mutation
- **Monsters** — friendly + hostile monsters; feed friendly ones to raise friendship and earn rewards
- **Pets** — collectible pets that follow you and grant bonuses
- **Machines** — Potato Processor, Mutation Machine, Gear Forge, Pet Machine
- **Trading** — secure lock/confirm player-to-player trading (server-authoritative)
- **Multiplayer** — see other players, visit their lands, chat
- **Leaderboards** — potatoes harvested, richest, pets, buildings, weekly farming
- **Persistent saving** — all progress saved server-side to `data/players.json`
- **Progression** — levels, XP, and rewarding gear/tool/pet upgrades

## Setup

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

- New player? Enter any username + password — your account and land are created automatically.
- Returning player? Enter the same username + password to load your saved progress.

## Controls

- **A / D / ← / →** — move
- **W / ↑ / Space** — jump
- **Left click** — use selected hotbar item (place block / plant / harvest / open machine)
- **Right click** — break block / feed monster
- **1–8** — select hotbar slot
- **E** — toggle inventory
- **Enter (in chat box)** — send chat

## Project Structure

```
server/
  server.js        # HTTP + WebSocket server, multiplayer, trading
  gameData.js      # shared item/block/potato/monster/pet definitions
  gameLogic.js     # authoritative game actions (farming, harvesting, crafting)
  storage.js       # account creation, land generation, persistence
public/
  index.html
  css/style.css
  js/              # client modules (config, player, world, render, inventory, ui, net, main)
data/
  players.json     # saved player data (auto-created)
```

## Server-authoritative design

Important actions (adding/removing items, farming, trading, rewards) are validated and executed server-side. The client never trusts itself for economy-critical operations, preventing duplication/cheating.
