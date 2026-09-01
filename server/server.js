// LANDBLOCK - Main server: HTTP + WebSocket multiplayer
const path = require('path');
const http = require('http');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
const storage = require('./storage');
const logic = require('./gameLogic');
const { BLOCKS, PETS, MONSTERS, GROWTH_STAGES, TOOLS, SEEDS, GEAR_SETS, GEAR_SLOTS } = require('./gameData');

const PORT = process.env.PORT || 3000;
const TICK_MS = 500; // growth simulation tick

storage.loadAll();

// ---- Static file server (simple, no express needed but we have it) ----
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  const full = path.join(__dirname, '..', 'public', filePath);
  if (!full.startsWith(path.join(__dirname, '..', 'public'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not Found'); return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

// Connected clients: ws -> { player, id }
const clients = new Map();

function broadcast(obj, except = null) {
  const msg = JSON.stringify(obj);
  for (const [ws, c] of clients) {
    if (ws === except) continue;
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function sendTo(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
}

function notifyAllPlayerPositions() {
  // Lightweight - send each player's position to all others
  const list = [];
  for (const [, c] of clients) {
    if (c.player && c.player.position) {
      list.push({ id: c.player.id, username: c.player.username, x: c.player.position.x, y: c.player.position.y, dir: c.player.dir, activePet: c.player.activePet, equipment: c.player.equipment, moving: c.player.moving });
    }
  }
  for (const [ws, c] of clients) {
    const others = list.filter(p => p.id !== c.player.id);
    sendTo(ws, 'playerPositions', { players: others });
  }
}

// Full state snapshot for a player
function buildSnapshot(player) {
  return storage.sanitizePlayer(player);
}

// ---- Trading ----
const trades = new Map(); // key -> trade object

function tradeKey(aId, bId) {
  return [aId, bId].sort().join('|');
}

function getTradeFor(playerId) {
  for (const [, t] of trades) {
    if (t.a.id === playerId || t.b.id === playerId) return t;
  }
  return null;
}

// ---- WebSocket handling ----
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    if (player) {
      // End any trade
      const t = getTradeFor(player.id);
      if (t) {
        broadcast({ type: 'tradeClosed', key: tradeKey(t.a.id, t.b.id) });
        trades.delete(tradeKey(t.a.id, t.b.id));
      }
      clients.delete(ws);
      broadcast({ type: 'playerLeft', id: player.id });
      storage.saveAll();
    }
  });

  function handleMessage(ws, msg) {
    switch (msg.type) {

      case 'auth': {
        const { username, password } = msg;
        let p = storage.authenticate(username, password);
        if (!p) {
          // Try to register (guest mode: username+password creates account)
          const created = storage.createPlayer(username, password);
          if (created.error) {
            sendTo(ws, 'authError', { error: created.error });
            return;
          }
          p = created.player;
        }
        player = p;
        player.position = { x: player.spawn.x, y: player.spawn.y };
        player.dir = 1;
        player.moving = false;
        ws.player = p;
        clients.set(ws, { player: p, ws });
        sendTo(ws, 'authOk', {
          self: buildSnapshot(p),
          config: configPayload(),
          leaderboard: storage.getLeaderboard(),
        });
        broadcast({ type: 'playerJoined', player: { id: p.id, username: p.username, x: player.position.x, y: player.position.y, dir: 1 } }, ws);
        break;
      }

      case 'move': {
        if (!player) return;
        const { x, y, dir, moving } = msg;
        if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
          player.position = { x, y };
          player.dir = dir === undefined ? player.dir : dir;
          player.moving = !!moving;
        }
        break;
      }

      // All authoritative actions
      case 'placeBlock': case 'breakBlock': case 'plantSeed': case 'harvest':
      case 'equipGear': case 'unequipGear': case 'hatchPet': case 'setActivePet':
      case 'machine': case 'feedMonster': case 'setLandName': case 'setLandPrivate':
      case 'lockTile': case 'unlockTile': {
        if (!player) return;
        const playerWithSideEffects = msg.type === 'unlockTile' ? handleUnlock(player, msg) : player;
        void playerWithSideEffects;
        const result = handleAction(msg.type, player, msg);
        if (result) {
          if (result.syncLand) broadcast({ type: 'landUpdate', id: player.id, grid: player.land.grid }, ws);
          sendTo(ws, 'actionResult', { type: msg.type, ...result.payload });
        }
        break;
      }

      case 'setActiveTool': {
        if (!player) return;
        logic.setActiveTool(player, msg.uid);
        sendTo(ws, 'actionResult', { type: 'setActiveTool', tool: logic.getActiveTool(player) });
        break;
      }

      case 'requestVisit': {
        if (!player) return;
        const target = storage.getPlayerByLower((msg.username || '').toLowerCase());
        if (!target) { sendTo(ws, 'actionResult', { type: 'visitTarget', error: 'Player not found.' }); break; }
        if (target.lower === player.lower) { sendTo(ws, 'actionResult', { type: 'visitTarget', error: 'You are already on your land.' }); break; }
        if (target.land.private) { sendTo(ws, 'actionResult', { type: 'visitTarget', error: 'That land is private.' }); break; }
        // Include grid
        sendTo(ws, 'actionResult', { type: 'visitTarget', land: target.land, ownerId: target.id, ownerName: target.username });
        break;
      }

      case 'returnHome': {
        if (!player) return;
        player.position = { x: player.spawn.x, y: player.spawn.y };
        sendTo(ws, 'actionResult', { type: 'returnHome', spawn: player.spawn });
        break;
      }

      case 'buySeed': {
        if (!player) return;
        const seed = SEEDS[msg.seedId];
        if (!seed) { sendTo(ws, 'actionResult', { type: 'buySeed', error: 'Unknown seed.' }); break; }
        const qty = Math.max(1, Math.floor(msg.qty || 1));
        const cost = seed.cost * qty;
        if (player.money < cost) { sendTo(ws, 'actionResult', { type: 'buySeed', error: 'Not enough money.' }); break; }
        player.money -= cost;
        logic.addInventoryItem(player, 'seeds', msg.seedId, qty);
        sendTo(ws, 'actionResult', { type: 'buySeed', ok: true, money: player.money });
        break;
      }

      case 'sellPotato': {
        if (!player) return;
        const type = msg.potato;
        const qty = Math.max(1, Math.floor(msg.qty || 1));
        if (!logic.removeInventoryItem(player, 'potatoes', type, qty)) {
          sendTo(ws, 'actionResult', { type: 'sellPotato', error: 'Not enough potatoes.' }); break;
        }
        const value = require('./gameData').POTATO_TYPES[type].value * qty;
        player.money += value;
        sendTo(ws, 'actionResult', { type: 'sellPotato', ok: true, money: player.money, sold: qty, potato: type });
        break;
      }

      case 'sellBlock': {
        if (!player) return;
        const qty = Math.max(1, Math.floor(msg.qty || 1));
        if (!logic.removeInventoryItem(player, 'blocks', msg.blockId, qty)) {
          sendTo(ws, 'actionResult', { type: 'sellBlock', error: 'Not enough blocks.' }); break;
        }
        const value = qty;
        player.money += value;
        sendTo(ws, 'actionResult', { type: 'sellBlock', ok: true, money: player.money, sold: qty });
        break;
      }

      case 'chat': {
        if (!player) return;
        const text = String(msg.text || '').slice(0, 150);
        if (!text.trim()) break;
        broadcast({ type: 'chat', username: player.username, text: text.trim(), id: player.id });
        break;
      }

      // TRADING
      case 'tradeRequest': {
        if (!player) return;
        const target = storage.getPlayerByLower((msg.username || '').toLowerCase());
        if (!target) { sendTo(ws, 'actionResult', { type: 'tradeRequest', error: 'Player not found.' }); break; }
        if (target.lower === player.lower) { sendTo(ws, 'actionResult', { type: 'tradeRequest', error: 'Cannot trade with yourself.' }); break; }
        if (getTradeFor(player.id)) { sendTo(ws, 'actionResult', { type: 'tradeRequest', error: 'You are already in a trade.' }); break; }
        if (getTradeFor(target.id)) { sendTo(ws, 'actionResult', { type: 'tradeRequest', error: 'They are in a trade.' }); break; }
        const key = tradeKey(player.id, target.id);
        const t = logic.startTrade(player, target);
        trades.set(key, t);
        broadcast({ type: 'tradeOpen', key, a: { id: player.id, username: player.username }, b: { id: target.id, username: target.username } });
        break;
      }

      case 'tradeAdd': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) { sendTo(ws, 'actionResult', { type: 'tradeAdd', error: 'Not in a trade.' }); break; }
        const side = t.a.id === player.id ? t.a : t.b;
        if (side.locked) { sendTo(ws, 'actionResult', { type: 'tradeAdd', error: 'Trade is locked.' }); break; }
        if (t.state !== 'open') break;
        const { what, id, qty } = msg;
        if (what === 'potato' && id && logic.removeInventoryItem(player, 'potatoes', id, qty)) {
          side.potatoes = (side.potatoes || 0) + qty;
          sendTradeUpdate(t);
        } else if (what === 'item') {
          // Add an inventory item; support blocks, seeds, materials
          if (logic.removeInventoryItem(player, 'blocks', id, qty)) {
            side.items.push({ what: 'blocks', id, qty });
            sendTradeUpdate(t);
          } else if (logic.removeInventoryItem(player, 'seeds', id, qty)) {
            side.items.push({ what: 'seeds', id, qty });
            sendTradeUpdate(t);
          } else if (logic.removeInventoryItem(player, 'materials', id, qty)) {
            side.items.push({ what: 'materials', id, qty });
            sendTradeUpdate(t);
          } else if (logic.removeInventoryItem(player, 'potatoes', id, qty)) {
            side.potatoes = (side.potatoes || 0) + qty;
            sendTradeUpdate(t);
          } else {
            sendTo(ws, 'actionResult', { type: 'tradeAdd', error: 'No such items.' });
          }
        }
        break;
      }

      case 'tradeRemove': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) { sendTo(ws, 'actionResult', { type: 'tradeRemove', error: 'Not in a trade.' }); break; }
        const side = t.a.id === player.id ? t.a : t.b;
        if (side.locked) { sendTo(ws, 'actionResult', { type: 'tradeRemove', error: 'Trade is locked.' }); break; }
        if (msg.what === 'potato') {
          const rem = Math.min(side.potatoes || 0, msg.qty || 0);
          logic.addInventoryItem(player, 'potatoes', msg.id, rem);
          side.potatoes -= rem;
          sendTradeUpdate(t);
        } else {
          const idx = side.items.findIndex(it => it.what === msg.what && it.id === msg.id && it.qty === msg.qty);
          if (idx >= 0) {
            const it = side.items[idx];
            logic.addInventoryItem(player, it.what, it.id, it.qty);
            side.items.splice(idx, 1);
            sendTradeUpdate(t);
          }
        }
        break;
      }

      case 'tradeLock': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) break;
        const side = t.a.id === player.id ? t.a : t.b;
        side.locked = true;
        side.confirmed = false;
        sendTradeUpdate(t);
        break;
      }

      case 'tradeUnlock': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) break;
        const side = t.a.id === player.id ? t.a : t.b;
        side.locked = false;
        side.confirmed = false;
        sendTradeUpdate(t);
        break;
      }

      case 'tradeReset': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) break;
        const side = t.a.id === player.id ? t.a : t.b;
        if (side.locked) break;
        // return all items from this side
        for (const it of side.items) logic.addInventoryItem(player, it.what, it.id, it.qty);
        side.items = [];
        if (side.potatoes) logic.addInventoryItem(player, 'potatoes', 'common', side.potatoes);
        side.potatoes = 0;
        sendTradeUpdate(t);
        break;
      }

      case 'tradeConfirm': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) break;
        const side = t.a.id === player.id ? t.a : t.b;
        if (!side.locked) { sendTo(ws, 'actionResult', { type: 'tradeConfirm', error: 'You must lock first.' }); break; }
        side.confirmed = true;
        if (t.a.confirmed && t.b.confirmed) {
          completeTrade(t);
        } else {
          sendTradeUpdate(t);
        }
        break;
      }

      case 'tradeCancel': {
        if (!player) return;
        const t = getTradeFor(player.id);
        if (!t) break;
        cancelTrade(t);
        break;
      }

      case 'craftTool': {
        if (!player) return;
        const tool = require('./gameData').TOOLS[msg.toolId];
        if (!tool) { sendTo(ws, 'actionResult', { type: 'craftTool', error: 'Unknown tool.' }); break; }
        let enough = false;
        if (tool.cost && tool.cost.potato !== undefined) {
          enough = logic.removeInventoryItem(player, 'potatoes', 'common', tool.cost.potato);
        }
        if (!enough) { sendTo(ws, 'actionResult', { type: 'craftTool', error: 'Not enough potatoes.' }); break; }
        player.inventory.tools.push({ type: tool.id, uid: require('uuid').v4() });
        player.stats.itemsCrafted++;
        logic.addXp(player, 20);
        storage.saveAll();
        sendTo(ws, 'actionResult', { type: 'craftTool', ok: true, message: `Crafted ${tool.name}!`, data: storage.sanitizePlayer(player) });
        break;
      }

      case 'buyBlock': {
        if (!player) return;
        const qty = Math.max(1, Math.min(100, Math.floor(msg.qty || 10)));
        const blockId = msg.blockId;
        if (!require('./gameData').BLOCKS[blockId]) { sendTo(ws, 'actionResult', { type: 'buyBlock', error: 'Unknown block.' }); break; }
        const cost = qty;
        if (player.money < cost) { sendTo(ws, 'actionResult', { type: 'buyBlock', error: 'Not enough money.' }); break; }
        player.money -= cost;
        logic.addInventoryItem(player, 'blocks', blockId, qty);
        sendTo(ws, 'actionResult', { type: 'buyBlock', ok: true, money: player.money, data: storage.sanitizePlayer(player) });
        break;
      }

      case 'getState': {
        if (!player) return;
        sendTo(ws, 'actionResult', { type: 'refreshPlayer', data: storage.sanitizePlayer(player) });
        break;
      }

      case 'getLeaderboard': {
        if (!player) return;
        sendTo(ws, 'actionResult', { type: 'getLeaderboard', leaderboard: storage.getLeaderboard() });
        break;
      }

      default:
        break;
    }
  }

  function sendTradeUpdate(t) {
    broadcast({ type: 'tradeUpdate', key: tradeKey(t.a.id, t.b.id), a: t.a, b: t.b });
  }

  function completeTrade(t) {
    // Both locked & confirmed. Exchange items atomically.
    // Resolve actual player objects by id
    let pa = null, pb = null;
    for (const [, c] of clients) {
      if (c.player.id === t.a.id) pa = c.player;
      if (c.player.id === t.b.id) pb = c.player;
    }
    // Items were already removed from the trader's inventory when added;
    // move them to the recipient.
    for (const it of t.b.items) pa && logic.addInventoryItem(pa, it.what, it.id, it.qty);
    for (const it of t.a.items) pb && logic.addInventoryItem(pb, it.what, it.id, it.qty);
    if (t.b.potatoes) pa && logic.addInventoryItem(pa, 'potatoes', 'common', t.b.potatoes);
    if (t.a.potatoes) pb && logic.addInventoryItem(pb, 'potatoes', 'common', t.a.potatoes);
    t.state = 'complete';
    // Send updated state to both traders
    for (const [ws, c] of clients) {
      if (c.player.id === t.a.id) sendTo(ws, 'actionResult', { type: 'refreshPlayer', data: storage.sanitizePlayer(c.player) });
      if (c.player.id === t.b.id) sendTo(ws, 'actionResult', { type: 'refreshPlayer', data: storage.sanitizePlayer(c.player) });
    }
    broadcast({ type: 'tradeComplete', key: tradeKey(t.a.id, t.b.id) });
    trades.delete(tradeKey(t.a.id, t.b.id));
    storage.saveAll();
  }

  function cancelTrade(t) {
    // Return all items
    for (const it of t.a.items) logic.addInventoryItem(t.a, it.what, it.id, it.qty);
    for (const it of t.b.items) logic.addInventoryItem(t.b, it.what, it.id, it.qty);
    if (t.a.potatoes) logic.addInventoryItem(t.a, 'potatoes', 'common', t.a.potatoes);
    if (t.b.potatoes) logic.addInventoryItem(t.b, 'potatoes', 'common', t.b.potatoes);
    t.state = 'cancelled';
    broadcast({ type: 'tradeClosed', key: tradeKey(t.a.id, t.b.id) });
    trades.delete(tradeKey(t.a.id, t.b.id));
  }
});

