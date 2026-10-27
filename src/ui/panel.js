/*
 * Khung trạng thái nổi góc dưới phải, dùng chung cho trang POS và Nextwaves. Shadow DOM để không đụng CSS của trang.
 * Chỉ dựng DOM bằng textContent (không innerHTML với dữ liệu).
 *
 * Không che nút thao tác của trang (operator 26/10: khung che nút HOÀN THÀNH của POS):
 *  - createPanel(brand, { avoidButtons: /…/i }) — nút / link nào của trang có chữ khớp (bỏ dấu cách thừa, không phân biệt hoa thường)
 *    mà nằm dưới khung thì khung tự nâng lên trên nút đó. Kiểm lại sau mỗi lần vẽ, khi đổi cỡ cửa sổ, khi trang cuộn (cả khung cuộn
 *    bên trong, mỗi khung hình tối đa một lần) và mỗi giây khi khung đang hiện.
 *  - Thu nhỏ: khung co thành một dải tiêu đề ngắn.
 *
 * v0.2.4 (PM P2, docs/pm/REVIEW-A1-RUNBOOK-P2-v0.2.4-20261027.md §2) — createInlinePanel(brand, { find, onMissing, onFound }):
 * khung NẰM TRONG LUỒNG trang, chèn ngay trước phần tử `find(code)` trả về (cùng cha), chiếm chỗ thật, không nổi / không dính.
 *  - Trang vẽ lại gỡ khung → gắn lại một lần trước anchor (MutationObserver childList + characterData; khung đã đúng chỗ thì không làm gì,
 *    nên không có vòng). Quá maxPlaces lần gắn trong placeWindowMs → bỏ, onMissing("unstable").
 *  - Chưa có anchor: chờ (observer + kiểm mỗi pollMs) tối đa waitMs → onMissing("missing"). Anchor xuất hiện sau đó → onFound().
 *    Không bao giờ chèn vào body.
 *  - Nội dung dài cuộn trong khung; nút luôn ở chân khung. Không tự thu nhỏ; đã thu nhỏ tay mà view mới cần chú ý (cảnh báo / lỗi /
 *    có nút hành động chính) và khác view lúc thu nhỏ → tự mở lại.
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

  // Vẽ view vào box. layout "float": nút trong thân (như trước v0.2.4); "inline": thân cuộn riêng, nút ở chân khung luôn thấy.
  // view: {tone:"ok|warn|err|busy|info", title, lines:[str], table:{head:[...], rows:[[...]]}, buttons:[{label, onClick, secondary, disabled}]}
  function renderView(box, brand, view, minimized, onToggle, layout) {
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
    if (layout === "inline") {
      mn.type = "button";
      mn.setAttribute("aria-label", mn.title);
      mn.setAttribute("aria-expanded", minimized ? "false" : "true");
    }
    mn.addEventListener("click", onToggle);
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
    let bs = null;
    if (view.buttons && view.buttons.length) {
      bs = el("div", "btns");
      for (const b of view.buttons) {
        const btn = el("button", "b" + (b.secondary ? " sec" : ""), b.label);
        if (layout === "inline") btn.type = "button";
        btn.disabled = !!b.disabled;
        btn.addEventListener("click", () => {
          if (!btn.disabled) b.onClick();
        });
        bs.appendChild(btn);
      }
    }
    if (layout === "inline") {
      box.appendChild(bd);
      if (bs) {
        const ft = el("div", "ft");
        ft.appendChild(bs);
        box.appendChild(ft);
      }
    } else {
      if (bs) bd.appendChild(bs);
      box.appendChild(bd);
    }
  }

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

    function show(view) {
      ensure();
      renderView(box, brand, view, minimized, () => {
        minimized = !minimized;
        show(view);
      }, "float");
      if (avoidRe) place();
    }

    function hide() {
      stop();
      if (host && host.isConnected) host.remove();
      host = null;
    }

    return { show, hide };
  }

  // ---------- v0.2.4: khung trong luồng trang ----------
  const INLINE_CSS = `
    :host { all: initial; display: block; }
    .box { position: static; box-sizing: border-box; width: 100%; background: #fff; color: #111; border: 1px solid #d0d0d0;
      border-radius: 16px; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
    .hd { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #eee; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #999; flex: none; }
    .ok .dot { background: #1a7f37; } .warn .dot { background: #b7791f; } .err .dot { background: #c62828; } .busy .dot { background: #1f6feb; }
    .warn { border-color: #b7791f; } .err { border-color: #c62828; }
    .tt { font-weight: 600; flex: 1; min-width: 0; }
    .x { border: 0; background: transparent; font-size: 16px; cursor: pointer; color: #555; padding: 0 4px; }
    .bd { padding: 10px 14px 4px; max-height: min(40vh, 320px); overflow: auto; }
    .ln { margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12px; }
    th, td { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { color: #555; font-weight: 600; }
    .ft { padding: 6px 14px 12px; }
    .btns { display: flex; flex-wrap: wrap; gap: 8px; }
    button.b { border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; }
    button.b.sec { background: #fff; color: #111; }
    button.b:disabled { opacity: .5; cursor: default; }
    button:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
    .min .hd { border-bottom: 0; padding: 6px 14px; }
    .min .tt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .min .bd, .min .ft { display: none; }
  `;

  // Nhận dạng view để quyết định tự mở lại khi đang thu nhỏ (tone + tiêu đề + nhãn nút).
  const viewSig = (v) => JSON.stringify([v.tone || "info", v.title || "", (v.buttons || []).map((b) => b.label)]);
  // View cần người dùng chú ý: cảnh báo / lỗi, hoặc có nút hành động chính (không phụ, không tắt).
  const needsAttention = (v) => v.tone === "warn" || v.tone === "err" || (v.buttons || []).some((b) => !b.secondary && !b.disabled);

  function createInlinePanel(brand, opts) {
    const o = Object.assign({ waitMs: 10000, pollMs: 250, maxPlaces: 20, placeWindowMs: 2000, onMissing: () => {}, onFound: () => {} }, opts);
    let host = null;
    let box = null;
    let view = null;
    let code = null; // mã phiếu mà anchor phải thuộc về (null = không kiểm mã)
    let anchor = null;
    let minimized = false;
    let minSig = null; // view lúc người dùng thu nhỏ
    let observer = null;
    let waitTimer = null;
    let pollTimer = null;
    let failed = null; // "missing" | "unstable"
    let places = [];

    function build() {
      host = el("div");
      host.setAttribute("data-cgn-panel", brand || "");
      host.setAttribute("data-cgn-inline", "");
      const shadow = host.attachShadow({ mode: "closed" });
      const style = el("style");
      style.textContent = INLINE_CSS;
      shadow.appendChild(style);
      box = el("div", "box");
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", brand || "");
      shadow.appendChild(box);
    }

    function render() {
      if (!host || !view) return;
      const v = view;
      renderView(box, brand, v, minimized, () => {
        minimized = !minimized;
        minSig = minimized ? viewSig(v) : null;
        render();
      }, "inline");
    }

    const placed = () => !!host && host.isConnected && !!anchor && anchor.isConnected && host.nextElementSibling === anchor;

    function stopWait() {
      if (waitTimer) clearTimeout(waitTimer);
      if (pollTimer) clearInterval(pollTimer);
      waitTimer = pollTimer = null;
    }

    function stopObserving() {
      if (observer) observer.disconnect();
      observer = null;
      stopWait();
    }

    function fail(reason) {
      failed = reason;
      stopWait();
      if (reason === "unstable") stopObserving(); // "missing": vẫn nghe để báo onFound khi anchor xuất hiện
      if (host && host.isConnected) host.remove();
      anchor = null;
      o.onMissing(reason);
    }

    function startWait() {
      if (waitTimer || failed) return;
      waitTimer = setTimeout(() => {
        waitTimer = null;
        if (!placed()) fail("missing");
      }, o.waitMs);
      pollTimer = setInterval(check, o.pollMs);
    }

    function placeBefore(a) {
      const now = Date.now();
      places = places.filter((t) => now - t < o.placeWindowMs);
      places.push(now);
      if (places.length > o.maxPlaces) return fail("unstable");
      if (!host) build();
      a.parentNode.insertBefore(host, a);
      anchor = a;
      render();
    }

    // Gọi từ MutationObserver / kiểm định kỳ / show: khung đúng chỗ thì không làm gì.
    function check() {
      if (!view || failed === "unstable") return;
      if (placed()) return stopWait();
      const a = o.find(code);
      if (a && a.parentNode) {
        stopWait();
        const wasMissing = failed === "missing";
        failed = null;
        placeBefore(a);
        if (wasMissing && failed === null) o.onFound();
        return;
      }
      if (host && host.isConnected) host.remove(); // anchor mất / không còn đúng phiếu: không để khung ở chỗ cũ
      anchor = null;
      startWait();
    }

    function show(v, c) {
      const nextCode = c || null;
      if (nextCode !== code) {
        code = nextCode;
        if (host && host.isConnected) host.remove(); // đổi phiếu: kiểm lại anchor theo mã mới
        anchor = null;
      }
      if (minimized && needsAttention(v) && viewSig(v) !== minSig) {
        minimized = false;
        minSig = null;
      }
      view = v;
      if (failed === "unstable") return;
      if (!observer && typeof MutationObserver === "function") {
        observer = new MutationObserver(check);
        // characterData: React đổi chữ (vd. mã phiếu trên thẻ thông tin) bằng sửa nút chữ, không thêm / gỡ nút.
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      }
      if (placed()) render();
      else check();
    }

    function hide() {
      stopObserving();
      if (host && host.isConnected) host.remove();
      host = box = anchor = view = code = null;
      failed = null;
      places = [];
      minimized = false;
      minSig = null;
    }

    // Khung đang gắn đúng chỗ, cho đúng phiếu `c` (nút ghi phải nằm trong khung này mới được chạy).
    const anchoredFor = (c) => !failed && !!view && code === (c || null) && placed();

    return { show, hide, anchoredFor };
  }

  const lib = { createPanel, createInlinePanel, liftFor, viewSig, needsAttention };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.ui = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
