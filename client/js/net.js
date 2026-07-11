// WebSocket wrapper with a handler registry.
export class Net {
  constructor() {
    this.handlers = {};
    this.ws = null;
    this.connected = false;
  }
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => { this.connected = true; resolve(); };
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => {
        this.connected = false;
        (this.handlers.__close || []).forEach(f => f());
      };
      this.ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        (this.handlers[msg.t] || []).forEach(f => f(msg));
      };
    });
  }
  send(obj) { if (this.connected) this.ws.send(JSON.stringify(obj)); }
}
