// LANDBLOCK - Core server game logic (authoritative)
// All important actions are validated here on the server.
const { v4: uuidv4 } = require('uuid');
const {
  BLOCKS, BLOCK_IDS, TOOLS, SEEDS, POTATO_TYPES, POTATO_ORDER,
  MONSTERS, MONSTER_REWARDS, PETS, GEAR_SETS, GEAR_SLOTS,
  GROWTH_STAGES, MACHINES, LAND_WIDTH, LAND_HEIGHT,
  xpForLevel, levelFromXp,
} = require('./gameData');
const storage = require('./storage');

// Growth time for each stage in ms (scaled for playability)
const STAGE_TIME_MS = 8000;
const FULL_GROW_TIME = STAGE_TIME_MS * (GROWTH_STAGES - 1);

function addInventoryItem(player, slot, id, qty = 1) {
  if (!player.inventory[slot]) player.inventory[slot] = {};
  player.inventory[slot][id] = (player.inventory[slot][id] || 0) + qty;
}

function hasInventoryItem(player, slot, id, qty = 1) {
  return (player.inventory[slot] && player.inventory[slot][id] || 0) >= qty;
}

function removeInventoryItem(player, slot, id, qty = 1) {
  if (!player.inventory[slot] || !player.inventory[slot][id]) return false;
  if (player.inventory[slot][id] < qty) return false;
  player.inventory[slot][id] -= qty;
  if (player.inventory[slot][id] <= 0) delete player.inventory[slot][id];
  return true;
}

function addXp(player, amount) {
  player.stats.xp = (player.stats.xp || 0) + amount;
  const info = levelFromXp(player.stats.xp);
  if (info.level > player.stats.level) {
    player.stats.level = info.level;
    return { leveled: true, newLevel: info.level };
  }
  return { leveled: false };
}

function getEquippedBonuses(player) {
  const bonus = { yield: 1, speed: 1, rareChance: 0, mutation: 0, lavaBoost: 1, frostBoost: 1, findBonus: 0 };
  // Sum all gear piece bonuses from sets
  const equippedSets = new Set();
  for (const slot of GEAR_SLOTS) {
    const piece = player.equipment[slot];
    if (!piece || !piece.setId) continue;
    equippedSets.add(piece.setId);
  }
  // For a full set (>=3 pieces) apply bonus
  const setCount = {};
  for (const slot of GEAR_SLOTS) {
    const piece = player.equipment[slot];
    if (piece && piece.setId) setCount[piece.setId] = (setCount[piece.setId] || 0) + 1;
  }
  for (const setId in setCount) {
    if (setCount[setId] >= 3) {
      const set = GEAR_SETS[setId];
      if (set && set.bonus) {
        if (set.bonus.yield) bonus.yield *= set.bonus.yield;
        if (set.bonus.harvestSpeed) bonus.speed *= set.bonus.harvestSpeed;
        if (set.bonus.rareChance) bonus.rareChance += set.bonus.rareChance;
        if (set.bonus.lavaBoost) bonus.lavaBoost *= set.bonus.lavaBoost;
        if (set.bonus.frostBoost) bonus.frostBoost *= set.bonus.frostBoost;
      }
    }
  }
  // Tool bonus
  const tool = getActiveTool(player);
  if (tool) {
    const t = TOOLS[tool.type];
    if (t) {
      bonus.yield *= t.yield;
      bonus.speed *= t.speed;
      bonus.rareChance += t.rareChance;
      bonus.mutation += t.mutation;
    }
  }
  // Active pet bonus
  if (player.activePet) {
    const pet = PETS[player.activePet];
    if (pet && pet.bonus) {
      if (pet.bonus.yield) bonus.yield += pet.bonus.yield;
      if (pet.bonus.harvest) bonus.yield += pet.bonus.harvest;
      if (pet.bonus.rareChance) bonus.rareChance += pet.bonus.rareChance;
      if (pet.bonus.lavaBoost) bonus.lavaBoost *= pet.bonus.lavaBoost;
      if (pet.bonus.frostBoost) bonus.frostBoost *= pet.bonus.frostBoost;
      if (pet.bonus.findBonus) bonus.findBonus += pet.bonus.findBonus;
    }
  }
  return bonus;
}

function getActiveTool(player) {
  return player.inventory.tools.find(t => t.active) || player.inventory.tools[0] || null;
}

function setActiveTool(player, uid) {
  for (const t of player.inventory.tools) t.active = (t.uid === uid);
}

