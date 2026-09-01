// LANDBLOCK - Shared game data definitions (used by both server and client)
// This file is loaded on the server and mirrored to clients via config.

const TILE_SIZE = 16;

// Land dimensions (in tiles)
const LAND_WIDTH = 80;
const LAND_HEIGHT = 48;

// Potato rarities
const POTATO_TYPES = {
  common: { id: 'common', name: 'Common Potato', color: '#c9a35c', value: 1, rarity: 0, weight: 60 },
  purple: { id: 'purple', name: 'Purple Potato', color: '#9b59b6', value: 3, rarity: 1, weight: 20 },
  golden: { id: 'golden', name: 'Golden Potato', color: '#f1c40f', value: 6, rarity: 2, weight: 10 },
  frost: { id: 'frost', name: 'Frost Potato', color: '#a3e4f7', value: 10, rarity: 3, weight: 6 },
  lava: { id: 'lava', name: 'Lava Potato', color: '#e74c3c', value: 15, rarity: 4, weight: 3 },
  mutated: { id: 'mutated', name: 'Mutated Potato', color: '#2ecc71', value: 25, rarity: 5, weight: 1 },
};

const POTATO_ORDER = ['common', 'purple', 'golden', 'frost', 'lava', 'mutated'];

// Rarity tiers
const RARITY = {
  common: { id: 'common', name: 'Common', color: '#b0b0b0' },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: '#4caf50' },
  rare: { id: 'rare', name: 'Rare', color: '#2196f3' },
  epic: { id: 'epic', name: 'Epic', color: '#9c27b0' },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ff9800' },
};

// Tile/block definitions
const BLOCKS = {
  grass: { id: 'grass', name: 'Grass', solid: false, color: '#5d9c3d', walkable: true, breakable: true },
  dirt: { id: 'dirt', name: 'Dirt', solid: false, color: '#8b5a2b', walkable: true, breakable: true },
  farm: { id: 'farm', name: 'Farm Soil', solid: false, color: '#a0522d', walkable: true, breakable: true, plantable: true },
  stone: { id: 'stone', name: 'Stone', solid: true, color: '#7f8c8d', walkable: false, breakable: true },
  wood: { id: 'wood', name: 'Wood Plank', solid: true, color: '#a97142', walkable: false, breakable: true },
  glass: { id: 'glass', name: 'Glass', solid: true, color: '#9fd9f5', walkable: false, breakable: true, transparent: true },
  brick: { id: 'brick', name: 'Brick', solid: true, color: '#b03a2e', walkable: false, breakable: true },
  fence: { id: 'fence', name: 'Fence', solid: true, color: '#8d6e63', walkable: false, breakable: true },
  flowers: { id: 'flowers', name: 'Flowers', solid: false, color: '#e91e63', walkable: true, breakable: true },
  path: { id: 'path', name: 'Stone Path', solid: false, color: '#bdbdbd', walkable: true, breakable: true },
  water: { id: 'water', name: 'Water', solid: false, color: '#3498db', walkable: false, breakable: false, blockMove: true },
  lava: { id: 'lava', name: 'Lava', solid: false, color: '#ff5722', walkable: false, breakable: false, blockMove: true, damage: true },
  bedrock: { id: 'bedrock', name: 'Bedrock', solid: true, color: '#2c2c2c', walkable: false, breakable: false },
  logs: { id: 'logs', name: 'Log', solid: true, color: '#6d4c41', walkable: false, breakable: true },
  leaves: { id: 'leaves', name: 'Leaves', solid: false, color: '#66bb6a', walkable: true, breakable: true },
  stonebrick: { id: 'stonebrick', name: 'Stone Brick', solid: true, color: '#90a4ae', walkable: false, breakable: true },
  marble: { id: 'marble', name: 'Marble', solid: true, color: '#eceff1', walkable: false, breakable: true },
};

