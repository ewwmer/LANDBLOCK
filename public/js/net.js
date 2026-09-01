// LANDBLOCK - Client networking module

class Net {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.selfId = null;
  }

  connect(username, password) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const host = location.host || 'localhost:3000';
      this.ws = new WebSocket(`${proto}://${host}`);
      this.ws.onopen = () => {
        this.send('auth', { username, password });
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.handle(msg);
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.game.onDisconnect();
      };
      this.ws.onerror = (e) => {};
    });
  }

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  handle(msg) {
    switch (msg.type) {
      case 'authError':
        document.getElementById('loginError').textContent = msg.error;
        break;
      case 'authOk': {
        this.connected = true;
        this.selfId = msg.self.id;
        window.Game.onAuth(msg.self, msg.config);
        break;
      }
      case 'playerJoined': {
        if (msg.player && msg.player.id !== this.selfId) {
          this.game.addRemotePlayer(msg.player);
        }
        break;
      }
      case 'playerLeft':
        this.game.removeRemotePlayer(msg.id);
        break;
      case 'playerPositions':
        this.game.updateRemotePlayers(msg.players);
        break;
      case 'actionResult':
        this.game.onActionResult(msg);
        break;
      case 'chat':
        this.game.onChat(msg);
        break;
      case 'landUpdate':
        // Used when visiting; if it's about our current view, refresh
        break;
      // Trading
      case 'tradeOpen': {
        const isMe = msg.a.id === this.selfId || msg.b.id === this.selfId;
        if (isMe) {
          const mySide = msg.a.id === this.selfId ? msg.a : msg.b;
          const other = msg.a.id === this.selfId ? msg.b : msg.a;
          this.game.ui.openTradeWindow(msg.key, mySide, other);
          this.game.toast(`Trade started with ${other.username}`);
        } else {
          this.game.toast(`${msg.a.username} wants to trade with ${msg.b.username}`);
        }
        break;
      }
      case 'tradeUpdate': {
        const mySide = msg.a.id === this.selfId ? msg.a : msg.b;
        const other = msg.a.id === this.selfId ? msg.b : msg.a;
        this.game.ui.trade = { a: mySide, b: other, key: msg.key };
        this.game.ui.tradeTargetKey = msg.key;
        this.game.ui.renderTrade();
        break;
      }
      case 'tradeComplete':
        this.game.ui.closeTradeWindow();
        this.game.toast('Trade completed!');
        break;
      case 'tradeClosed':
        if (this.game.ui.tradeTargetKey === msg.key) {
          this.game.ui.closeTradeWindow();
          this.game.toast('Trade closed.');
        }
        break;
    }
  }
}
