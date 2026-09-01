// LANDBLOCK - Client config (mirrors server gameData, injected via config payload)
// Holds all game definitions used by the client. Defaults get replaced by server config.
const CFG = {
  TILE_SIZE: 16,
  LAND_WIDTH: 80,
  LAND_HEIGHT: 48,
  POTATO_TYPES: {},
  POTATO_ORDER: [],
  RARITY: {},
  BLOCKS: {},
  MACHINES: {},
  TOOLS: {},
  SEEDS: {},
  GEAR_SLOTS: ['hat', 'shirt', 'pants', 'shoes', 'back'],
  GEAR_SETS: {},
  MONSTERS: {},
  PETS: {},
  GROWTH_STAGES: 5,
};

const POTATO_COLORS = {
  common: '#c9a35c', purple: '#9b59b6', golden: '#f1c40f',
  frost: '#a3e4f7', lava: '#e74c3c', mutated: '#2ecc71',
};

const SEED_BY_POTATO = {
  common: 'common_seed', purple: 'purple_seed', golden: 'golden_seed',
  frost: 'frost_seed', lava: 'lava_seed', mutated: 'mutated_seed',
};

const GEAR_SET_BONUS_TEXT = {
  farmer: 'Increased potato harvesting',
  potatoKing: 'Increased rare potato chance',
  lava: 'Improved Lava Potato farming',
  frost: 'Improved Frost Potato farming',
};

const PET_ICONS = {
  potatopup: '🐶', farmcat: '🐱', babyslime: '🟢', lavaslime: '🟠', frostfox: '🦊', potatodragon: '🐉',
};

const MONSTER_ICONS = {
  greenslime: '🟢', purpleblob: '🟣', forestmonster: '🌲', lavabeast: '🔥', frostbeast: '❄️', potatoKingMonster: '👑',
};

const TOOL_ICONS = {
  wooden_hoe: '🌾', iron_hoe: '⛏️', crystal_hoe: '💎', lava_hoe: '🔥', legendary_hoe: '👑',
};
