/*
 * Khung trạng thái nổi góc dưới phải, dùng chung cho trang POS và Nextwaves. Shadow DOM để không đụng CSS của trang.
 * Chỉ dựng DOM bằng textContent (không innerHTML với dữ liệu).
 *
 * Không che nút thao tác của trang (operator 26/10: khung che nút HOÀN THÀNH của POS):
 *  - createPanel(brand, { avoidButtons: /…/i }) — nút / link nào của trang có chữ khớp (bỏ dấu cách thừa, không phân biệt hoa thường)
 *    mà nằm dưới khung thì khung tự nâng lên trên nút đó. Kiểm lại sau mỗi lần vẽ, khi đổi cỡ cửa sổ, khi trang cuộn (cả khung cuộn
 *    bên trong, mỗi khung hình tối đa một lần) và mỗi giây khi khung đang hiện.
 *  - Thu nhỏ: khung co thành một dải tiêu đề ngắn.
 */
(function (root) {
  "use strict";

  const BASE = 16; // khoảng cách mặc định tới mép dưới / phải
  const GAP = 12; // khoảng hở phía trên nút được tránh
  const MIN_TOP = 8; // khung không vượt mép trên cửa sổ

  const CSS = `
    :host { all: initial; }
    .box { position: fixed; right: ${BASE}px; bottom: ${BASE}px; z-index: 2147483646; width: min(460px, calc(100vw - 32px));
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
    .min { width: auto; max-width: min(320px, calc(100vw - 32px)); overflow: hidden; }
    .min .hd { border-bottom: 0; padding: 6px 10px; }
    .min .tt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .min .bd { display: none; }
  `;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  // Khoảng cách mép dưới (px) để khung KHÔNG chồng lên rect nào trong `avoid`. Thuần, test được trong Node.
  // box: {left, right, height} của khung (ngang không đổi khi nâng); avoid: [{left, right, top, bottom}]; vh: chiều cao cửa sổ.
  function liftFor(box, avoid, vh) {
    let bottom = BASE;
    for (let i = 0; i < 8; i++) {
      const top = vh - bottom - box.height;
      const end = vh - bottom;
      let next = bottom;
      for (const r of avoid || []) {
        if (!(r.right > r.left && r.bottom > r.top)) continue;
        const across = r.left < box.right && r.right > box.left;
        const down = r.top < end && r.bottom > top;
        if (across && down) next = Math.max(next, vh - r.top + GAP);
      }
      if (next === bottom) break;
      bottom = next;
    }
    return Math.min(bottom, Math.max(BASE, vh - MIN_TOP - 40)); // luôn chừa ít nhất dải tiêu đề trong cửa sổ
  }

  const norm = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();

  function createPanel(brand, opts) {
    const avoidRe = opts && opts.avoidButtons instanceof RegExp ? opts.avoidButtons : null;
    let host = null;
    let shadow = null;
    let box = null;
    let minimized = false;
    let timer = null;
    let onResize = null;
    let onScroll = null;
    let scrollQueued = false;

    function avoidRects() {
      if (!avoidRe || typeof document.querySelectorAll !== "function") return [];
      const out = [];
      for (const e of document.querySelectorAll("button, [role='button'], a, input[type='button'], input[type='submit']")) {
        if (host && host.contains(e)) continue;
        if (!avoidRe.test(norm(e.textContent || e.value))) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      return out;
    }

    function place() {
      if (!host || !host.isConnected || !box) return;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      box.style.bottom = BASE + "px";
      box.style.maxHeight = "";
      const r = box.getBoundingClientRect();
      const bottom = liftFor({ left: r.left, right: r.right, height: r.height }, avoidRects(), vh);
      box.style.bottom = bottom + "px";
      box.style.maxHeight = bottom > BASE ? Math.max(40, vh - bottom - MIN_TOP) + "px" : "";
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (onResize) window.removeEventListener("resize", onResize);
      onResize = null;
      if (onScroll) document.removeEventListener("scroll", onScroll, true);
      onScroll = null;
    }

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
      if (avoidRe && !timer) {
        timer = setInterval(() => {
          if (!host || !host.isConnected) stop();
          else place();
        }, 1000);
        onResize = () => place();
        window.addEventListener("resize", onResize);
        // Cuộn — kể cả trong khung cuộn của trang (G0 27/10: chân modal màn quét Nextwaves nằm cuối thân cuộn) — đổi vị trí nút cần
        // tránh: đặt lại ở khung hình kế tiếp, tối đa một lần mỗi khung hình, thay vì chờ lượt kiểm 1 s.
        onScroll = () => {
          if (scrollQueued) return;
          scrollQueued = true;
          requestAnimationFrame(() => {
            scrollQueued = false;
            if (host && host.isConnected) place();
          });
        };
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      }
    }

    // view: {tone:"ok|warn|err|busy|info", title, lines:[str], table:{head:[...], rows:[[...]]}, buttons:[{label, onClick, secondary, disabled}]}
    function show(view) {
      ensure();
      box.className = "box " + (view.tone || "info") + (minimized ? " min" : "");
      box.replaceChildren();
      const hd = el("div", "hd");
      hd.appendChild(el("span", "dot"));
      const title = (brand ? brand + " · " : "") + (view.title || "");
      const tt = el("span", "tt", title);
      tt.title = title;
      hd.appendChild(tt);
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
      if (avoidRe) place();
    }

    function hide() {
      stop();
      if (host && host.isConnected) host.remove();
      host = null;
    }

    return { show, hide };
  }

  const lib = { createPanel, liftFor };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.ui = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