// Roll potato rarity based on bonuses
function rollPotato(player, bonus, farmType) {
  // farmType: 'farm' normal, 'lava_farm', 'frost_farm' -> boost specific
  const weights = [
    { id: 'common', w: 60, boost: 1 },
    { id: 'purple', w: 22, boost: 1 },
    { id: 'golden', w: 11, boost: 1 },
    { id: 'frost', w: 5, boost: farmType === 'frost_farm' ? bonus.frostBoost : 1 },
    { id: 'lava', w: 2, boost: farmType === 'lava_farm' ? bonus.lavaBoost : 1 },
    { id: 'mutated', w: 0.5, boost: 1 + bonus.mutation / 10 },
  ];
  // rareChance percentage adds to higher tiers directly
  const total = weights.reduce((a, w) => a + w.w * w.boost, 0);
  weights[2].w += bonus.rareChance * 0.5; // golden
  weights[3].w += bonus.rareChance * 0.3;
  weights[4].w += bonus.rareChance * 0.15;
  weights[5].w += bonus.rareChance * 0.05;
  // normalize
  const adjTotal = weights.reduce((a, w) => a + w.w, 0);
  let roll = Math.random() * adjTotal;
  for (const w of weights) {
    roll -= w.w;
    if (roll <= 0) return w.id;
  }
  return 'common';
}

function rollPotatoRollTotal(player, bonus, farmType) {
  // total single harvest yield
  const base = 1;
  let qty = Math.floor(base * bonus.yield);
  if (Math.random() < (bonus.yield - Math.floor(bonus.yield))) qty += 1;
  if (qty < 1) qty = 1;
  return qty + (bonus.findBonus > 0 && Math.random() < bonus.findBonus ? 1 : 0);
}

// Harvest a potato plant
function harvestPlant(player, land, x, y) {
  const tile = land.grid[y][x];
  if (!tile || !tile.p) return { error: 'No plant here.' };
  const plant = tile.p;
  if (plant.stage < GROWTH_STAGES - 1) return { error: 'Not ready to harvest yet.' };

  const bonus = getEquippedBonuses(player);
  const farmType = (tile.b === 'lava_farm') ? 'lava_farm' : (tile.b === 'frost_farm') ? 'frost_farm' : 'farm';
  const potatoId = plant.seed ? SEEDS[plant.seed].potato : plant.potatoId || 'common';
  const qty = rollPotatoRollTotal(player, bonus, farmType);
  const actualPotato = plant.mutating && Math.random() < 0.3 ? 'mutated' : potatoId;

  addInventoryItem(player, 'potatoes', actualPotato, qty);
  player.stats.potatoesHarvested += qty;
  player.stats.potatoesEarned += qty;
  player.stats.weeklyHarvest = (player.stats.weeklyHarvest || 0) + qty;
  addXp(player, 10 + qty * 2);
  tile.p = null;
  // Convert farm back to farm (stay plantable)
  return { harvested: qty, potato: actualPotato };
}

// Place a block
function placeBlock(player, blockSlot, blockId, grid, x, y) {
  if (!BLOCKS[blockId]) return { error: 'Unknown block.' };
  if (x < 0 || y < 0 || x >= grid[0].length || y >= grid.length) return { error: 'Out of bounds.' };
  const tile = grid[y][x];
  // Cannot place on bedrock or existing solid block with content
  if (tile.b === 'bedrock') return { error: 'Cannot place there.' };
  if (tile.p) return { error: 'Cannot place on a plant.' };
  if (tile.m) return { error: 'Cannot place on a machine.' };
  if (!removeInventoryItem(player, 'blocks', blockId, 1)) return { error: 'No block in inventory.' };
  tile.b = blockId;
  player.stats.blocksPlaced++;
  addXp(player, 1);
  return { ok: true };
}

// Break a block
function breakBlock(player, grid, x, y) {
  if (x < 0 || y < 0 || x >= grid[0].length || y >= grid.length) return { error: 'Out of bounds.' };
  const tile = grid[y][x];
  const blk = BLOCKS[tile.b];
  if (!blk) return { error: 'Unknown block.' };
  if (!blk.breakable) return { error: 'Cannot break this block.' };
  if (tile.m) tile.m = null;
  if (tile.p) tile.p = null;
  addInventoryItem(player, 'blocks', tile.b, 1);
  tile.b = 'grass';
  player.stats.blocksBroken++;
  addXp(player, 1);
  return { ok: true };
}

