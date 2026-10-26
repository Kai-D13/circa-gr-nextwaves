/*
 * Trang danh sách phiếu nhận POS (ISOLATED world) — CHỈ phần DOM của nút "Nhận hàng bằng RFID" (Spec v0.2 S2 / S5).
 * Không gọi API, không đọc storage: bộ điều khiển duy nhất ở pos/pos-content.js quyết dòng nào có nút, nhãn gì, bấm thì làm gì.
 *  - show(model): model.byCode = Map<mã GR, {grId, kind, label, title, disabled}>; dòng có mã không nằm trong model → gỡ nút của ta.
 *  - Tìm dòng: ô lá có chữ đúng /^GR\d{5,}$/ trong một <tr> (không đoán theo thứ tự dòng). Nút vào div.flex của ô cuối, hoặc chính ô cuối.
 *  - <button type="button" class="cgn-rfid-btn">; chặn sự kiện chuột / phím lan lên dòng (dòng POS mở phiếu khi bấm).
 *    Không đụng nút của extension khác (vd. .circa-rfid-po-link của extension Nextwaves).
 *  - MutationObserver chỉ chạy khi trang là danh sách (activate / deactivate); gom thay đổi (debounce); bỏ qua thay đổi do chính nút của ta.
 *  - rowValid(): dòng đã bấm còn trên trang, còn đúng mã, còn đúng nút → để bộ điều khiển huỷ cú bấm khi danh sách đổi (rev 2 R2).
 */
(function () {
  "use strict";
  const C = (globalThis.__CGN__ = globalThis.__CGN__ || {});
  if (C.grList) return; // trình duyệt giả trong test cấp sẵn bộ giả

  const CODE_RE = /^GR\d{5,}$/;
  const BTN = "cgn-rfid-btn";
  const DEBOUNCE_MS = 250;
  const MAX_WAIT_MS = 1000; // DOM đổi liên tục (đồng hồ, spinner…) vẫn được quét lại tối đa mỗi 1 s
  const STYLE =
    "display:inline-flex;align-items:center;margin-inline-start:8px;padding:0 10px;height:28px;border:1px solid #1f6feb;" +
    "border-radius:8px;background:#fff;color:#1f6feb;font:600 12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "white-space:nowrap;cursor:pointer;";
  const STOP = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "dblclick", "keydown", "keyup"];
  const hasDom = typeof document !== "undefined" && typeof MutationObserver !== "undefined";

  let controller = null;
  let model = null;
  let observer = null;
  let timer = null;
  let pendingSince = 0;
  let active = false;
  // Số đo cho gate hiệu năng (đọc qua CDP trong ISOLATED world).
  const stats = { applies: 0, totalMs: 0, maxMs: 0, mutationBatches: 0, ignoredOwn: 0 };
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  function rowCode(tr) {
    for (const el of tr.querySelectorAll("td, p, span, a")) {
      if (el.children.length !== 0 || el.closest("." + BTN)) continue;
      const text = (el.textContent || "").trim();
      if (CODE_RE.test(text)) return text;
    }
    return null;
  }

  function slotOf(tr) {
    const last = tr.lastElementChild;
    if (!last) return tr;
    return last.querySelector("div.flex") || last;
  }

  function ourButton(tr) {
    return tr.querySelector("button." + BTN);
  }

  function activate(btn) {
    if (btn.disabled || !controller) return;
    const tr = btn.closest("tr");
    controller.onSelect(tr, btn.getAttribute("data-cgn-gr"), btn.getAttribute("data-cgn-code"), btn.getAttribute("data-cgn-kind"));
  }

  function makeButton() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = BTN;
    b.setAttribute("style", STYLE);
    for (const ev of STOP) b.addEventListener(ev, (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      activate(b);
    });
    return b;
  }

  function apply() {
    if (!active || !hasDom) return;
    const t0 = now();
    for (const tr of document.querySelectorAll("tr")) {
      const code = rowCode(tr);
      const want = code && model && model.byCode ? model.byCode.get(code) : null;
      const cur = ourButton(tr);
      if (!want) {
        if (cur) cur.remove();
        continue;
      }
      const same =
        cur &&
        cur.getAttribute("data-cgn-gr") === want.grId &&
        cur.getAttribute("data-cgn-code") === code &&
        cur.getAttribute("data-cgn-kind") === want.kind &&
        cur.textContent === want.label &&
        cur.disabled === !!want.disabled;
      if (same) continue;
      const btn = cur && cur.getAttribute("data-cgn-gr") === want.grId ? cur : makeButton();
      btn.setAttribute("data-cgn-gr", want.grId);
      btn.setAttribute("data-cgn-code", code);
      btn.setAttribute("data-cgn-kind", want.kind);
      if (btn.textContent !== want.label) btn.textContent = want.label;
      btn.title = want.title || want.label;
      btn.disabled = !!want.disabled;
      if (btn !== cur) {
        if (cur) cur.remove();
        slotOf(tr).appendChild(btn);
      }
    }
    const ms = now() - t0;
    stats.applies += 1;
    stats.totalMs += ms;
    if (ms > stats.maxMs) stats.maxMs = ms;
  }

  // Thay đổi do chính nút của ta (thêm / gỡ / đổi chữ nút) không kích hoạt lượt quét lại.
  function isOwn(m) {
    const t = m.target;
    const el = t && t.nodeType === 1 ? t : t && t.parentElement;
    if (el && el.closest && el.closest("button." + BTN)) return true;
    const nodes = [...m.addedNodes, ...m.removedNodes];
    return nodes.length > 0 && nodes.every((n) => n.nodeType === 1 && n.classList && n.classList.contains(BTN));
  }

  function flush() {
    timer = null;
    pendingSince = 0;
    apply();
    if (controller && controller.onDomChanged) controller.onDomChanged();
  }

  // Gom thay đổi: chờ DOM yên DEBOUNCE_MS, nhưng không quá MAX_WAIT_MS kể từ thay đổi đầu tiên chưa xử lý.
  function onMutations(list) {
    stats.mutationBatches += 1;
    if (list.every(isOwn)) {
      stats.ignoredOwn += 1;
      return;
    }
    const t = now();
    if (!pendingSince) pendingSince = t;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (t - pendingSince))));
  }

  const api = {
    attach(ctrl) {
      controller = ctrl;
    },
    activate() {
      if (!hasDom || active) return;
      active = true;
      observer = new MutationObserver(onMutations);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      apply();
    },
    deactivate() {
      if (!active) return;
      active = false;
      if (observer) observer.disconnect();
      observer = null;
      if (timer) clearTimeout(timer);
      timer = null;
      pendingSince = 0;
      model = null;
      if (hasDom) for (const b of document.querySelectorAll("button." + BTN)) b.remove();
    },
    show(m) {
      model = m;
      apply();
    },
    rowValid(tr, code, grId) {
      if (!hasDom || !tr || !tr.isConnected) return false;
      if (rowCode(tr) !== code) return false;
      const b = ourButton(tr);
      return !!b && b.getAttribute("data-cgn-gr") === grId;
    },
    // stats(true): trả số đo rồi đặt lại (để đo riêng một đợt).
    stats: (reset) => {
      const out = Object.assign({}, stats);
      if (reset) Object.assign(stats, { applies: 0, totalMs: 0, maxMs: 0, mutationBatches: 0, ignoredOwn: 0 });
      return out;
    },
  };
  C.grList = api;
})();
