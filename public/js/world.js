// LANDBLOCK - Client world / grid handling
// Manages the land grid (blocks, plants, machines), block rendering, selection.

class World {
  constructor() {
    this.grid = null;
    this.width = CFG.LAND_WIDTH;
    this.height = CFG.LAND_HEIGHT;
    this.name = '';
    this.owner = null;        // 'me' or remote userId
    this.monsters = {};       // client-side copy for rendering local monsters
    this.visiting = false;
  }

  setLand(land, owner, isOwn) {
    this.grid = land.grid;
    this.width = land.width;
    this.height = land.height;
    this.name = land.name;
    this.owner = owner;
    this.visiting = !isOwn;
    // Do not copy monsters when visiting; monsters only from own land
  }

  // Tile helpers
  tileAt(px, py) {
    const tx = Math.floor(px / CFG.TILE_SIZE);
    const ty = Math.floor(py / CFG.TILE_SIZE);
    if (!this.grid || tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return null;
    return { tile: this.grid[ty][tx], x: tx, y: ty };
  }

  isSolid(tx, ty) {
    if (!this.grid || tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    const t = this.grid[ty][tx];
    const blk = CFG.BLOCKS[t.b];
    if (blk && (blk.solid || blk.blockMove)) return true;
    return false;
  }

  growPlants() {
    // Plants grow via server growthUpdate messages; no client-side logic needed.
  }

  // Draw a single tile at world pixel
  drawTile(g, tx, ty, scale, camX, camY) {
    if (!this.grid) return;
    const t = this.grid[ty][tx];
    if (!t) return;
    const TS = CFG.TILE_SIZE;
    const px = (tx * TS - camX) * scale;
    const py = (ty * TS - camY) * scale;
    const blk = CFG.BLOCKS[t.b];

    this.drawBlockSprite(g, t.b, px, py, scale, t);
  }

  drawBlockSprite(g, id, px, py, scale, tile) {
    const TS = CFG.TILE_SIZE;
    const size = TS * scale;
    const def = CFG.BLOCKS[id];
    const c = def ? def.color : '#f0f';
    g.fillStyle = c;
    g.fillRect(px, py, size, size);

    // Texture variations
    switch (id) {
      case 'grass':
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(px, py, size, 2*scale);
        break;
      case 'dirt':
        g.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 5; i++) {
          const sx = px + ((i*7)%Math.max(1,TS))*scale;
          const sy = py + ((i*5)%Math.max(1,TS))*scale;
          g.fillRect(sx, sy, 2*scale, 2*scale);
        }
        break;
      case 'farm':
        g.fillStyle = '#8b5a2b';
        g.fillRect(px, py, size, size);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        // furrows
        for (let i = 0; i < TS; i += 4) {
          g.fillRect(px + (i*scale), py + size/2 - 1*scale, size, 2*scale);
        }
        break;
      case 'stone':
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(px + 3*scale, py + 2*scale, 4*scale, 4*scale);
        g.fillRect(px + 9*scale, py + 8*scale, 4*scale, 4*scale);
        break;
      case 'brick':
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(px, py, size, 2*scale);
        g.fillRect(px, py + size/2, size, 2*scale);
        break;
      case 'wood':
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillRect(px, py, 2*scale, size);
        g.fillRect(px + size - 2*scale, py, 2*scale, size);
        break;
      case 'leaves':
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.fillRect(px + 3*scale, py + 3*scale, 4*scale, 4*scale);
        break;
      case 'water':
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(px, py + (t._wave||0)*scale, size, 3*scale);
        break;
      case 'bedrock':
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(px, py, size, 2*scale);
        break;
      case 'glass':
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(px + 2*scale, py + 2*scale, size - 4*scale, size - 4*scale);
        break;
      case 'fence':
        g.fillStyle = '#6d4c41';
        g.fillRect(px, py, size, 3*scale);
        g.fillRect(px, py + size/2, size, 3*scale);
        g.fillStyle = '#5d4037';
        g.fillRect(px + 2*scale, py, 2*scale, size);
        g.fillRect(px + size-4*scale, py, 2*scale, size);
        break;
      case 'path':
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(px + 2*scale, py + 2*scale, 3*scale, 3*scale);
        g.fillRect(px + 8*scale, py + 8*scale, 3*scale, 3*scale);
        break;
    }

    // Locked indicator
    if (tile && tile.locked && !this.visiting) {
      g.fillStyle = 'rgba(200,40,40,0.6)';
      const lw = size * 0.4;
      g.fillRect(px + (size-lw)/2, py + (size-lw)/2, lw, lw);
    }

    // Plant
    if (tile && tile.p) {
      this.drawPlant(g, tile.p, px, py, scale);
    }

    // Machine
    if (tile && tile.m) {
      this.drawMachine(g, tile.m, px, py, scale);
    }
  }

  drawPlant(g, plant, px, py, scale) {
    const TS = CFG.TILE_SIZE;
    const stage = plant.stage;
    const potatoType = plant.potatoId || 'common';
    const color = POTATO_COLORS[potatoType] || '#c9a35c';

    g.save();
    // Draw plant up from ground (tile bottom)
    const baseY = py + TS * scale;
    const heights = [2, 4, 7, 10, 13];

    if (stage >= 1) {
      const h = heights[Math.min(stage, heights.length - 1)] * scale;
      // stem
      g.fillStyle = '#3d8b37';
      g.fillRect(px + TS*scale/2 - 1*scale, baseY - h, 2*scale, h);
      // leaves
      g.fillStyle = '#5aa74a';
      if (stage >= 2) {
        g.fillRect(px + TS*scale/2 - 5*scale, baseY - h/2, 3*scale, 2*scale);
        g.fillRect(px + TS*scale/2 + 2*scale, baseY - h/2, 3*scale, 2*scale);
      }
      if (stage >= 3) {
        g.fillRect(px + TS*scale/2 - 4*scale, baseY - h, 3*scale, 2*scale);
        g.fillRect(px + TS*scale/2 + 1*scale, baseY - h, 3*scale, 2*scale);
      }
    }

    // When fully grown, show potato
    if (stage >= CFG.GROWTH_STAGES - 1) {
      g.fillStyle = color;
      const ps = 6 * scale;
      g.fillRect(px + TS*scale/2 - ps/2, baseY - ps - 1*scale, ps, ps);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(px + TS*scale/2 - ps/2 + 1, baseY - ps - 1*scale + 1, 2*scale, 2*scale);
    }
    g.restore();
  }

  drawMachine(g, mid, px, py, scale) {
    const TS = CFG.TILE_SIZE;
    const size = TS * scale;
    g.save();
    g.fillStyle = '#546e7a';
    g.fillRect(px + 1*scale, py + 1*scale, size - 2*scale, size - 2*scale);
    g.fillStyle = '#37474f';
    g.fillRect(px + 3*scale, py + 3*scale, size - 6*scale, size - 6*scale);
    // Face
    g.fillStyle = '#7ed957';
    g.fillRect(px + 4*scale, py + 4*scale, size - 8*scale, size - 8*scale);
    g.fillStyle = '#263238';
    g.fillRect(px + 4*scale, py + 4*scale, size - 8*scale, 2*scale);
    g.restore();
  }
}