// Machines
const MACHINES = {
  processor: { id: 'processor', name: 'Potato Processor', desc: 'Process potatoes into materials' },
  mutation: { id: 'mutation', name: 'Mutation Machine', desc: 'Mutate potatoes into rare versions' },
  forge: { id: 'forge', name: 'Gear Forge', desc: 'Craft gear' },
  petmachine: { id: 'petmachine', name: 'Pet Machine', desc: 'Hatch pet eggs' },
};

// Tools
const TOOLS = {
  wooden_hoe: { id: 'wooden_hoe', name: 'Wooden Hoe', rarity: 'common', tier: 1, speed: 1, yield: 1, rareChance: 0, mutation: 0, icon: '🌾', cost: { potato: 10 } },
  iron_hoe: { id: 'iron_hoe', name: 'Iron Hoe', rarity: 'uncommon', tier: 2, speed: 1.3, yield: 1.2, rareChance: 2, mutation: 0, icon: '⛏️', cost: { potato: 50 } },
  crystal_hoe: { id: 'crystal_hoe', name: 'Crystal Hoe', rarity: 'rare', tier: 3, speed: 1.7, yield: 1.5, rareChance: 5, mutation: 1, icon: '💎', cost: { potato: 200 } },
  lava_hoe: { id: 'lava_hoe', name: 'Lava Hoe', rarity: 'epic', tier: 4, speed: 2.2, yield: 1.9, rareChance: 8, mutation: 3, icon: '🔥', cost: { potato: 800 } },
  legendary_hoe: { id: 'legendary_hoe', name: 'Legendary Land Hoe', rarity: 'legendary', tier: 5, speed: 3, yield: 2.5, rareChance: 12, mutation: 5, icon: '👑', cost: { potato: 3000 } },
};

// Seeds
const SEEDS = {
  common_seed: { id: 'common_seed', name: 'Common Potato Seed', potato: 'common', cost: 2 },
  purple_seed: { id: 'purple_seed', name: 'Purple Potato Seed', potato: 'purple', cost: 6 },
  golden_seed: { id: 'golden_seed', name: 'Golden Potato Seed', potato: 'golden', cost: 12 },
  frost_seed: { id: 'frost_seed', name: 'Frost Potato Seed', potato: 'frost', cost: 22 },
  lava_seed: { id: 'lava_seed', name: 'Lava Potato Seed', potato: 'lava', cost: 35 },
  mutated_seed: { id: 'mutated_seed', name: 'Mutated Potato Seed', potato: 'mutated', cost: 60 },
};

// Gear slots
const GEAR_SLOTS = ['hat', 'shirt', 'pants', 'shoes', 'back'];

// Gear sets
const GEAR_SETS = {
  farmer: {
    id: 'farmer', name: 'Farmer Set', bonus: { yield: 1.2, harvestSpeed: 1.2 }, pieces: {
      hat: { name: 'Straw Hat' }, shirt: { name: 'Farmer Shirt' }, pants: { name: 'Farmer Pants' }, shoes: { name: 'Work Boots' }, back: { name: 'Backpack' }
    }
  },
  potatoKing: {
    id: 'potatoKing', name: 'Potato King Set', bonus: { rareChance: 6 }, pieces: {
      hat: { name: 'Crown' }, shirt: { name: 'King Robe' }, pants: { name: 'King Pants' }, shoes: { name: 'King Boots' }, back: { name: 'Royal Cape' }
    }
  },
  lava: {
    id: 'lava', name: 'Lava Set', bonus: { lavaBoost: 1.5 }, pieces: {
      hat: { name: 'Lava Helm' }, shirt: { name: 'Lava Armor' }, pants: { name: 'Lava Leggings' }, shoes: { name: 'Lava Boots' }, back: { name: 'Lava Cloak' }
    }
  },
  frost: {
    id: 'frost', name: 'Frost Set', bonus: { frostBoost: 1.5 }, pieces: {
      hat: { name: 'Frost Helm' }, shirt: { name: 'Frost Armor' }, pants: { name: 'Frost Leggings' }, shoes: { name: 'Frost Boots' }, back: { name: 'Frost Cloak' }
    }
  },
};

