/*
 * Trang danh sách phiếu nhận POS (ISOLATED world) — CHỈ phần DOM của nút "Nhận hàng bằng RFID" (Spec v0.2 S2 / S5).
 * Không gọi API, không đọc storage: bộ điều khiển duy nhất ở pos/pos-content.js quyết dòng nào có nút, nhãn gì, bấm thì làm gì.
 *  - show(model): model.byCode = Map<mã GR, {grId, kind, label, title, disabled}>; dòng có mã không nằm trong model → gỡ nút của ta.
 *    Nhãn ngắn; title = aria-label = tên đầy đủ (mã GR + trạng thái phiên + hành động) — v0.2.3 PM F3.
 *  - notice(view): vùng thông báo trong luồng trang, ngay trên bảng (huỷ / lỗi / không liên kết) — v0.2.3 PM F4, không dùng khung nổi.
 *  - Tìm dòng: ô lá có chữ đúng /^GR\d{5,}$/ trong một <tr> (không đoán theo thứ tự dòng). Nút vào div.flex của ô cuối, hoặc chính ô cuối.
 *  - <button type="button" class="cgn-rfid-btn">; chặn sự kiện chuột / phím lan lên dòng (dòng POS mở phiếu khi bấm) bằng MỘT bộ nghe
 *    capture ở document (chỉ khi trang là danh sách). Không đụng nút của extension khác (vd. .circa-rfid-po-link của extension Nextwaves).
 *  - MutationObserver chỉ chạy khi trang là danh sách (activate / deactivate); gom thay đổi (debounce); bỏ qua thay đổi do chính nút của ta.
 *  - Hiệu năng (PM audit v0.2.0 P2.2, ngân sách mỗi lượt < 2 ms): mỗi lượt quét dừng sau ~1 ms, dòng còn lại sang task sau; phần
 *    "lạnh" chỉ tốn lần đầu làm trước trong hai task riêng; chưa có dòng cần nút thì không quét bảng.
 *  - rowValid(): dòng đã bấm còn trên trang, còn đúng mã, còn đúng nút → để bộ điều khiển huỷ cú bấm khi danh sách đổi (rev 2 R2).
 */
