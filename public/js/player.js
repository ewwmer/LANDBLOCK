// LANDBLOCK - Client player entity
// Handles local player movement, physics, and the player sprite rendering.

class LocalPlayer {
  constructor() {
    this.data = null;        // full snapshot from server
    this.x = 0; this.y = 0;  // tile pixel position (top-left of feet tile area)
    this.vx = 0; this.vy = 0;
    this.w = 12; this.h = 24;
    this.dir = 1;
    this.onGround = false;
    this.moving = false;
    this.vel = { x: 0, y: 0 };
    this.speed = 120;        // px/sec
    this.jumpForce = -330;
    this.gravity = 700;
    this.attacking = false;
    this.renderX = 0; this.renderY = 0;
  }

  setData(d) {
    this.data = d;
    if (d.position) { this.x = d.position.x; this.y = d.position.y; }
    else if (d.spawn) { this.x = d.spawn.x; this.y = d.spawn.y; }
    this.renderX = this.x; this.renderY = this.y;
  }

  // Update physics against the world grid. worldH is height in tiles of current active grid.
  update(dt, grid) {
    const TS = CFG.TILE_SIZE;
    const input = Game.input;

    let ix = 0, iy = 0;
    if (input.isDown('a') || input.isDown('left')) { ix -= 1; }
    if (input.isDown('d') || input.isDown('right')) { ix += 1; }
    if (ix !== 0) { this.dir = ix; this.moving = true; } else this.moving = false;

    // Horizontal
    this.vel.x = ix * this.speed;
    this.x += this.vel.x * dt;

    // Collision horizontal (check tile solidity)
    const feet = this.y + this.h;
    const head = this.y;
    const left = this.x;
    const right = this.x + this.w;

    const checkCollide = (px, py) => {
      const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
      const tile = (grid[ty] && grid[ty][tx]);
      if (!tile) return false;
      const blk = CFG.BLOCKS[tile.b];
      // Solid tiles block movement
      if (blk && (blk.solid || blk.blockMove)) return true;
      // Farm blocks are solid-ish
      if (tile.b === 'farm') return true;
      return false;
    };

    // Horizontal collision test
    if (this.vel.x !== 0) {
      const dir = Math.sign(this.vel.x);
      const frontX = dir > 0 ? right : left;
      if (checkCollide(frontX + 1 * dir, head + 4) || checkCollide(frontX + 1 * dir, feet - 2)) {
        this.x = dir > 0 ? (Math.floor((left + this.w) / TS) * TS - this.w - 0.01) : (Math.ceil(left / TS) * TS + 0.01);
        this.vel.x = 0;
      }
    }

    // Gravity
    this.vel.y += this.gravity * dt;
    this.y += this.vel.y * dt;

    // Vertical collision
    this.onGround = false;
    const footY = this.y + this.h;
    if (this.vel.y >= 0) {
      if (checkCollide(left + 2, footY + 1) || checkCollide(right - 2, footY + 1)) {
        this.y = Math.floor(footY / TS) * TS - this.h - 0.01;
        this.vel.y = 0;
        this.onGround = true;
      }
    } else {
      if (checkCollide(left + 2, head - 1) || checkCollide(right - 2, head - 1)) {
        this.y = Math.ceil(head / TS) * TS + 0.01;
        this.vel.y = 0;
      }
    }

    // Grounded jump
    if ((input.pressed('w') || input.pressed('up') || input.pressed('space')) && this.onGround) {
      this.vel.y = this.jumpForce;
      this.onGround = false;
    }

    // Clamp to world
    if (!grid) return;
    const worldH = grid.length;
    const worldW = grid[0].length;
    if (this.x < TS) this.x = TS;
    if (this.x + this.w > worldW * TS - TS) this.x = worldW * TS - TS - this.w;
    if (this.y + this.h > worldH * TS) { this.y = worldH * TS - this.h; this.vel.y = 0; }

    this.renderX += (this.x - this.renderX) * Math.min(1, dt * 15);
    this.renderY += (this.y - this.renderY) * Math.min(1, dt * 15);
  }

  sendState() {
    Game.net.send('move', {
      x: Math.round(this.x), y: Math.round(this.y),
      dir: this.dir, moving: this.moving,
    });
  }

  draw(g, cam, scale) {
    const x = this.x, y = this.y;
    const px = (x - cam.x) * scale;
    const py = (y - cam.y) * scale;
    const s = scale;

    // Shadow
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px - 2, py + this.h * s - 4, (this.w + 4) * s, 4 * s);

    const eq = (this.data && this.data.equipment) || {};
    const skin = '#f0c090';

