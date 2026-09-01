// LANDBLOCK - Main client entry point: game loop, input, world interaction

class Game {
  static get instance() { return window.Game; }

  constructor() {
    this.canvas = document.getElementById('canvas');
    this.renderer = new Renderer(this.canvas);
    this.world = new World();
    this.player = new LocalPlayer();
    this.inventory = new PlayerInventory(this);
    this.ui = new UI(this);
    this.net = new Net(this);
    this.input = new InputHandler(this);
    this.remotePlayers = new Map();
    this.time = 0;
    this.authenticated = false;
    this.selection = null;
    this.isOverUI = false;
    this.placeDelay = 0;
    this.mode = { action: 'place', quantity: 1 };
    this.machinePos = null;

    window.Game = this;
    this.bindUI();
    this.requestFrame();
  }

  bindUI() {
    const $ = id => document.getElementById(id);
    $('loginBtn').addEventListener('click', () => this.login());
    ['loginUser', 'loginPass'].forEach(id => {
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') this.login(); });
    });

    // Side buttons
    document.querySelectorAll('.side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        if (!this.authenticated) return;
        switch (panel) {
          case 'shop': this.ui.showShop(this.player.data); break;
          case 'pets': this.ui.showPets(this.player.data); break;
          case 'gear': this.ui.showGear(this.player.data); break;
          case 'land': this.ui.showLand(this.player.data); break;
          case 'settings': this.ui.showSettings(); break;
          case 'visit': this.ui.showVisit(); break;
          case 'trades': this.showTradeMenu(); break;
        }
      });
    });

    $('profileBtn').addEventListener('click', () => { if (this.authenticated) this.ui.showProfile(this.player.data); });
    $('leaderboardBtn').addEventListener('click', () => { if (this.authenticated) this.net.send('getLeaderboard'); });
    $('invBtn').addEventListener('click', () => { if (this.authenticated) this.inventory.renderPanel(this.player.data); });
    $('chatBtn').addEventListener('click', () => {
      const box = $('chatBox');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) $('chatInput').focus();
    });
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = $('chatInput').value;
        if (text.trim()) { this.net.send('chat', { text }); }
        $('chatInput').value = '';
        $('chatBox').classList.add('hidden');
      }
    });

    // Canvas clicks (world interaction)
    this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouse(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(e); });
    this.canvas.addEventListener('mousemove', (e) => this.updateTooltip(e));

    window.addEventListener('resize', () => this.renderer.resize());

    // Keyboard numbers for hotbar
    window.addEventListener('keydown', (e) => {
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 8) {
        this.inventory.select(num - 1);
      }
      if (e.key === 'e' || e.key === 'E') {
        if (this.authenticated) { if (this.ui.activePanel) this.ui.closePanel(); else this.inventory.renderPanel(this.player.data); }
      }
    });

    // Trade panel buttons
    $('tradeLockBtn').addEventListener('click', () => this.net.send('tradeLock'));
    $('tradeUnlockBtn').addEventListener('click', () => this.net.send('tradeUnlock'));
    $('tradeConfirmBtn').addEventListener('click', () => this.net.send('tradeConfirm'));
    $('tradeCancelBtn').addEventListener('click', () => this.net.send('tradeCancel'));
  }

  login() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    if (!user) { document.getElementById('loginError').textContent = 'Enter a username.'; return; }
    this.net.connect(user, pass);
  }

  onAuth(self, config) {
    this.authenticated = true;
    Object.assign(CFG, config);
    this.player.setData(self);
    // own land
    this.world.setLand(self.land, self.id, true);
    this.world.monsters = self.monsters || {};
    this.player.data = self;
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.inventory.buildHotbar(self);
    this.ui.updateHUD(self);
    this.renderer.follow(this.player, this.world.width * CFG.TILE_SIZE);
  }

  addRemotePlayer(p) {
    if (p.id === this.net.selfId) return;
    const rp = new RemotePlayer(p.id, p.username);
    rp.x = p.x || 0; rp.y = p.y || 0;
    this.remotePlayers.set(p.id, rp);
  }
  removeRemotePlayer(id) {
    this.remotePlayers.delete(id);
  }
  updateRemotePlayers(list) {
    for (const p of list) {
      const rp = this.remotePlayers.get(p.id);
      if (rp) rp.updateFrom(p);
    }
  }

  onChat(msg) {
    const log = document.getElementById('chatLog');
    const line = document.createElement('div');
    if (msg.id === this.net.selfId) {
      line.dataset.self = '1';
    }
    line.innerHTML = `<span class="name">${escapeHtml(msg.username)}:</span> ${escapeHtml(msg.text)}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  onDisconnect() {
    this.toast('Disconnected from server.', true);
    setTimeout(() => location.reload(), 2000);
  }

  toast(text, err) { this.ui.toast(text, err); }

  zoomIn() { this.renderer.scale = Math.min(4, this.renderer.scale + 0.5); this.renderer.resize(); }
  zoomOut() { this.renderer.scale = Math.max(1, this.renderer.scale - 0.5); this.renderer.resize(); }

  logout() {
    location.reload();
  }

  showTradeMenu() {
    this.ui.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🔄 Trade <span class="close-btn" onclick="Game.ui.closePanel()">✕</span>
        <div class="row"><input id="tradeUser" class="pixel-input" placeholder="Player to trade with" style="flex:1">
        <button id="tradeSend" class="pixel-btn">Request</button></div>`;
      c.appendChild(panel);
      document.getElementById('tradeSend').addEventListener('click', () => {
        this.net.send('tradeRequest', { username: document.getElementById('tradeUser').value });
        this.ui.closePanel();
      });
    });
  }

  tradeAddPotato() {
    const t = this.ui.trade;
    if (!t) return;
    this.net.send('tradeAdd', { what: 'potato', id: 'common', qty: 5 });
  }
  tradeRemoveAll() {
    const t = this.ui.trade;
    if (!t) return;
    this.net.send('tradeReset', {});
  }

  // ---- World interaction ----
  screenToWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const scale = this.renderer.scale;
    const wx = this.renderer.cam.x + sx / scale;
    const wy = this.renderer.cam.y + sy / scale;
    return { wx, wy };
  }

  onMouseMove(e) {
    const { wx, wy } = this.screenToWorld(e);
    const hit = this.world.tileAt(wx, wy);
    if (hit) this.selection = { tx: hit.x, ty: hit.y };
    else this.selection = null;
  }

  updateTooltip(e) {
    const tip = document.getElementById('tooltip');
    const { wx, wy } = this.screenToWorld(e);
    const hit = this.world.tileAt(wx, wy);
    if (!hit || !this.authenticated) { tip.classList.add('hidden'); return; }
    const t = this.world.grid[hit.y][hit.x];
    const blk = CFG.BLOCKS[t.b];
    let text = blk ? blk.name : '?';
    if (t.p) {
      const ptype = CFG.POTATO_TYPES[t.p.potatoId] || CFG.POTATO_TYPES.common;
      const stage = CFG.GROWTH_STAGES;
      text += ` • ${ptype.name} (stage ${t.p.stage + 1}/${stage})`;
      if (t.p.stage >= stage - 1) text += ' READY!';
    }
    if (t.m) text += ` • ${CFG.MACHINES[t.m] ? CFG.MACHINES[t.m].name : t.m}`;
    tip.textContent = text;
    tip.style.left = (e.clientX + 12) + 'px';
    tip.style.top = (e.clientY + 12) + 'px';
    tip.classList.remove('hidden');
  }

  onCanvasMouse(e) {
    if (!this.authenticated) return;
    if (e.button === 0) this.handleAction(e, false);
  }
  onRightClick(e) {
    if (!this.authenticated) return;
    this.handleAction(e, true);
  }

  handleAction(e, isRight) {
    if (this.world.visiting) {
      this.toast('You are visiting. Use Return to My Land to edit your own land.', true);
      return;
    }
    const { wx, wy } = this.screenToWorld(e);
    const hit = this.world.tileAt(wx, wy);
    if (!hit) return;
    const t = this.world.grid[hit.y][hit.x];
    const selected = this.inventory.getSelected();

    // Left click primary action
    if (!isRight) {
      // If tile has a machine -> open machine
      if (t.m && !this.world.visiting) {
        this.ui.showMachine(t.m, { x: hit.x, y: hit.y });
        return;
      }
      // If plant ready -> harvest
      if (t.p && t.p.stage >= CFG.GROWTH_STAGES - 1) {
        this.net.send('harvest', { x: hit.x, y: hit.y });
        return;
      }
      // Determine action from hotbar selection
      if (selected && selected.kind === 'blocks') {
        this.net.send('placeBlock', { blockId: selected.id, x: hit.x, y: hit.y });
      } else if (selected && selected.kind === 'seeds') {
        this.net.send('plantSeed', { seedId: selected.id, x: hit.x, y: hit.y });
      } else if (selected && selected.kind === 'tool') {
        // Tool: break if holding hoe on farm? Actually hoe breaks blocks
        this.net.send('breakBlock', { x: hit.x, y: hit.y });
      } else {
        this.net.send('breakBlock', { x: hit.x, y: hit.y });
      }
    } else {
      // Right click: break block
      // If a monster is here, feed it
      const mon = this.findMonsterAtScreen(wx, wy);
      if (mon) {
        this.ui.showMonster(mon, this.findMonsterId(mon));
        return;
      }
      this.net.send('breakBlock', { x: hit.x, y: hit.y });
    }
  }

  findMonsterAtScreen(wx, wy) {
    for (const id in this.world.monsters) {
      const mon = this.world.monsters[id];
      if (Math.abs(mon.x - wx) < 20 && Math.abs(mon.y - wy) < 20) return mon;
    }
    return null;
  }
  findMonsterId(mon) {
    for (const id in this.world.monsters) if (this.world.monsters[id] === mon) return id;
    return null;
  }

  // Handle server action results
  onActionResult(msg) {
    const self = this.player;
    switch (msg.type) {
      case 'refreshPlayer': {
        if (msg.data) {
          const wasVisiting = this.world.visiting;
          this.player.setData(msg.data);
          this.player.data = msg.data;
          this.ui.updateHUD(msg.data);
          this.inventory.buildHotbar(msg.data);
          // Only reset to own land if we are NOT currently visiting
          if (!wasVisiting && msg.data.land) {
            this.world.setLand(msg.data.land, msg.data.id, true);
            this.world.monsters = msg.data.monsters || {};
          }
        }
        break;
      }
      case 'placeBlock': if (msg.error) this.toast(msg.error, true); break;
      case 'breakBlock': if (msg.error) this.toast(msg.error, true); else this.toast('+1 block'); break;
      case 'plantSeed': if (msg.error) this.toast(msg.error, true); else this.toast('Planted!'); break;
      case 'harvest':
        if (msg.error) this.toast(msg.error, true);
        else {
          const p = CFG.POTATO_TYPES[msg.potato];
          this.toast(`Harvested ${msg.harvested}x ${p ? p.name : ''} 🥔!`);
          this.refreshSelf();
        }
        break;
      case 'setActiveTool': this.toast('Tool equipped!'); break;
      case 'equipGear': if (msg.error) this.toast(msg.error, true); else { this.toast('Equipped!'); this.refreshSelf(); } break;
      case 'unequipGear': if (msg.error) this.toast(msg.error, true); else this.refreshSelf(); break;
      case 'hatchPet':
        if (msg.error) this.toast(msg.error, true);
        else { this.toast('A new pet hatched!'); this.refreshSelf(); }
        break;
      case 'setActivePet': if (!msg.error) { this.toast('Active pet set!'); this.refreshSelf(); } break;
      case 'machine':
        if (msg.error) this.toast(msg.error, true);
        else { this.toast(msg.message); this.refreshSelf(); }
        break;
      case 'feedMonster':
        if (msg.error) this.toast(msg.error, true);
        else {
          this.toast('Monster is happy! 🥰');
          if (msg.reward) this.toast(msg.reward.text);
          this.refreshSelf();
        }
        break;
      case 'buySeed': if (msg.error) this.toast(msg.error, true); else { this.toast('Purchased seeds!'); this.refreshSelf(); } break;
      case 'sellPotato': if (msg.error) this.toast(msg.error, true); else { this.toast(`Sold ${msg.sold} for ${msg.sold * (CFG.POTATO_TYPES[msg.potato].value)} 🪙`); this.refreshSelf(); } break;
      case 'buyBlock': this.refreshSelf(); break;
      case 'craftTool':
        if (msg.ok) { this.toast('Crafted!'); this.refreshSelf(); }
        else if (msg.error) this.toast(msg.error, true);
        break;
      case 'setLandName': this.refreshSelf(); break;
      case 'setLandPrivate': this.toast('Land privacy updated.'); this.refreshSelf(); break;
      case 'returnHome': this.player.x = msg.spawn.x; this.player.y = msg.spawn.y; break;
      case 'visitTarget':
        if (msg.error) this.toast(msg.error, true);
        else {
          // Set world to visited land
          this.world.setLand(msg.land, msg.ownerId, false);
          this.world.name = msg.land.name;
          // Reposition player to visit location near spawn
          this.player.x = msg.land.spawnX * 16 || CFG.TILE_SIZE * 10;
          this.player.y = msg.land.spawnY * 16 || 300;
          this.toast(`Now visiting ${msg.ownerName}'s land!`);
          this.inventory.buildHotbar(this.player.data);
        }
        break;
      case 'getLeaderboard': this.ui.showLeaderboard(msg.leaderboard); break;
      case 'growthUpdate':
        // grid updated for own land growth
        if (!this.world.visiting && msg.grid) {
          // server sent full grid; update our world grid
          this.world.grid = msg.grid;
          // re-link monsters
          for (const id in this.world.monsters) { /* monster objects remain */ }
        }
        break;
      case 'visitLandUpdate':
        if (this.world.visiting && msg.grid) this.world.grid = msg.grid;
        break;
    }

    // After many actions rebuild hotbar (counts change)
    switch (msg.type) {
      case 'placeBlock': case 'breakBlock': case 'plantSeed': case 'harvest':
      case 'buySeed': case 'sellPotato': case 'craftTool': case 'buyBlock':
      case 'machine': case 'feedMonster':
        if (self.data) this.inventory.buildHotbar(self.data);
        break;
    }
  }

  refreshSelf() {
    // Re-fetch latest data via a lightweight sync - we don't have a dedicated fetch,
    // so reload from last snapshot + optimistic. For simplicity re-request auth won't work.
    // We rely on actionResult including updated fields mostly. Request full state:
    this.net.send('getState', {});
  }

  // Request full state snapshot
  requestState() {
    this.net.send('getState', {});
  }

  // ---- Game loop ----
  requestFrame() {
    const loop = (now) => {
      this.loop(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  loop(now) {
    if (!this._last) this._last = now;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time = now / 1000;

    if (!this.authenticated) {
      // Render a preview background
      this.renderer.g.drawImage(this.renderer.bgImage, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    // Update physics
    this.player.update(dt, this.world.grid);
    this.player.sendState();

    // wave animation for water tiles
    this.wave =
      this.wave === undefined ? 0 : (this.wave + dt * 3) % 3;
    for (let ty = 0; ty < this.world.grid.length; ty++) {
      for (let tx = 0; tx < this.world.grid[0].length; tx++) {
        const t = this.world.grid[ty][tx];
        if (t && t.b === 'water') t._wave = Math.floor(this.wave);
      }
    }

    // Camera
    this.renderer.update(dt);
    this.renderer.follow(this.player, this.world.width * CFG.TILE_SIZE, this.world.height * CFG.TILE_SIZE);
    this.renderer.render(this);
  }
}

// Input handler
class InputHandler {
  constructor(game) {
    this.game = game;
    this.keys = {};
    this.pressedKeys = {};
    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.key]) this.pressedKeys[e.key] = true;
      this.keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
  }
  isDown(code) { return !!this.keys[code]; }
  pressed(code) {
    const p = !!this.pressedKeys[code];
    this.pressedKeys[code] = false;
    return p;
  }
}

// boot
function boot() {
  window.Game = new Game();
}
window.addEventListener('DOMContentLoaded', boot);