(function () {
  "use strict";
  const C = (globalThis.__CGN__ = globalThis.__CGN__ || {});
  if (C.grList) return; // trình duyệt giả trong test cấp sẵn bộ giả

  const CODE_RE = /^GR\d{5,}$/;
  const CODE_IN_RE = /GR\d{5,}/;
  const BTN = "cgn-rfid-btn";
  const DEBOUNCE_MS = 250;
  const MAX_WAIT_MS = 1000; // DOM đổi liên tục (đồng hồ, spinner…) vẫn được quét lại tối đa mỗi 1 s
  const SLICE_MS = 1; // mỗi lượt quét dừng sau ~1 ms (cộng một dòng đang làm dở), phần còn lại sang task sau
  // Cao 24px = icon thao tác của dòng POS thật (G0 27/10: nút 28px làm dòng 57px → 61px, 24px giữ nguyên 57px).
  // Rộng (v0.2.3, PM F3): mọi nhãn ngắn hơn "Nhận hàng bằng RFID" (~144px trên POS thật); chặn cứng MAX_W, chữ thừa thành "…"
  // để nhãn trạng thái không bao giờ làm cột Hành động nở ra (bảng dàn lại). Tên đầy đủ ở title + aria-label.
  const MAX_W = 150;
  const STYLE =
    `display:inline-block;box-sizing:border-box;max-width:${MAX_W}px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;` +
    "margin-inline-start:8px;padding:0 10px;height:24px;line-height:22px;border:1px solid #1f6feb;" +
    "border-radius:8px;background:#fff;color:#1f6feb;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;";
  // Vùng thông báo của trang danh sách (v0.2.3, PM F4): nằm TRONG luồng trang, ngay trên bảng — không phủ dòng / icon / nút / phân trang.
  const NOTE = "cgn-rfid-note";
  const NOTE_TONE = { warn: ["#fff8e1", "#b7791f"], err: ["#fdecea", "#c62828"], info: ["#e8f0fe", "#1f6feb"], ok: ["#e6f4ea", "#1a7f37"] };
  const EVENTS = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "dblclick", "keydown", "keyup", "click"];
  const hasDom = typeof document !== "undefined" && typeof MutationObserver !== "undefined";

  let controller = null;
  let model = null;
  let observer = null;
  let timer = null;
  let sliceTimer = null;
  let warmTimer = null;
  let pendingSince = 0;
  let active = false;
  // Số đo cho gate hiệu năng (đọc qua CDP trong ISOLATED world).
  const stats = { applies: 0, totalMs: 0, maxMs: 0, mutationBatches: 0, ignoredOwn: 0 };
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  // Ô có chữ đúng mã (thường gặp) → lấy ngay; ô có mã lẫn chữ khác → tìm phần tử lá chứa đúng mã trong ô đó.
  function rowCode(tr) {
    const cells = tr.cells || tr.children;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const text = (cell.textContent || "").trim();
      if (CODE_RE.test(text)) return text;
      if (!CODE_IN_RE.test(text)) continue;
      for (const el of cell.querySelectorAll("p, span, a")) {
        if (el.children.length !== 0 || el.closest("." + BTN)) continue;
        const t = (el.textContent || "").trim();
        if (CODE_RE.test(t)) return t;
      }
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

  // Một bộ nghe cho mọi nút (pha capture ở document, gắn khi trang là danh sách): sự kiện trên nút của ta dừng tại đây,
  // không tới dòng POS (kể cả bộ nghe capture của app ở thẻ gốc) — dòng POS mở phiếu khi bấm.
  function onButtonEvent(e) {
    const t = e.target;
    const btn = t && t.closest ? t.closest("button." + BTN) : null;
    if (!btn) return;
    e.stopPropagation();
    if (e.type !== "click") return;
    e.preventDefault();
    activate(btn);
  }

  let template = null;
  function makeButton() {
    if (!template) {
      template = document.createElement("button");
      template.type = "button";
      template.className = BTN;
      template.setAttribute("style", STYLE);
    }
    return template.cloneNode(false);
  }

  function syncRow(tr) {
    const code = rowCode(tr);
    const want = code ? model.byCode.get(code) : null;
    const cur = ourButton(tr);
    if (!want) {
      if (cur) cur.remove();
      return;
    }
    const full = want.title || want.label;
    // So cả kind / title / aria-label: cùng nhãn "Mở phiếu" nhưng phiên đổi (received → applied) vẫn phải cập nhật tên đầy đủ.
    const same =
      cur &&
      cur.getAttribute("data-cgn-gr") === want.grId &&
      cur.getAttribute("data-cgn-code") === code &&
      cur.getAttribute("data-cgn-kind") === want.kind &&
      cur.textContent === want.label &&
      cur.title === full &&
      cur.getAttribute("aria-label") === full &&
      cur.disabled === !!want.disabled;
    if (same) return;
    const btn = cur && cur.getAttribute("data-cgn-gr") === want.grId ? cur : makeButton();
    btn.setAttribute("data-cgn-gr", want.grId);
    btn.setAttribute("data-cgn-code", code);
    btn.setAttribute("data-cgn-kind", want.kind);
    if (btn.textContent !== want.label) btn.textContent = want.label;
    btn.title = full;
    btn.setAttribute("aria-label", full);
    btn.disabled = !!want.disabled;
    if (btn !== cur) {
      if (cur) cur.remove();
      slotOf(tr).appendChild(btn);
    }
  }

  // Phần chỉ tốn ở lần chạy đầu (khởi tạo kiểu DOM trong world của extension, biên dịch hàm / regex, phân tích style nút mẫu:
  // tổng ~1–2 ms) làm trước, chia hai task riêng ngay khi vào danh sách — thường trước khi response danh sách về — trên phần tử
  // tạm không gắn vào trang. Lượt tạo nút sau đó không gánh phần này.
  const WARM_STEPS = [
    () => makeButton(),
    () => {
      const tr = document.createElement("tr");
      tr.appendChild(document.createElement("td")).textContent = "GR00000";
      rowCode(tr);
    },
  ];
  function warmUp(step) {
    warmTimer = null;
    if (!active) return;
    const t0 = now();
    WARM_STEPS[step]();
    record(now() - t0);
    if (step + 1 < WARM_STEPS.length) warmTimer = setTimeout(warmUp, 0, step + 1);
  }

  // ---- vùng thông báo (chỉ trang danh sách) ----
  let noticeView = null;
  let noticeEl = null;

  function buildNotice(view) {
    const [bg, fg] = NOTE_TONE[view.tone] || NOTE_TONE.info;
    const box = document.createElement("div");
    box.className = NOTE;
    box.setAttribute("role", view.tone === "err" || view.tone === "warn" ? "alert" : "status");
    box.setAttribute(
      "style",
      `box-sizing:border-box;display:flex;align-items:flex-start;gap:12px;margin:8px 0;padding:8px 12px;border-left:4px solid ${fg};` +
        `border-radius:6px;background:${bg};color:#111;font:13px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;`
    );
    const text = document.createElement("div");
    text.setAttribute("style", "flex:1;min-width:0;");
    const title = document.createElement("div");
    title.setAttribute("style", "font-weight:600;");
    title.textContent = String(view.title || "");
    text.appendChild(title);
    for (const line of view.lines || []) {
      const p = document.createElement("div");
      p.setAttribute("style", "white-space:pre-wrap;word-break:break-word;");
      p.textContent = String(line);
      text.appendChild(p);
    }
    box.appendChild(text);
    for (const b of view.buttons || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(b.label);
      btn.setAttribute("style", "flex:none;border:1px solid #111;background:#fff;color:#111;border-radius:6px;padding:2px 10px;font:inherit;cursor:pointer;");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (b.onClick) b.onClick();
      });
      box.appendChild(btn);
    }
    return box;
  }

  // Đặt ngay trước bảng (hoặc khung MUI chứa bảng); app vẽ lại bảng thì đặt lại. Không có bảng thì lên đầu trang.
  function syncNotice() {
    if (!noticeView) {
      if (noticeEl) noticeEl.remove();
      noticeEl = null;
      return;
    }
    if (!noticeEl) noticeEl = buildNotice(noticeView);
    const table = document.querySelector("table");
    const anchor = table ? table.closest("[class*='MuiTableContainer']") || table : null;
    if (anchor && anchor.parentElement) {
      if (noticeEl.parentElement !== anchor.parentElement || noticeEl.nextElementSibling !== anchor) anchor.parentElement.insertBefore(noticeEl, anchor);
    } else if (!noticeEl.isConnected) (document.body || document.documentElement).prepend(noticeEl);
  }

  function record(ms) {
    stats.applies += 1;
    stats.totalMs += ms;
    if (ms > stats.maxMs) stats.maxMs = ms;
  }

  // Một lượt quét làm tối đa ~SLICE_MS rồi nhường trang; dòng còn lại chạy ở task sau (PM audit v0.2.0 P2.2: mỗi lượt < 2 ms,
  // kể cả lượt đầu còn "lạnh" lúc tải trang và danh sách dài tới 200 dòng).
  function runSlice(rows, from) {
    sliceTimer = null;
    if (!active || !model || !model.byCode) return;
    const t0 = now();
    let i = from;
    while (i < rows.length) {
      const tr = rows[i];
      i += 1;
      if (tr.isConnected) syncRow(tr);
      if (now() - t0 >= SLICE_MS) break;
    }
    record(now() - t0);
    if (i < rows.length) sliceTimer = setTimeout(runSlice, 0, rows, i);
  }

  function apply() {
    if (!active || !hasDom) return;
    if (sliceTimer) clearTimeout(sliceTimer); // quét lại từ đầu theo DOM / model mới nhất
    sliceTimer = null;
    syncNotice();
    // Chưa có dòng nào cần nút (vd. trang vừa tải, response danh sách chưa về): chỉ gỡ nút còn sót, không quét bảng.
    if (!model || !model.byCode || model.byCode.size === 0) {
      const t0 = now();
      for (const b of document.querySelectorAll("button." + BTN)) b.remove();
      record(now() - t0);
      return;
    }
    runSlice(Array.from(document.querySelectorAll("tr")), 0);
  }

  // Thay đổi do chính nút / vùng thông báo của ta (thêm / gỡ / đổi chữ / dời chỗ) không kích hoạt lượt quét lại.
  function isOwn(m) {
    const t = m.target;
    const el = t && t.nodeType === 1 ? t : t && t.parentElement;
    if (el && el.closest && el.closest("button." + BTN + ", ." + NOTE)) return true;
    const nodes = [...m.addedNodes, ...m.removedNodes];
    return nodes.length > 0 && nodes.every((n) => n.nodeType === 1 && n.classList && (n.classList.contains(BTN) || n.classList.contains(NOTE)));
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
      for (const ev of EVENTS) document.addEventListener(ev, onButtonEvent, true);
      observer = new MutationObserver(onMutations);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      if (!template) warmTimer = setTimeout(warmUp, 0, 0);
      apply();
    },
    deactivate() {
      if (!active) return;
      active = false;
      if (hasDom) for (const ev of EVENTS) document.removeEventListener(ev, onButtonEvent, true);
      if (observer) observer.disconnect();
      observer = null;
      if (timer) clearTimeout(timer);
      if (sliceTimer) clearTimeout(sliceTimer);
      if (warmTimer) clearTimeout(warmTimer);
      timer = null;
      sliceTimer = null;
      warmTimer = null;
      pendingSince = 0;
      model = null;
      noticeView = null; // rời danh sách: dọn cả vùng thông báo
      if (noticeEl) noticeEl.remove();
      noticeEl = null;
      if (hasDom) for (const b of document.querySelectorAll("button." + BTN)) b.remove();
    },
    show(m) {
      model = m;
      apply();
    },
    // notice(view | null): view = {tone: warn|err|info|ok, title, lines[], buttons[{label, onClick}]} — chỉ dùng khi trang là danh sách.
    notice(view) {
      if (!active || !hasDom) return;
      const next = view || null;
      if (next === noticeView) return syncNotice();
      noticeView = next;
      if (noticeEl) noticeEl.remove();
      noticeEl = null;
      syncNotice();
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