    // Legs (shoes)
    const showPants = eq.pants ? true : false;
    g.fillStyle = showPants ? '#3e6b3e' : '#4a7ab5';
    g.fillRect(px + 2*s, py + 16*s, 3*s, 3*s);
    g.fillRect(px + 7*s, py + 16*s, 3*s, 3*s);
    // Shoes
    g.fillStyle = '#5a3b2a';
    g.fillRect(px + 1*s, py + 19*s, 4*s, 2*s);
    g.fillRect(px + 7*s, py + 19*s, 4*s, 2*s);

    // Body
    const shirtColor = eq.shirt ? shirtColorFor(eq.shirt) : '#e67e22';
    g.fillStyle = shirtColor;
    g.fillRect(px + 1*s, py + 9*s, 10*s, 8*s);

    // Head
    g.fillStyle = skin;
    g.fillRect(px + 2*s, py + 2*s, 8*s, 7*s);

    // Eyes
    g.fillStyle = '#262626';
    const ex = this.dir > 0 ? px + 7*s : px + 3*s;
    g.fillRect(ex, py + 4*s, 2*s, 2*s);

    // Hat
    if (eq.hat) {
      switch (eq.hat.setId) {
        case 'farmer': g.fillStyle = '#d4ac0d'; g.fillRect(px + 1*s, py + 0*s, 10*s, 3*s); break;
        case 'potatoKing': g.fillStyle = '#f1c40f'; g.fillRect(px + 2*s, py + 0*s, 8*s, 3*s); g.fillRect(px + 4*s, py + -2*s, 4*s, 3*s); break;
        case 'lava': g.fillStyle = '#d84315'; g.fillRect(px + 2*s, py + 0*s, 8*s, 3*s); break;
        case 'frost': g.fillStyle = '#4dd0e1'; g.fillRect(px + 2*s, py + 0*s, 8*s, 3*s); break;
        default: g.fillStyle = '#8d6e63'; g.fillRect(px + 1*s, py + 0*s, 10*s, 3*s);
      }
    } else {
      g.fillStyle = '#8d6e63';
      g.fillRect(px + 2*s, py + 0*s, 8*s, 2*s);
    }

    // Back accessory
    if (eq.back) {
      g.fillStyle = accentForSlot(eq.back);
      g.fillRect(this.dir > 0 ? px - 3*s : px + 11*s, py + 9*s, 3*s, 6*s);
    }
  }
}

function shirtColorFor(piece) {
  switch (piece.setId) {
    case 'farmer': return '#e67e22';
    case 'potatoKing': return '#9c27b0';
    case 'lava': return '#d84315';
    case 'frost': return '#4dd0e1';
    default: return '#e67e22';
  }
}
function accentForSlot(piece) {
  switch (piece.setId) {
    case 'farmer': return '#8d6e63';
    case 'potatoKing': return '#f1c40f';
    case 'lava': return '#ff5722';
    case 'frost': return '#a3e4f7';
    default: return '#a1887f';
  }
}

// Remote players (rendered from net updates)
class RemotePlayer {
  constructor(id, username) {
    this.id = id; this.username = username;
    this.x = 0; this.y = 0; this.dir = 1; this.moving = false;
    this.renderX = 0; this.renderY = 0;
    this.activePet = null; this.equipment = {};
  }
  updateFrom(n) {
    this.dir = n.dir === undefined ? this.dir : n.dir;
    this.moving = !!n.moving;
    this.equipment = n.equipment || this.equipment;
    this.activePet = n.activePet;
    this.renderX += (n.x - this.renderX) * 0.3;
    this.renderY += (n.y - this.renderY) * 0.3;
    if (Math.abs(n.x - this.renderX) > 50) { this.renderX = n.x; this.renderY = n.y; }
  }
  draw(g, cam, scale) {
    const s = scale;
    const px = (this.renderX - cam.x) * s;
    const py = (this.renderY - cam.y) * s - 24 * s;
    // draw a simple remote player at position
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px - 2, py + 20*s, 20*s, 4*s);
    const eq = this.equipment || {};
    g.fillStyle = eq.shirt ? shirtColorFor(eq.shirt) : '#3498db';
    g.fillRect(px + 2*s, py + 8*s, 12*s, 9*s);
    g.fillStyle = '#f0c090';
    g.fillRect(px + 4*s, py + 2*s, 8*s, 7*s);
    g.fillStyle = '#262626';
    g.fillRect(this.dir > 0 ? px + 9*s : px + 5*s, py + 4*s, 2*s, 2*s);
    if (eq.hat && eq.hat.setId === 'potatoKing') { g.fillStyle = '#f1c40f'; g.fillRect(px + 5*s, py - 1*s, 6*s, 3*s); }
    // name
    g.fillStyle = '#fff';
    g.font = `${6*s}px 'Press Start 2P'`;
    g.textAlign = 'center';
    g.fillText(this.username, px + (this.w || 16)*s / 2, py - 4);
  }
}