// addInventoryItemByTarget helper - patch into logic object
Object.defineProperty(logic, 'addInventoryItemByTarget', {
  value: (player, slot, id, qty) => logic.addInventoryItem(player, slot, id, qty),
  writable: true,
});

function handleUnlock(player, msg) {
  return player;
}

function handleAction(type, player, msg) {
  const res = { syncLand: false, payload: {} };
  const grid = player.land.grid;
  const x = Math.floor(msg.x), y = Math.floor(msg.y);
  switch (type) {
    case 'placeBlock': {
      const r = logic.placeBlock(player, null, msg.blockId, grid, x, y);
      if (r.error) res.payload = { error: r.error };
      else { res.syncLand = true; res.payload = { ok: true }; }
      break;
    }
    case 'breakBlock': {
      const r = logic.breakBlock(player, grid, x, y);
      if (r.error) res.payload = { error: r.error };
      else { res.syncLand = true; res.payload = { ok: true }; }
      break;
    }
    case 'plantSeed': {
      const r = logic.plantSeed(player, msg.seedId, grid, x, y);
      if (r.error) res.payload = { error: r.error };
      else { res.syncLand = true; res.payload = { ok: true }; }
      break;
    }
    case 'harvest': {
      const r = logic.harvestPlant(player, player.land, x, y);
      if (r.error) res.payload = { error: r.error };
      else {
        res.syncLand = true;
        res.payload = { ok: true, harvested: r.harvested, potato: r.potato, xp: r.xp };
      }
      break;
    }
    case 'equipGear': {
      const r = logic.equipGear(player, msg.uid);
      if (r.error) res.payload = { error: r.error };
      else res.payload = { ok: true, equipment: r.equipment };
      break;
    }
    case 'unequipGear': {
      const r = logic.unequipGear(player, msg.slot);
      if (r.error) res.payload = { error: r.error };
      else res.payload = { ok: true, equipment: player.equipment };
      break;
    }
    case 'hatchPet': {
      const r = logic.hatchPet(player, msg.petId);
      if (r.error) res.payload = { error: r.error };
      else res.payload = { ok: true, pets: player.pets, activePet: player.activePet };
      break;
    }
    case 'setActivePet': {
      const r = logic.setActivePet(player, msg.petId);
      if (r.error) res.payload = { error: r.error };
      else res.payload = { ok: true, activePet: player.activePet };
      break;
    }
    case 'machine': {
      const r = logic.machineAction(player, msg.mtype, msg.action, msg.param);
      if (r.error) res.payload = { error: r.error };
      else res.payload = { ok: true, message: r.message };
      break;
    }
    case 'feedMonster': {
      const mon = player.monsters[msg.monsterId] || findMonsterAt(player, msg.x, msg.y);
      if (!mon) { res.payload = { error: 'Monster not found.' }; break; }
      const r = logic.feedMonster(player, mon);
      if (r.error) res.payload = { error: r.error };
      else res.payload = { ok: true, friendship: r.friendship, happy: r.happy, reward: r.reward };
      break;
    }
    case 'setLandName': {
      if (typeof msg.name === 'string' && msg.name.trim()) player.land.name = msg.name.trim().slice(0, 30);
      res.payload = { ok: true, name: player.land.name };
      break;
    }
    case 'setLandPrivate': {
      player.land.private = !!msg.value;
      res.payload = { ok: true, private: player.land.private };
      break;
    }
    case 'lockTile': {
      const tile = grid[y] && grid[y][x];
      if (tile) { tile.locked = true; res.syncLand = true; res.payload = { ok: true }; }
      break;
    }
    case 'unlockTile': {
      const tile = grid[y] && grid[y][x];
      if (tile) { tile.locked = false; res.syncLand = true; res.payload = { ok: true }; }
      break;
    }
    default:
      break;
  }
  return res;
}

