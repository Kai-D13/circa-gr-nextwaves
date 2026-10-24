/*
 * Khung trạng thái nổi góc dưới phải, dùng chung cho trang POS và Nextwaves. Shadow DOM để không đụng CSS của trang.
 * Chỉ dựng DOM bằng textContent (không innerHTML với dữ liệu).
 */
(function (root) {
  "use strict";

  const CSS = `
    :host { all: initial; }
    .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: min(460px, calc(100vw - 32px));
      max-height: 70vh; overflow: auto; background: #fff; color: #111; border: 1px solid #d0d0d0; border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,.18); font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eee; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #999; flex: none; }
    .ok .dot { background: #1a7f37; } .warn .dot { background: #b7791f; } .err .dot { background: #c62828; } .busy .dot { background: #1f6feb; }
    .tt { font-weight: 600; flex: 1; }
    .x { border: 0; background: transparent; font-size: 16px; cursor: pointer; color: #555; }
    .bd { padding: 10px 12px; }
    .ln { margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12px; }
    th, td { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { color: #555; font-weight: 600; }
    .btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    button.b { border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; }
    button.b.sec { background: #fff; color: #111; }
    button.b:disabled { opacity: .5; cursor: default; }
    .min .bd { display: none; }
  `;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function createPanel(brand) {
    let host = null;
    let shadow = null;
    let box = null;
    let minimized = false;

    function ensure() {
      if (host && host.isConnected) return;
      host = el("div");
      host.setAttribute("data-cgn-panel", brand || "");
      shadow = host.attachShadow({ mode: "closed" });
      const style = el("style");
      style.textContent = CSS;
      shadow.appendChild(style);
      box = el("div", "box");
      shadow.appendChild(box);
      (document.body || document.documentElement).appendChild(host);
    }

    // view: {tone:"ok|warn|err|busy|info", title, lines:[str], table:{head:[...], rows:[[...]]}, buttons:[{label, onClick, secondary, disabled}]}
    function show(view) {
      ensure();
      box.className = "box " + (view.tone || "info") + (minimized ? " min" : "");
      box.replaceChildren();
      const hd = el("div", "hd");
      hd.appendChild(el("span", "dot"));
      hd.appendChild(el("span", "tt", (brand ? brand + " · " : "") + (view.title || "")));
      const mn = el("button", "x", minimized ? "▢" : "–");
      mn.title = minimized ? "Mở rộng" : "Thu nhỏ";
      mn.addEventListener("click", () => {
        minimized = !minimized;
        show(view);
      });
      hd.appendChild(mn);
      box.appendChild(hd);
      const bd = el("div", "bd");
      for (const line of view.lines || []) bd.appendChild(el("p", "ln", line));
      if (view.table && view.table.rows && view.table.rows.length) {
        const t = el("table");
        const tr = el("tr");
        for (const h of view.table.head || []) tr.appendChild(el("th", null, h));
        t.appendChild(tr);
        for (const r of view.table.rows) {
          const rr = el("tr");
          for (const c of r) rr.appendChild(el("td", null, c));
          t.appendChild(rr);
        }
        bd.appendChild(t);
      }
      if (view.buttons && view.buttons.length) {
        const bs = el("div", "btns");
        for (const b of view.buttons) {
          const btn = el("button", "b" + (b.secondary ? " sec" : ""), b.label);
          btn.disabled = !!b.disabled;
          btn.addEventListener("click", () => {
            if (!btn.disabled) b.onClick();
          });
          bs.appendChild(btn);
        }
        bd.appendChild(bs);
      }
      box.appendChild(bd);
    }

    function hide() {
      if (host && host.isConnected) host.remove();
      host = null;
    }

    return { show, hide };
  }

  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.ui = { createPanel };
})(typeof globalThis !== "undefined" ? globalThis : this);
