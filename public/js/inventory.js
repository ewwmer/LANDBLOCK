// LANDBLOCK - Client inventory & hotbar
// Inventory data lives on server; this is a client reflection for UI.

class PlayerInventory {
  constructor(game) {
    this.game = game;
    this.hotbar = [];
    this.hotbarCount = 8;
    this.selected = 0;
    this.panel = null;
  }

  // Build hotbar from player's items (blocks, seeds, tools, potatoes)
  buildHotbar(data) {
    this.hotbar = [];
    const inv = data.inventory;

    // Represent as stackable "slots": first blocks, seeds, tools, potatoes
    const push = (kind, id, qty) => {
      if (this.hotbar.length >= this.hotbarCount) return;
      this.hotbar.push({ kind, id, qty });
    };

    if (inv.blocks) for (const id in inv.blocks) push('blocks', id, inv.blocks[id]);
    if (inv.seeds) for (const id in inv.seeds) push('seeds', id, inv.seeds[id]);
    const activeTool = (inv.tools || []).find(t => t.active) || (inv.tools || [])[0];
    if (activeTool) push('tool', activeTool.type, 1);
    if (inv.potatoes) for (const id in inv.potatoes) push('potato', id, inv.potatoes[id]);

    this.renderHotbar();
  }

  hotbarIcon(slot) {
    switch (slot.kind) {
      case 'blocks': { const b = CFG.BLOCKS[slot.id]; return '🧱'; }
      case 'seeds': { const p = CFG.SEEDS[slot.id]; return '🌱'; }
      case 'tool': return TOOL_ICONS[slot.id] || '🛠️';
      case 'potato': return '🥔';
      default: return '❓';
    }
  }
  hotbarName(slot) {
    switch (slot.kind) {
      case 'blocks': return CFG.BLOCKS[slot.id] && CFG.BLOCKS[slot.id].name;
      case 'seeds': return CFG.SEEDS[slot.id] && CFG.SEEDS[slot.id].name;
      case 'tool': return CFG.TOOLS[slot.id] && CFG.TOOLS[slot.id].name;
      case 'potato': return CFG.POTATO_TYPES[slot.id] && CFG.POTATO_TYPES[slot.id].name;
      default: return '';
    }
  }

  renderHotbar() {
    const bar = document.getElementById('hotbar');
    bar.innerHTML = '';
    for (let i = 0; i < this.hotbarCount; i++) {
      const el = document.createElement('div');
      el.className = 'hotbar-slot' + (i === this.selected ? ' active' : '');
      const slot = this.hotbar[i];
      if (slot) {
        el.textContent = this.hotbarIcon(slot);
        if (slot.qty > 1) {
          const count = document.createElement('span');
          count.className = 'slot-count';
          count.textContent = slot.qty;
          el.appendChild(count);
        }
        el.title = this.hotbarName(slot);
      }
      el.dataset.index = i;
      el.addEventListener('click', () => this.select(i));
      bar.appendChild(el);
    }
  }

  select(i) {
    if (i < 0 || i >= this.hotbarCount) return;
    this.selected = i;
    this.renderHotbar();
    const slot = this.hotbar[i];
    if (slot && slot.kind === 'tool') {
      // switch active tool on server
      const uid = (this.game.player.data.inventory.tools.find(t => t.type === slot.id) || {}).uid;
      if (uid) this.game.net.send('setActiveTool', { uid });
    }
  }

  getSelected() {
    return this.hotbar[this.selected] || null;
  }

  renderPanel(data) {
    const inv = data.inventory;
    const container = document.getElementById('panelContainer');
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'game-panel pixel-panel';

    const title = document.createElement('h2');
    title.innerHTML = 'Inventory <span class="close-btn" onclick="Game.ui.closePanel()">✕</span>';
    panel.appendChild(title);

    // Tabs
    const sections = [
      { label: 'Blocks', get: () => Object.entries(inv.blocks || {}).map(([id, qty]) => ({ id, qty, kind: 'blocks' })) },
      { label: 'Seeds', get: () => Object.entries(inv.seeds || {}).map(([id, qty]) => ({ id, qty, kind: 'seeds' })) },
      { label: 'Potatoes', get: () => Object.entries(inv.potatoes || {}).map(([id, qty]) => ({ id, qty, kind: 'potatoes' })) },
      { label: 'Tools', get: () => (inv.tools || []).map((t, idx) => ({ id: t.type, kind: 'tool', active: t.active, idx })) },
      { label: 'Materials', get: () => Object.entries(inv.materials || {}).map(([id, qty]) => ({ id, qty, kind: 'materials' })) },
      { label: 'Pet Eggs', get: () => Object.entries(inv.petEggs || {}).map(([id, qty]) => ({ id, qty, kind: 'petEggs' })) },
    ];

    for (const sec of sections) {
      const items = sec.get();
      const h = document.createElement('h3');
      h.textContent = sec.label;
      panel.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'grid-list';
      for (const it of items) {
        grid.appendChild(this.makeItemCard(it));
      }
      if (items.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'Empty';
        p.style.cssText = 'font-size:8px;color:#888;';
        grid.appendChild(p);
      }
      panel.appendChild(grid);
    }

    container.appendChild(panel);
    container.classList.add('active');
    this.panel = panel;
  }

  makeItemCard(it) {
    const card = document.createElement('div');
    card.className = 'item-card shop-item';
    const icon = document.createElement('div');
    icon.className = 'item-icon';
    const name = document.createElement('div');
    name.className = 'item-name';

    let color = '';
    switch (it.kind) {
      case 'blocks': {
        const b = CFG.BLOCKS[it.id];
        icon.textContent = '🧱';
        name.textContent = `${b ? b.name : it.id} x${it.qty}`;
        break;
      }
      case 'seeds': {
        const s = CFG.SEEDS[it.id];
        icon.textContent = '🌱';
        name.textContent = `${s ? s.name : it.id} x${it.qty}`;
        this.seedCard = s;
        break;
      }
      case 'potatoes': {
        const p = CFG.POTATO_TYPES[it.id];
        icon.textContent = '🥔';
        name.textContent = `${p ? p.name : it.id} x${it.qty}`;
        name.className += ' ' + (p && p.rarity !== undefined ? 'rarity-' + (['common','uncommon','rare','epic','legendary'][p.rarity]) : '');
        break;
      }
      case 'tool': {
        const t = CFG.TOOLS[it.id];
        icon.textContent = TOOL_ICONS[it.id] || '🛠️';
        name.textContent = `${t ? t.name : it.id}${it.active ? ' (active)' : ''}`;
        name.className += ' ' + (t ? 'rarity-' + t.rarity : '');
        card.addEventListener('click', () => {
          const tools = this.game.player.data.inventory.tools;
          const uid = tools[it.idx] && tools[it.idx].uid;
          if (uid) { this.game.net.send('setActiveTool', { uid }); this.game.toast('Tool equipped!'); }
        });
        break;
      }
      case 'materials': {
        icon.textContent = '📦';
        name.textContent = `${it.id} x${it.qty}`;
        break;
      }
      case 'petEggs': {
        const pet = CFG.PETS[it.id];
        icon.textContent = '🥚';
        name.textContent = `${pet ? pet.name + ' Egg' : it.id} x${it.qty}`;
        name.className += ' ' + (pet ? 'rarity-' + pet.rarity : '');
        break;
      }
    }
    card.appendChild(icon);
    card.appendChild(name);
    return card;
  }
}
