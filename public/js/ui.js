// LANDBLOCK - Client UI module (panels, HUD update, toasts)

class UI {
  constructor(game) {
    this.game = game;
    this.activePanel = null;
    this.trade = null;
    this.tradeTargetKey = null;
  }

  toast(text, isError = false) {
    const box = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  closePanel() {
    this.activePanel = null;
    const c = document.getElementById('panelContainer');
    c.innerHTML = '';
    c.classList.remove('active');
  }

  openPanel(fn) {
    const c = document.getElementById('panelContainer');
    c.innerHTML = '';
    c.classList.add('active');
    this.activePanel = true;
    fn(c);
  }

  updateHUD(data) {
    const inv = data.inventory;
    let potatoTotal = 0;
    if (inv && inv.potatoes) for (const id in inv.potatoes) potatoTotal += inv.potatoes[id];
    document.getElementById('potatoCount').textContent = potatoTotal;
    document.getElementById('moneyCount').textContent = data.money;
    document.getElementById('levelCount').textContent = data.stats.level;
    // xp bar
    const need = Math.pow(data.stats.level, 1.5) * 100;
    const have = data.stats.xp - (100 * (data.stats.level - 1));
    const pct = Math.min(100, (have / need) * 100);
    document.getElementById('xpFill').style.width = pct + '%';
  }

  showProfile(data) {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      const st = data.stats;
      panel.innerHTML = `
        <h2>${escapeHtml(data.username)} <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>
        <div class="stat-row"><span>Land</span><span>${escapeHtml(data.land.name)}</span></div>
        <div class="stat-row"><span>Level</span><span>${st.level}</span></div>
        <div class="stat-row"><span>Potatoes Harvested</span><span>${st.potatoesHarvested}</span></div>
        <div class="stat-row"><span>Potatoes Earned</span><span>${st.potatoesEarned}</span></div>
        <div class="stat-row"><span>Blocks Placed</span><span>${st.blocksPlaced}</span></div>
        <div class="stat-row"><span>Blocks Broken</span><span>${st.blocksBroken}</span></div>
        <div class="stat-row"><span>Monsters Fed</span><span>${st.monstersFed}</span></div>
        <div class="stat-row"><span>Pets Collected</span><span>${st.petsCollected}</span></div>
        <div class="stat-row"><span>Items Crafted</span><span>${st.itemsCrafted}</span></div>
        <div class="stat-row"><span>Money</span><span>${data.money} 🪙</span></div>
      `;
      c.appendChild(panel);
    });
  }

  showLeaderboard(data) {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🏆 Leaderboards <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>`;
      const cats = [
        ['Most Potatoes', data.potatoes, p => p.stats.potatoesHarvested],
        ['Richest', data.richest, p => p.money + p.potato],
        ['Most Pets', data.pets, p => p.pets.length],
        ['Most Built', data.largest, p => p.stats.blocksPlaced],
        ['Weekly Farming', data.weekly, p => p.stats.weeklyHarvest || 0],
      ];
      for (const [title, list, fn] of cats) {
        const h = document.createElement('h3');
        h.textContent = title;
        panel.appendChild(h);
        if (!list || list.length === 0) {
          const p = document.createElement('p'); p.textContent = 'No data yet'; p.style.cssText='font-size:8px;color:#888;';
          panel.appendChild(p); continue;
        }
        list.slice(0, 10).forEach((p, i) => {
          const r = document.createElement('div');
          r.className = 'stat-row';
          r.innerHTML = `<span>${i + 1}. ${escapeHtml(p.username)}</span><span>${fn(p)}</span>`;
          panel.appendChild(r);
        });
      }
      c.appendChild(panel);
    });
  }

  showShop(data) {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🛒 Shop <span class="close-btn" onclick="Game.ui.closePanel()">✕</span>
        <div style="font-size:8px;color:#ffd700;margin-top:4px;">Money: ${data.money} 🪙</div></h2>`;

      // Seeds
      const h = document.createElement('h3');
      h.textContent = 'Seeds';
      panel.appendChild(h);
      const seedGrid = document.createElement('div');
      seedGrid.className = 'grid-list';
      for (const id in CFG.SEEDS) {
        const s = CFG.SEEDS[id];
        const potato = CFG.POTATO_TYPES[s.potato];
        const card = document.createElement('div');
        card.className = 'item-card shop-item';
        card.innerHTML = `<div class="item-icon">🌱</div><div class="item-name">${s.name}</div><div class="item-sub">${s.cost} 🪙</div>`;
        card.addEventListener('click', () => {
          this.game.net.send('buySeed', { seedId: id, qty: 1 });
        });
        seedGrid.appendChild(card);
      }
      panel.appendChild(seedGrid);

      // Tools
      const h2 = document.createElement('h3');
      h2.textContent = 'Tools (Forge)';
      panel.appendChild(h2);
      const toolGrid = document.createElement('div');
      toolGrid.className = 'grid-list';
      for (const id in CFG.TOOLS) {
        const t = CFG.TOOLS[id];
        const card = document.createElement('div');
        card.className = 'item-card shop-item';
        card.innerHTML = `<div class="item-icon">${TOOL_ICONS[id]}</div><div class="item-name">${t.name}</div><div class="item-sub rarity-${t.rarity}">${t.rarity.toUpperCase()}</div><div class="item-sub">${t.cost.potato} 🥔</div>`;
        card.addEventListener('click', () => {
          this.game.net.send('craftTool', { toolId: id });
        });
        toolGrid.appendChild(card);
      }
      panel.appendChild(toolGrid);

      // Sell potatoes
      const h3 = document.createElement('h3');
      h3.textContent = 'Sell Potatoes';
      panel.appendChild(h3);
      const potatoGrid = document.createElement('div');
      potatoGrid.className = 'grid-list';
      for (const id in CFG.POTATO_TYPES) {
        const p = CFG.POTATO_TYPES[id];
        const card = document.createElement('div');
        card.className = 'item-card shop-item';
        card.innerHTML = `<div class="item-icon">🥔</div><div class="item-name">${p.name}</div><div class="item-sub">${p.value} 🪙 each</div>`;
        card.addEventListener('click', () => {
          const qty = this.game.mode.quantity || 1;
          this.game.net.send('sellPotato', { potato: id, qty });
        });
        potatoGrid.appendChild(card);
      }
      panel.appendChild(potatoGrid);

      c.appendChild(panel);
    });
  }

  showPets(data) {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🐾 Pets <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>`;
      const h = document.createElement('h3');
      h.textContent = 'Your Pets';
      panel.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'grid-list';
      if (data.pets && data.pets.length) {
        for (const pid of data.pets) {
          const pet = CFG.PETS[pid];
          const card = document.createElement('div');
          card.className = 'item-card shop-item' + (data.activePet === pid ? ' selected' : '');
          card.innerHTML = `<div class="item-icon">${PET_ICONS[pid] || '🐾'}</div><div class="item-name">${pet.name}</div><div class="item-sub rarity-${pet.rarity}">${pet.rarity.toUpperCase()}</div>`;
          card.addEventListener('click', () => {
            this.game.net.send('setActivePet', { petId: pid });
          });
          grid.appendChild(card);
        }
      } else {
        const p = document.createElement('p'); p.textContent = 'Hatch pet eggs to get pets!'; p.style.cssText='font-size:8px;color:#888;';
        grid.appendChild(p);
      }
      panel.appendChild(grid);

      const h2 = document.createElement('h3');
      h2.textContent = 'Pet Eggs';
      panel.appendChild(h2);
      const eggGrid = document.createElement('div');
      eggGrid.className = 'grid-list';
      if (data.inventory.petEggs) {
        for (const id in data.inventory.petEggs) {
          const pet = CFG.PETS[id];
          const qty = data.inventory.petEggs[id];
          const card = document.createElement('div');
          card.className = 'item-card shop-item';
          card.innerHTML = `<div class="item-icon">🥚</div><div class="item-name">${pet.name} Egg</div><div class="item-sub">x${qty}</div>`;
          card.addEventListener('click', () => {
            this.game.net.send('hatchPet', { petId: id });
          });
          eggGrid.appendChild(card);
        }
      }
      panel.appendChild(eggGrid);
      c.appendChild(panel);
    });
  }

  showGear(data) {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🛡️ Equipment <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>`;

      // Equipped slots
      const slots = document.createElement('div');
      slots.className = 'gear-slots';
      const slotIcons = { hat: '🎩', shirt: '👕', pants: '👖', shoes: '👟', back: '🎒' };
      for (const slot of CFG.GEAR_SLOTS) {
        const piece = data.equipment[slot];
        const el = document.createElement('div');
        el.className = 'gear-slot';
        el.innerHTML = `<span style="font-size:24px">${piece ? piece.icon : slotIcons[slot]}</span><span class="slot-label">${slot.toUpperCase()}</span>`;
        if (piece) {
          el.innerHTML = `<span style="font-size:24px">${piece.icon}</span><span class="slot-label">${escapeHtml(piece.name)}</span>`;
          el.addEventListener('click', () => this.game.net.send('unequipGear', { slot }));
        }
        slots.appendChild(el);
      }
      panel.appendChild(slots);

      // Set bonuses
      const h = document.createElement('h3');
      h.textContent = 'Set Bonuses (wear 3+ pieces)';
      panel.appendChild(h);
      for (const setId in CFG.GEAR_SETS) {
        const r = document.createElement('div');
        r.className = 'stat-row';
        r.innerHTML = `<span>${escapeHtml(CFG.GEAR_SETS[setId].name)}</span><span>${GEAR_SET_BONUS_TEXT[setId] || ''}</span>`;
        panel.appendChild(r);
      }

      // Owned gear inventory
      const h2 = document.createElement('h3');
      h2.textContent = 'Your Gear';
      panel.appendChild(h2);
      const grid = document.createElement('div');
      grid.className = 'grid-list';
      if (data.inventory.gear && data.inventory.gear.length) {
        for (const gear of data.inventory.gear) {
          const card = document.createElement('div');
          card.className = 'item-card shop-item';
          card.innerHTML = `<div class="item-icon">${gear.icon}</div><div class="item-name">${escapeHtml(gear.name)}</div><div class="item-sub">${slotIcons[gear.slot] || ''} ${gear.slot}</div>`;
          card.addEventListener('click', () => this.game.net.send('equipGear', { uid: gear.uid }));
          grid.appendChild(card);
        }
      }
      panel.appendChild(grid);
      c.appendChild(panel);
    });
  }

  showLand(data) {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🌍 Land: ${escapeHtml(data.land.name)} <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>`;

      const nameRow = document.createElement('div');
      nameRow.className = 'row';
      const input = document.createElement('input');
      input.className = 'pixel-input'; input.value = data.land.name; input.style.flex='1';
      const btn = document.createElement('button');
      btn.className = 'pixel-btn'; btn.textContent = 'Rename';
      btn.addEventListener('click', () => this.game.net.send('setLandName', { name: input.value }));
      nameRow.append(input, btn);
      panel.appendChild(nameRow);

      const priv = document.createElement('div');
      priv.className = 'row';
      priv.innerHTML = `<span style="font-size:9px">Private land (no visitors):</span>`;
      const toggle = document.createElement('button');
      toggle.className = 'pixel-btn'; toggle.textContent = data.land.private ? 'ON' : 'OFF';
      toggle.addEventListener('click', () => this.game.net.send('setLandPrivate', { value: !data.land.private }));
      priv.appendChild(toggle);
      panel.appendChild(priv);

      const h = document.createElement('h3');
      h.textContent = 'Block Shop (craft blocks)';
      panel.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'grid-list';
      const craftables = ['stone','wood','brick','glass','fence','stonebrick','marble','logs','leaves','flowers','path','grass','dirt','farm'];
      for (const id of craftables) {
        const b = CFG.BLOCKS[id];
        const card = document.createElement('div');
        card.className = 'item-card shop-item';
        card.innerHTML = `<div class="item-icon">🧱</div><div class="item-name">${b.name}</div><div class="item-sub">1 🪙</div>`;
        card.addEventListener('click', () => this.game.net.send('buyBlock', { blockId: id, qty: 10 }));
        grid.appendChild(card);
      }
      panel.appendChild(grid);
      c.appendChild(panel);
    });
  }

  showSettings() {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `
        <h2>⚙️ Settings <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>
        <div class="row">
          <span style="font-size:9px">Zoom:</span>
          <button class="pixel-btn" onclick="Game.zoomOut()">-</button>
          <button class="pixel-btn" onclick="Game.zoomIn()">+</button>
        </div>
        <div class="row">
          <button class="pixel-btn" onclick="Game.net.send('returnHome',{})">Return to My Land</button>
        </div>
        <div class="row">
          <button class="pixel-btn" onclick="Game.logout()">Log Out</button>
        </div>
      `;
      c.appendChild(panel);
    });
  }

  showVisit() {
    this.openPanel(c => {
      const panel = document.createElement('div');
      panel.className = 'game-panel pixel-panel';
      panel.innerHTML = `<h2>🗺️ Visit Lands <span class="close-btn" onclick="Game.ui.closePanel()">✕</span></h2>
        <div class="row"><input id="visitInput" class="pixel-input" placeholder="Enter username" style="flex:1">
        <button id="visitGo" class="pixel-btn">Visit</button></div>`;
      c.appendChild(panel);
      document.getElementById('visitGo').addEventListener('click', () => {
        const name = document.getElementById('visitInput').value;
        this.game.net.send('requestVisit', { username: name });
      });
    });
  }

  showMachine(mtype, pos) {
    this.game.machinePos = pos;
    const win = document.getElementById('machineWindow');
    win.classList.remove('hidden');
    document.getElementById('machineTitle').textContent = CFG.MACHINES[mtype].name;
    const body = document.getElementById('machineBody');
    body.innerHTML = `<p style="font-size:9px;color:#aaa">${CFG.MACHINES[mtype].desc}</p>`;
    const self = this;
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'pixel-btn'; b.textContent = label;
      b.addEventListener('click', () => {
        this.game.net.send('machine', { mtype, action: 'use', param: fn ? fn() : undefined }, true);
      });
      body.appendChild(b);
    };
    switch (mtype) {
      case 'processor':
        btn('Process 5 Common 🥔 → 1 Potato Matter', () => '');
        break;
      case 'mutation':
        btn('Mutate 3 Common 🥔 (35% up)', () => 'common');
        btn('Mutate 3 Purple 🥔', () => 'purple');
        btn('Mutate 3 Golden 🥔', () => 'golden');
        break;
      case 'forge':
        for (const id in CFG.TOOLS) {
          const t = CFG.TOOLS[id];
          const b = document.createElement('button');
          b.className = 'pixel-btn';
          b.textContent = `Craft ${t.name} (${t.cost.potato} 🥔)`;
          b.addEventListener('click', () => this.game.net.send('craftTool', { toolId: id }));
          body.appendChild(b);
        }
        body.appendChild(document.createElement('hr'));
        for (const setId in CFG.GEAR_SETS) {
          const s = CFG.GEAR_SETS[setId];
          const b = document.createElement('button');
          b.className = 'pixel-btn';
          b.textContent = `Craft ${s.name} piece (150 🥔)`;
          b.addEventListener('click', () => this.game.net.send('machine', { mtype: 'forge', param: setId }));
          body.appendChild(b);
        }
        break;
      case 'petmachine':
        body.innerHTML += `<p style="font-size:9px">Hatch pet eggs from your Pets tab.</p>`;
        break;
    }
    document.getElementById('machineClose').onclick = () => win.classList.add('hidden');
  }

  showMonster(monster, id) {
    const popup = document.getElementById('monsterPopup');
    const def = CFG.MONSTERS[monster.type];
    popup.classList.remove('hidden');
    document.getElementById('monsterName').textContent = def.name;
    document.getElementById('monsterFriend').textContent = `${monster.friendship || 0} / ${def.friendshipRequired || 0}`;
    const actions = document.getElementById('monsterActions');
    actions.innerHTML = '';
    const feedBtn = document.createElement('button');
    feedBtn.className = 'pixel-btn';
    const potato = CFG.POTATO_TYPES[def.feed.potato];
    feedBtn.textContent = `Feed 1 ${potato.name} 🥔`;
    feedBtn.addEventListener('click', () => {
      this.game.net.send('feedMonster', { monsterId: id, x: monster.x, y: monster.y });
      popup.classList.add('hidden');
    });
    actions.appendChild(feedBtn);
    document.getElementById('monsterClose').onclick = () => popup.classList.add('hidden');
  }

  // ---- Trading UI ----
  openTradeWindow(key, a, b) {
    this.tradeTargetKey = key;
    const win = document.getElementById('tradeWindow');
    win.classList.remove('hidden');
    this.trade = { a, b, key };
    document.getElementById('tradeState').innerHTML = `<span style="font-size:9px">Trading with ${escapeHtml(b.username)}</span>`;
    this.renderTrade();
  }
  closeTradeWindow() {
    document.getElementById('tradeWindow').classList.add('hidden');
    this.trade = null;
  }
  renderTrade() {
    if (!this.trade) return;
    const t = this.trade;
    document.getElementById('tradeSideA').innerHTML = this.renderTradeSide(t.a, true);
    document.getElementById('tradeSideB').innerHTML = this.renderTradeSide(t.b, false);
  }
  renderTradeSide(side, isMe) {
    let html = `<h4>${escapeHtml(side.username)} ${side.locked ? '<span class="locked-badge">🔒LOCKED</span>' : ''} ${side.locked && side.confirmed ? '<span class="locked-badge">✅</span>' : ''}</h4>`;
    html += `<div class="item-sub">Potatoes: ${side.potatoes || 0}</div>`;
    for (const it of (side.items || [])) {
      html += `<div class="trade-item"><span>${it.id} x${it.qty}</span></div>`;
    }
    if (isMe && !side.locked) {
      html += `<button class="pixel-btn" style="margin-top:6px;font-size:8px" onclick="Game.tradeAddPotato()">+ Potato</button>`;
      html += `<button class="pixel-btn" style="margin-top:6px;font-size:8px" onclick="Game.tradeRemoveAll()">Clear</button>`;
    }
    return html;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