// Plant a seed
function plantSeed(player, seedId, grid, x, y) {
  if (!SEEDS[seedId]) return { error: 'Unknown seed.' };
  if (x < 0 || y < 0 || x >= grid[0].length || y >= grid.length) return { error: 'Out of bounds.' };
  const tile = grid[y][x];
  const blk = BLOCKS[tile.b];
  if (!blk || !blk.plantable) return { error: 'Seeds must be planted on farm soil.' };
  if (tile.p) return { error: 'Already planted here.' };
  if (tile.m) return { error: 'Cannot plant on a machine.' };
  if (!removeInventoryItem(player, 'seeds', seedId, 1)) return { error: 'No seed in inventory.' };
  tile.p = { seed: seedId, stage: 0, growTimer: 0, potatoId: SEEDS[seedId].potato };
  return { ok: true };
}

// Feed a monster
function feedMonster(player, monster) {
  const def = MONSTERS[monster.type];
  if (!def) return { error: 'Unknown monster.' };
  if (!def.friendly) return { error: 'This monster is hostile!' };
  const potatoId = def.feed.potato;
  if (!removeInventoryItem(player, 'potatoes', potatoId, 1)) return { error: `You need a ${POTATO_TYPES[potatoId].name} to feed.` };
  monster.friendship = (monster.friendship || 0) + 1;
  monster.happy = Math.min(100, (monster.happy || 80) + 20);
  player.stats.monstersFed++;

  // Reward on friendship milestones
  let reward = null;
  if (monster.friendship >= def.friendshipRequired) {
    reward = rollMonsterReward(player, monster);
    monster.friendship = 0; // reset for next cycle
    monster.happy = 50;
  }
  addXp(player, 5);
  return { ok: true, friendship: monster.friendship, happy: monster.happy, reward };
}

function rollMonsterReward(player, monster) {
  const list = MONSTER_REWARDS[monster.type];
  if (!list) return null;
  let chosen = null;
  for (const r of list) {
    if (Math.random() < r.chance) { chosen = r; break; }
  }
  if (!chosen) {
    // fallback: potatoes or gear
    if (Math.random() < 0.25) {
      const piece = grantRandomGear(player);
      if (piece) return { text: `You found gear: ${piece.name}!` };
    }
    chosen = { type: 'potato', potato: 'common', qty: 1 };
  }
  let txt = '';
  if (chosen.type === 'pet_egg') {
    addInventoryItem(player, 'petEggs', chosen.pet, 1);
    player.stats.petsCollected++;
    txt = `You got a pet egg! (${PETS[chosen.pet].name})`;
  } else if (chosen.type === 'seed') {
    const seedId = Object.keys(SEEDS).find(s => SEEDS[s].potato === chosen.potato);
    addInventoryItem(player, 'seeds', seedId, chosen.qty || 1);
    txt = `You got ${chosen.qty || 1}x ${SEEDS[seedId].name}(s)!`;
  } else if (chosen.type === 'potato') {
    addInventoryItem(player, 'potatoes', chosen.potato, chosen.qty || 1);
    txt = `You got ${chosen.qty || 1}x ${POTATO_TYPES[chosen.potato].name}(s)!`;
  }
  return { text: txt };
}

// Equip a gear item
function equipGear(player, gearUid) {
  const gear = player.inventory.gear.find(g => g.uid === gearUid);
  if (!gear) return { error: 'Gear not found.' };
  const slot = gear.slot;
  if (!slot) return { error: 'Invalid gear.' };
  const prev = player.equipment[slot];
  player.equipment[slot] = gear;
  if (prev) {
    // keep prev gear in inventory
  }
  return { ok: true, equipment: player.equipment };
}

function unequipGear(player, slot) {
  const gear = player.equipment[slot];
  if (!gear) return { error: 'Nothing equipped.' };
  player.equipment[slot] = null;
  return { ok: true };
}

// Hatch pet egg
function hatchPet(player, petId) {
  if (!PETS[petId]) return { error: 'Unknown pet.' };
  if (!removeInventoryItem(player, 'petEggs', petId, 1)) return { error: 'No egg.' };
  if (!player.pets.includes(petId)) player.pets.push(petId);
  return { ok: true, pet: petId };
}

function setActivePet(player, petId) {
  if (!player.pets.includes(petId)) return { error: "You don't own this pet." };
  player.activePet = petId;
  return { ok: true };
}