// Monsters
const MONSTERS = {
  greenslime: { id: 'greenslime', name: 'Green Slime', friendly: true, color: '#4caf50', feed: { potato: 'common' }, friendshipRequired: 3 },
  purpleblob: { id: 'purpleblob', name: 'Purple Blob', friendly: true, color: '#9b59b6', feed: { potato: 'purple' }, friendshipRequired: 5 },
  forestmonster: { id: 'forestmonster', name: 'Forest Monster', friendly: false, color: '#2e7d32', damage: 1 },
  lavabeast: { id: 'lavabeast', name: 'Lava Beast', friendly: false, color: '#d84315', damage: 2 },
  frostbeast: { id: 'frostbeast', name: 'Frost Beast', friendly: false, color: '#4dd0e1', damage: 2 },
  potatoKingMonster: { id: 'potatoKingMonster', name: 'Potato King Monster', friendly: true, color: '#f1c40f', feed: { potato: 'golden' }, friendshipRequired: 8 },
};

// Monster feed rewards
const MONSTER_REWARDS = {
  greenslime: [{ type: 'pet_egg', pet: 'babyslime', chance: 0.3 }, { type: 'item', item: 'seed', potato: 'common', qty: 2, chance: 0.4 }, { type: 'potato', potato: 'common', qty: 3, chance: 0.3 }],
  purpleblob: [{ type: 'pet_egg', pet: 'lavaslime', chance: 0.25 }, { type: 'potato', potato: 'purple', qty: 2, chance: 0.4 }, { type: 'seed', potato: 'purple', qty: 1, chance: 0.35 }],
  potatoKingMonster: [{ type: 'pet_egg', pet: 'potatodragon', chance: 0.1 }, { type: 'potato', potato: 'golden', qty: 2, chance: 0.5 }, { type: 'item', item: 'seed', potato: 'golden', qty: 1, chance: 0.4 }],
};

// Pets
const PETS = {
  potatopup: { id: 'potatopup', name: 'Potato Pup', rarity: 'common', bonus: { yield: 0.05 }, icon: '🐶', color: '#c9a35c' },
  farmcat: { id: 'farmcat', name: 'Farm Cat', rarity: 'common', bonus: { findBonus: 0.05 }, icon: '🐱', color: '#ff9800' },
  babyslime: { id: 'babyslime', name: 'Baby Slime', rarity: 'rare', bonus: { harvest: 0.05 }, icon: '🟢', color: '#4caf50' },
  lavaslime: { id: 'lavaslime', name: 'Lava Slime', rarity: 'epic', bonus: { lavaBoost: 0.1 }, icon: '🟠', color: '#ff5722' },
  frostfox: { id: 'frostfox', name: 'Frost Fox', rarity: 'epic', bonus: { frostBoost: 0.1 }, icon: '🦊', color: '#a3e4f7' },
  potatodragon: { id: 'potatodragon', name: 'Potato Dragon', rarity: 'legendary', bonus: { rareChance: 0.05 }, icon: '🐉', color: '#f1c40f' },
};

// Growth stages for potato plants
const GROWTH_STAGES = 5;

// XP per level: level N requires total xp
function xpForLevel(level) {
  return 100 * Math.pow(level, 1.5);
}

function levelFromXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
    if (level > 100) break;
  }
  return { level, remaining: xp, needed: xpForLevel(level) };
}

// Block catalog used client-side and server-side
const BLOCK_IDS = Object.keys(BLOCKS);

module.exports = {
  TILE_SIZE,
  LAND_WIDTH,
  LAND_HEIGHT,
  POTATO_TYPES,
  POTATO_ORDER,
  RARITY,
  BLOCKS,
  BLOCK_IDS,
  MACHINES,
  TOOLS,
  SEEDS,
  GEAR_SLOTS,
  GEAR_SETS,
  MONSTERS,
  MONSTER_REWARDS,
  PETS,
  GROWTH_STAGES,
  xpForLevel,
  levelFromXp,
};
