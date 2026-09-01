// LANDBLOCK - Player data storage and persistence
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  LAND_WIDTH, LAND_HEIGHT, BLOCKS, POTATO_ORDER,
  xpForLevel, levelFromXp, TOOLS, SEEDS, PETS, MONSTERS,
} = require('./gameData');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let players = {};
let leaderboardCache = null;

function loadAll() {
  if (fs.existsSync(PLAYERS_FILE)) {
    try {
      players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    } catch (e) {
      console.error('Failed to load players:', e);
      players = {};
    }
  } else {
    players = {};
  }
}

function saveAll() {
  try {
    const tmp = PLAYERS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(players, null, 2));
    fs.renameSync(tmp, PLAYERS_FILE);
    leaderboardCache = null;
  } catch (e) {
    console.error('Failed to save players:', e);
  }
}

function generateLandName(username) {
  const prefixes = ['Sunny', 'Golden', 'Lucky', 'Misty', 'Crystal', 'Emerald', 'Cozy', 'Grand', 'Peaceful', 'Harvest', 'Royal', 'Wild'];
  const suffixes = ['Fields', 'Keep', 'Vale', 'Hollow', 'Meadow', 'Grove', 'Patch', 'Reach', 'Bloom', 'Hill', 'Haven', 'Row'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${p} ${s} of ${username}`;
}

// Generate a default land map
function generateLand(seedStr) {
  const width = LAND_WIDTH, height = LAND_HEIGHT;
  // Simple deterministic RNG from seed string
  let s = 0;
  for (let i = 0; i < seedStr.length; i++) s = (s * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        b: 'grasses',
        p: null, // planted potato {seed, stage, growTimer}
        m: null, // machine
        locked: false,
      });
    }
    grid.push(row);
  }

  // Ground layers: deeper = dirt, top grass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let block;
      if (y === 0) block = 'bedrock';
      else if (y === 1) block = 'dirt';
      else {
        // fill background
        block = 'grass';
      }
      grid[y][x].b = block;
    }
  }

  // Fill the whole thing with grass except a dirt floor at a certain level
  // Design: surface "walking level" is around y=height-4
  const surfaceY = height - 5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y > surfaceY + 1) grid[y][x].b = 'dirt';
      else if (y > surfaceY) grid[y][x].b = 'grass';
      else grid[y][x].b = 'grass';
    }
  }

  // Grass on top, dirt below surface
  for (let x = 0; x < width; x++) {
    grid[surfaceY][x].b = 'grass';
    grid[surfaceY + 1][x].b = 'dirt';
  }
  for (let y = height - 1; y > surfaceY + 1; y--) {
    for (let x = 0; x < width; x++) grid[y][x].b = 'dirt';
  }

  // Bedrock bottom row
  for (let x = 0; x < width; x++) grid[height - 1][x].b = 'bedrock';

  // Border walls
  for (let y = 0; y < height; y++) {
    grid[y][0].b = 'bedrock';
    grid[y][width - 1].b = 'bedrock';
  }
  // Top border
  for (let x = 0; x < width; x++) grid[0][x].b = 'bedrock';

  // Scatter decorations: flowers, trees, stones
  for (let i = 0; i < 60; i++) {
    const x = 2 + Math.floor(rand() * (width - 4));
    const y = surfaceY;
    const r = rand();
    if (r < 0.4) grid[y][x].b = 'flowers';
    else if (r < 0.6 && y > 1) {
      grid[y - 1][x].b = 'leaves';
      grid[y - 1][x + 1].b = 'leaves';
      grid[y - 1][x - 1].b = 'leaves';
      grid[y - 1][x].b = 'logs';
    } else if (r < 0.7) grid[y][x].b = 'stone';
    else if (r < 0.8) grid[y][x].b = 'path';
    else if (r < 0.9) grid[y][x].b = 'water';
  }

  // Pre-made farm area near spawn
  const spawnX = Math.floor(width / 2);
  for (let i = 0; i < 6; i++) {
    grid[surfaceY][spawnX - 3 + i].b = 'farm';
  }
  // Place a couple of machines
  grid[surfaceY][spawnX + 3].b = 'wood';
  grid[surfaceY][spawnX + 3].m = 'processor';
  grid[surfaceY][spawnX + 6].b = 'wood';
  grid[surfaceY][spawnX + 6].m = 'forge';
  // A few chest/storage decorations (stone)
  grid[surfaceY - 1][spawnX + 5].b = 'stone';
  grid[surfaceY - 1][spawnX + 6].b = 'stone';
  grid[surfaceY][spawnX - 4].b = 'path';

  return { grid, width, height, surfaceY, spawnX: spawnX * 16, spawnY: (surfaceY - 1) * 16 };
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(pw).digest('hex');
  return { salt, hash };
}

function verifyPassword(pw, salt, hash) {
  const h = crypto.createHmac('sha256', salt).update(pw).digest('hex');
  return h === hash;
}

function createPlayer(username, password) {
  username = username.trim();
  if (!username || username.length < 2 || username.length > 20) {
    return { error: 'Username must be 2-20 characters.' };
  }
  if (players[username.toLowerCase()]) {
    return { error: 'That username is already taken.' };
  }
  const { salt, hash } = hashPassword(password || '');
  const seed = username + Date.now();
  const land = generateLand(seed);
  const player = {
    id: uuidv4(),
    username,
    lower: username.toLowerCase(),
    passwordSalt: salt,
    passwordHash: hash,
    money: 100,
    potato: 20,
    stats: {
      level: 1,
      xp: 0,
      potatoesHarvested: 0,
      potatoesEarned: 0,
      blocksPlaced: 0,
      blocksBroken: 0,
      monstersFed: 0,
      petsCollected: 0,
      itemsCrafted: 0,
      created: Date.now(),
    },
    land: {
      name: generateLandName(username),
      private: false,
      grid: land.grid,
      width: land.width,
      height: land.height,
    },
    inventory: {
      // item id -> count
      blocks: {},
      seeds: {},
      potatoes: {},
      tools: [],
      gear: [],
      materials: {},
      items: {},
      petEggs: {},
    },
    equipment: { hat: null, shirt: null, pants: null, shoes: null, back: null },
    pets: [],
    activePet: null,
    monsters: {},
    spawn: { x: land.spawnX, y: land.spawnY },
    flags: {},
  };

  // Starting items
  player.inventory.seeds['common_seed'] = 5;
  player.inventory.tools.push({ type: 'wooden_hoe', uid: uuidv4() });
  // Starting blocks
  player.inventory.blocks['stone'] = 50;
  player.inventory.blocks['wood'] = 50;
  player.inventory.blocks['grass'] = 50;
  player.inventory.blocks['farm'] = 30;
  player.inventory.blocks['fence'] = 30;
  player.inventory.blocks['brick'] = 30;
  player.inventory.potatoes['common'] = 20;

  // Spawn a friendly monster on the land
  player.monsters['land_1'] = { type: 'greenslime', x: land.spawnX - 80, y: land.spawnY - 8, friendship: 0, happy: 80 };

  players[player.lower] = player;
  saveAll();
  return { player };
}

function authenticate(username, password) {
  const p = players[username.toLowerCase()];
  if (!p) return null;
  if (!verifyPassword(password || '', p.passwordSalt, p.passwordHash)) return null;
  return p;
}

function sanitizePlayer(player) {
  // Returns a client-safe copy (no password data)
  const { passwordSalt, passwordHash, ...safe } = player;
  void passwordSalt; void passwordHash;
  return safe;
}

function getAllPlayers() {
  return players;
}

function getPlayerByLower(lower) {
  return players[lower] || null;
}

function updateLeaderboardCache() {
  const list = Object.values(players).map(sanitizePlayer);
  leaderboardCache = {
    potatoes: [...list].sort((a, b) => b.stats.potatoesHarvested - a.stats.potatoesHarvested).slice(0, 20),
    richest: [...list].sort((a, b) => (b.money + b.potato) - (a.money + a.potato)).slice(0, 20),
    pets: [...list].sort((a, b) => b.pets.length - a.pets.length).slice(0, 20),
    largest: [...list].sort((a, b) => (b.stats.blocksPlaced - a.stats.blocksPlaced)).slice(0, 20),
    weekly: [...list].sort((a, b) => b.stats.weeklyHarvest - a.stats.weeklyHarvest).slice(0, 20),
  };
  return leaderboardCache;
}

function getLeaderboard() {
  return leaderboardCache || updateLeaderboardCache();
}

module.exports = {
  loadAll, saveAll, createPlayer, authenticate, getPlayerByLower,
  getAllPlayers, sanitizePlayer, getLeaderboard, updateLeaderboardCache, generateLand,
};
