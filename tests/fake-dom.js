"use strict";
// DOM tối thiểu để chạy THẬT ui/panel.js createInlinePanel trong Node (v0.2.4, PM audit sơ bộ P1 / P2): cây phần tử + nút chữ,
// shadow root (không báo cho observer của trang, như trình duyệt), MutationObserver chỉ chạy khi test gọi flush() — test chọn được
// lúc "trước khi observer kịp chạy". Không có bố cục / cuộn / hover: phần đó kiểm trên Edge (scripts/edge-gr-page.js).

function createDom() {
  const observers = new Set();
  let doc = null;

  const inDocument = (n) => {
    while (n && n.parentNode) n = n.parentNode;
    return !!doc && n === doc.documentElement;
  };
  const touch = (target) => {
    if (!inDocument(target)) return; // thay đổi trong shadow root / cây rời: observer của trang không thấy
    for (const o of observers) o.pending = true;
  };

  class Node {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.parentNode = null;
      this.childNodes = [];
    }
    get isConnected() {
      return inDocument(this);
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    siblings() {
      return this.parentNode ? this.parentNode.childNodes.filter((c) => c.nodeType === 1) : [];
    }
    get nextElementSibling() {
      const s = this.siblings();
      return s[s.indexOf(this) + 1] || null;
    }
    get previousElementSibling() {
      const s = this.siblings();
      const i = s.indexOf(this);
      return i > 0 ? s[i - 1] : null;
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join("");
    }
    set textContent(v) {
      this.replaceChildren(...(v === "" || v === null || v === undefined ? [] : [doc.createTextNode(String(v))]));
    }
    insertBefore(c, ref) {
      if (c.parentNode) c.parentNode.detach(c);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, c);
      c.parentNode = this;
      touch(this);
      return c;
    }
    appendChild(c) {
      return this.insertBefore(c, null);
    }
    append(...cs) {
      for (const c of cs) this.appendChild(c);
    }
    detach(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
    }
    remove() {
      const p = this.parentNode;
      if (!p) return;
      p.detach(this);
      touch(p);
    }
    replaceChildren(...cs) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      for (const c of cs) {
        if (c.parentNode) c.parentNode.detach(c);
        this.childNodes.push(c);
        c.parentNode = this;
      }
      touch(this);
    }
    replaceWith(n) {
      const p = this.parentNode;
      if (!p) return;
      p.insertBefore(n, this);
      p.detach(this);
      touch(p);
    }
  }

  class Text extends Node {
    constructor(data) {
      super(3);
      this._data = data;
    }
    get data() {
      return this._data;
    }
    set data(v) {
      this._data = String(v);
      touch(this); // characterData
    }
    get nodeValue() {
      return this._data;
    }
    set nodeValue(v) {
      this.data = v;
    }
    get textContent() {
      return this._data;
    }
  }

  class Element extends Node {
    constructor(tag) {
      super(1);
      this.tagName = String(tag).toUpperCase();
      this.attrs = new Map();
      this.listeners = [];
      this.className = "";
      this.id = "";
      this.title = "";
      this.type = "";
      this.disabled = false;
      this.style = {};
      this.shadow = null; // test đọc được shadow root (trình duyệt thật: đóng)
    }
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
    }
    getAttribute(k) {
      return this.attrs.has(k) ? this.attrs.get(k) : null;
    }
    hasAttribute(k) {
      return this.attrs.has(k);
    }
    addEventListener(type, fn) {
      this.listeners.push({ type, fn });
    }
    click() {
      for (const l of this.listeners.slice()) if (l.type === "click") l.fn({ type: "click", target: this });
    }
    attachShadow() {
      this.shadow = new Node(11);
      return this.shadow;
    }
  }

  doc = {
    createElement: (tag) => new Element(tag),
    createTextNode: (s) => new Text(String(s)),
    getElementById: (id) => {
      const walk = (n) => {
        if (n.nodeType === 1 && n.id === id) return n;
        for (const c of n.childNodes) {
          const x = walk(c);
          if (x) return x;
        }
        return null;
      };
      return walk(doc.documentElement);
    },
  };
  doc.documentElement = new Element("html");
  doc.body = new Element("body");
  doc.documentElement.appendChild(doc.body);

  class MutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.pending = false;
    }
    observe() {
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
      this.pending = false;
    }
  }

  // Chạy các observer có thay đổi chờ, lặp tới khi yên (như microtask checkpoint). Trả số lượt; > limit = vòng không dừng.
  function flush(limit = 200) {
    let rounds = 0;
    for (;;) {
      const due = [...observers].filter((o) => o.pending);
      if (!due.length) return rounds;
      if (++rounds > limit) return rounds;
      for (const o of due) {
        o.pending = false;
        o.cb([], o);
      }
    }
  }

  // Gắn vào globalThis cho panel.js (dùng `document`, `MutationObserver` lúc chạy); trả hàm gỡ.
  function install() {
    const prev = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    globalThis.document = doc;
    globalThis.MutationObserver = MutationObserver;
    return () => {
      globalThis.document = prev.document;
      globalThis.MutationObserver = prev.MutationObserver;
    };
  }

  const el = (tag, text, id) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (id) e.id = id;
    return e;
  };
  // Mọi phần tử (kể cả trong shadow) thoả điều kiện.
  const all = (n, pred, out = []) => {
    if (n.nodeType === 1 && pred(n)) out.push(n);
    for (const c of n.childNodes) all(c, pred, out);
    if (n.shadow) all(n.shadow, pred, out);
    return out;
  };

  return { document: doc, flush, install, el, all, observerCount: () => observers.size };
}

module.exports = { createDom };