// Craft items in a machine
function machineAction(player, mtype, action, param) {
  if (mtype === 'processor') {
    // Process potatoes -> processing materials. consume 5 common -> 1 potatoMatter
    if (!removeInventoryItem(player, 'potatoes', 'common', 5)) return { error: 'Need 5 common potatoes.' };
    addInventoryItem(player, 'materials', 'potato_matter', 1);
    player.stats.itemsCrafted++;
    return { ok: true, message: 'Processed 5 potatoes into 1 Potato Matter.' };
  }
  if (mtype === 'mutation') {
    // Try to mutate potatoes
    const target = param || 'common';
    if (!removeInventoryItem(player, 'potatoes', target, 3)) return { error: 'Need 3 potatoes to mutate.' };
    if (Math.random() < 0.35) {
      const idx = POTATO_ORDER.indexOf(target);
      const next = POTATO_ORDER[Math.min(idx + 1, POTATO_ORDER.length - 1)];
      addInventoryItem(player, 'potatoes', next, 1);
      player.stats.itemsCrafted++;
      return { ok: true, message: `Mutation successful! Got 1 ${POTATO_TYPES[next].name}.` };
    }
    return { ok: true, message: 'Mutation failed. Potatoes were consumed.' };
  }
  if (mtype === 'forge') {
    // Craft gear. param=setId (or toolId for tools)
    if (param && TOOLS[param]) {
      const toolId = param;
      const tool = TOOLS[toolId];
      const potato = tool.cost.potato;
      if (!removeInventoryItem(player, 'potatoes', 'common', potato)) return { error: `Need ${potato} potatoes.` };
      player.inventory.tools.push({ type: toolId, uid: uuidv4() });
      player.stats.itemsCrafted++;
      addXp(player, 20);
      return { ok: true, message: `Crafted ${tool.name}!` };
    }
    if (param && GEAR_SETS[param]) {
      const r = craftGearFromForge(player, param);
      if (r.error) return r;
      return { ok: true, message: `Crafted ${r.piece.name}!` };
    }
    return { error: 'Choose a gear set or tool to craft.' };
  }
  if (mtype === 'petmachine') {
    // Hatch from egg already handled; here allow buying random egg with potatoes
    return { error: 'Use pet eggs to hatch pets.' };
  }
  return { error: 'Unknown machine.' };
}

// Create a gear piece from a set + slot + rarity
function makeGearPiece(setId, slot) {
  const set = GEAR_SETS[setId];
  if (!set || !set.pieces[slot]) return null;
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const r = rarities[Math.floor(Math.random() * rarities.length)];
  const icons = { hat: '🎩', shirt: '👕', pants: '👖', shoes: '👟', back: '🎒' };
  return {
    uid: uuidv4(),
    setId,
    name: set.pieces[slot].name,
    slot,
    rarity: r,
    icon: icons[slot] || '💍',
  };
}

function grantRandomGear(player) {
  const slot = GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)];
  const setId = Object.keys(GEAR_SETS)[Math.floor(Math.random() * Object.keys(GEAR_SETS).length)];
  const piece = makeGearPiece(setId, slot);
  if (!piece) return null;
  player.inventory.gear.push(piece);
  return piece;
}

function craftGearFromForge(player, setId) {
  const set = GEAR_SETS[setId];
  if (!set) return { error: 'Unknown set.' };
  if (!removeInventoryItem(player, 'potatoes', 'common', 150)) return { error: 'Need 150 common potatoes.' };
  const slot = GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)];
  const piece = makeGearPiece(setId, slot);
  player.inventory.gear.push(piece);
  player.stats.itemsCrafted++;
  addXp(player, 30);
  return { ok: true, piece };
}

// Trade operations
function startTrade(playerA, playerB) {
  // returns trade object
  return {
    a: { id: playerA.id, username: playerA.username, items: [], potatoes: 0, locked: false, confirmed: false },
    b: { id: playerB.id, username: playerB.username, items: [], potatoes: 0, locked: false, confirmed: false },
    state: 'open',
  };
}

module.exports = {
  STAGE_TIME_MS, FULL_GROW_TIME,
  addInventoryItem, hasInventoryItem, removeInventoryItem,
  addXp, getEquippedBonuses, getActiveTool, setActiveTool,
  rollPotato, rollPotatoRollTotal, harvestPlant,
  placeBlock, breakBlock, plantSeed,
  feedMonster, rollMonsterReward,
  equipGear, unequipGear, hatchPet, setActivePet,
  machineAction, craftGearFromForge, grantRandomGear, makeGearPiece, startTrade,
};
