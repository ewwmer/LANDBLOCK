// LANDBLOCK - Client rendering module (canvas, camera, sky, tiles, entities)

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.scale = 2;
    this.resize();
    this.bgImage = this.makeBackground();
    this.waveOffset = 0;
  }

  resize() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  // Pre-render a nice pixel gradient sky + clouds + hills
  makeBackground() {
    const w = 320, h = 180;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // Sky
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5bb0e8');
    grad.addColorStop(0.6, '#8ed0f0');
    grad.addColorStop(1, '#aee5ee');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Sun
    g.fillStyle = '#ffe680';
    g.fillRect(w - 70, 30, 24, 24);
    g.fillStyle = '#fff3b0';
    g.fillRect(w - 66, 34, 16, 16);
    // Clouds
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const cx = (i * 70) % w, cy = 30 + (i % 3) * 30;
      g.fillRect(cx, cy, 30, 8);
      g.fillRect(cx + 8, cy - 6, 16, 6);
    }
    // Distant hills
    g.fillStyle = '#6aa84f';
    g.fillRect(0, 120, w, 60);
    g.fillStyle = '#547a3e';
    for (let i = 0; i < w; i += 8) {
      const hh = 30 + ((i * 13) % 40);
      g.fillRect(i, 120 - hh + 60, 8, hh);
    }
    return c;
  }

  update(dt) {
    this.waveOffset += dt * 3;
  }

  // Follow camera
  follow(target, worldPx, worldPxH) {
    const vw = this.canvas.width, vh = this.canvas.height;
    let cx = target.x + target.w / 2 - vw / 2 / this.scale;
    let cy = target.y + target.h / 2 - vh / 2 / this.scale;
    // Clamp to world
    cx = Math.max(0, Math.min(worldPx - vw / this.scale, cx));
    cy = Math.max(0, Math.min((worldPxH || worldPx) - vh / this.scale, cy));
    this.cam.x = cx;
    this.cam.y = cy;
  }

  render(game) {
    const g = this.g;
    const scale = this.scale;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Sky (fixed background)
    g.fillStyle = '#5bb0e8';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Parallax background tile
    const bgScale = scale;
    const bgW = this.bgImage.width * bgScale;
    const tiled = Math.ceil(this.canvas.width / bgW) + 2;
    const bgoff = (this.cam.x * 0.3) % bgW;
    for (let i = -1; i < tiled; i++) {
      g.drawImage(this.bgImage, i * bgW - bgoff, 0, bgW, this.bgImage.height * bgScale);
    }

    const world = game.world;
    if (!world.grid) return;
    const TS = CFG.TILE_SIZE;
    const worldPxW = world.width * TS;
    const worldPxH = world.height * TS;

    const x0 = Math.max(0, Math.floor(this.cam.x / TS));
    const y0 = Math.max(0, Math.floor(this.cam.y / TS));
    const x1 = Math.min(world.width - 1, Math.ceil((this.cam.x + this.canvas.width / scale) / TS));
    const y1 = Math.min(world.height - 1, Math.ceil((this.cam.y + this.canvas.height / scale) / TS));

    // Draw tiles
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        world.drawTile(g, tx, ty, scale, Math.round(this.cam.x), Math.round(this.cam.y));
      }
    }

    // Player
    game.player.draw(g, this.cam, scale);

    // Remote players
    for (const rp of game.remotePlayers.values()) {
      rp.draw(g, this.cam, scale);
    }

    // Pets (active pet following player)
    if (game.player.data && game.player.data.activePet) {
      this.drawPet(g, game, game.player.data.activePet, game.player.x - 8, game.player.y + 4);
    }

    // Monsters on own land
    if (!world.visiting) {
      for (const id in world.monsters) {
        const mon = world.monsters[id];
        this.drawMonster(g, game, mon);
      }
    }

    // Selection cursor
    if (game.selection && !game.isOverUI) {
      this.drawSelection(g, game.selection, scale);
    }
  }

  drawSelection(g, sel, scale) {
    const TS = CFG.TILE_SIZE;
    const px = (sel.tx * TS - this.cam.x) * scale;
    const py = (sel.ty * TS - this.cam.y) * scale;
    g.strokeStyle = '#ffd54f';
    g.lineWidth = 2;
    g.strokeRect(px, py, TS * scale, TS * scale);
    g.fillStyle = 'rgba(255,213,79,0.2)';
    g.fillRect(px, py, TS * scale, TS * scale);
  }

  drawPet(g, game, petId, x, y) {
    const s = this.scale;
    const px = (x - this.cam.x) * s;
    const py = (y - this.cam.y) * s;
    const pet = CFG.PETS[petId];
    const color = pet ? pet.color : '#ff9800';
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(px, py + 12 * s, 14 * s, 4 * s);
    g.fillStyle = color;
    g.fillRect(px, py + 4 * s, 10 * s, 8 * s);
    g.fillRect(px + 3 * s, py + 0 * s, 4 * s, 4 * s);
    g.fillStyle = '#262626';
    g.fillRect(px + 2 * s, py + 6 * s, 2 * s, 2 * s);
    g.fillRect(px + 6 * s, py + 6 * s, 2 * s, 2 * s);
  }

  drawMonster(g, game, mon) {
    const s = this.scale;
    const def = CFG.MONSTERS[mon.type];
    if (!def) return;
    const color = def.color;
    const px = (mon.x - this.cam.x) * s;
    const py = (mon.y - this.cam.y) * s;
    // bob
    const bob = Math.sin(game.time * 4 + mon.x) * 2;

    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px, py + 18 * s, 18 * s, 4 * s);
    // body
    g.fillStyle = color;
    g.fillRect(px + 2 * s, py + (6 + bob) * s, 14 * s, 12 * s);
    g.fillRect(px + 4 * s, py + (2 + bob) * s, 8 * s, 6 * s);
    // eyes
    g.fillStyle = '#fff';
    g.fillRect(px + 4 * s, py + (8 + bob) * s, 3 * s, 3 * s);
    g.fillRect(px + 11 * s, py + (8 + bob) * s, 3 * s, 3 * s);
    g.fillStyle = '#262626';
    g.fillRect(px + 5 * s, py + (9 + bob) * s, 2 * s, 2 * s);
    g.fillRect(px + 12 * s, py + (9 + bob) * s, 2 * s, 2 * s);

    // friendship hearts above
    if (mon.friendship > 0) {
      g.font = `${8*s}px 'Press Start 2P'`;
      g.textAlign = 'center';
      const hearts = Math.min(5, mon.friendship);
      g.fillStyle = '#ff5b5b';
      g.fillText('❤'.repeat(hearts), px + 9 * s, py - 4 * s);
    }
    // name
    g.fillStyle = '#fff';
    g.font = `${6*s}px 'Press Start 2P'`;
    g.textAlign = 'center';
    g.fillText(def.name, px + 9 * s, py - 12 * s);
  }
}