function findMonsterAt(player, x, y) {
  for (const id in player.monsters) {
    const mon = player.monsters[id];
    const dx = (mon.x - x), dy = (mon.y - 8 - y);
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return mon;
  }
  return null;
}

// ---- Game tick: plant growth + position broadcast ----
setInterval(() => {
  const now = Date.now();
  for (const [ws, c] of clients) {
    const p = c.player;
    if (!p) continue;
    // Plant growth
    let changed = false;
    for (let y = 0; y < p.land.grid.length; y++) {
      for (let x = 0; x < p.land.grid[y].length; x++) {
        const tile = p.land.grid[y][x];
        if (tile && tile.p && tile.p.stage < GROWTH_STAGES - 1) {
          if (!tile.p._t) tile.p._t = now;
          if (now - tile.p._t >= logic.STAGE_TIME_MS) {
            tile.p.stage++;
            tile.p._t = now;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      sendTo(ws, 'actionResult', { type: 'growthUpdate', grid: p.land.grid });
    }
  }

  // Broadcast positions every ~200ms (4 per tick)
  if (Math.floor(now / 200) % 2 === 0) {
    notifyAllPlayerPositions();
  }

  // Persist occasionally
  if (Math.floor(now / 30000) !== Math.floor((now - 500) / 30000)) {
    storage.saveAll();
  }
}, logic.STAGE_TIME_MS > 500 ? logic.STAGE_TIME_MS : TICK_MS);

// ---- Heartbeat ----
setInterval(() => {
  for (const [ws] of clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

function configPayload() {
  const data = require('./gameData');
  return {
    POTATO_TYPES: data.POTATO_TYPES,
    POTATO_ORDER: data.POTATO_ORDER,
    RARITY: data.RARITY,
    BLOCKS: data.BLOCKS,
    MACHINES: data.MACHINES,
    TOOLS: data.TOOLS,
    SEEDS: data.SEEDS,
    GEAR_SLOTS: data.GEAR_SLOTS,
    GEAR_SETS: data.GEAR_SETS,
    MONSTERS: data.MONSTERS,
    PETS: data.PETS,
    GROWTH_STAGES: data.GROWTH_STAGES,
    LAND_WIDTH: data.LAND_WIDTH,
    LAND_HEIGHT: data.LAND_HEIGHT,
  };
}

server.listen(PORT, () => {
  console.log(`LANDBLOCK server running at http://localhost:${PORT}`);
});
