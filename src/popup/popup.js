/* Popup (v0.4.0): chọn môi trường (STG / PRD / theo URL) + tenant Nextwaves của máy, xem / mở / xoá phiên. Không hiển thị token.
 * Không còn cấp phép điền / quyền tự động: tab POS tự điền sau khi Nextwaves nhận, dược sĩ tự bấm HOÀN THÀNH. */
(function () {
  "use strict";
  const E = globalThis.__CGN__.env;
  const $ = (id) => document.getElementById(id);
  const STATE_LABEL = {
    waiting_nw: "Chờ nhận trên Nextwaves",
    no_nw_order: "Nextwaves chưa có đơn chờ nhận — nhận tay",
    nw_ready: "Đã khớp đơn Nextwaves — chờ nhận hàng",
    received: "Nextwaves đã nhận — POS đang / sắp tự điền",
    applying: "Đang điền phiếu",
    applied: "Đã điền phiếu — dược sĩ kiểm rồi HOÀN THÀNH",
    apply_stopped: "Điền phiếu bị dừng — mở phiếu, bấm “Đọc lại và điền tiếp”",
    done: "Đã HOÀN THÀNH",
  };
  const READER_LABEL = { released: "đã mượn (tab bán hàng nhả)", free: "đã mượn (đầu đọc trống)", off: "QR Scan Log đang Ngắt", no_qsl: "QR Scan Log chưa hỗ trợ mượn", no_answer: "QR Scan Log không trả lời", busy: "tab bán hàng đang đọc", returned: "đã trả", return_failed: "trả chưa được" };

  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }

  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function say(id, text, isErr) {
    $(id).className = "msg" + (isErr ? " err" : "");
    $(id).textContent = text;
  }

  function selectedEnv() {
    const mode = $("mode").value;
    const base = mode === "URL" ? E.envFromAnyUrl($("url").value.trim()) : E.envById(mode);
    return base ? E.withTenant(base, $("tenant").value) : null;
  }

  function showEnv() {
    const mode = $("mode").value;
    $("url").hidden = mode !== "URL";
    const env = selectedEnv();
    const base = mode === "URL" ? E.envFromAnyUrl($("url").value.trim()) : E.envById(mode);
    $("tenantRow").hidden = !base || !!base.nwTenantFixed;
    const t = $("tenant").value.trim();
    $("tenantNote").textContent = t && !E.normTenant(t) ? "Tenant chỉ gồm chữ thường, số, gạch ngang (ví dụ circa, circa-medly)." : "";
    if (!env) {
      $("envInfo").textContent = mode === "URL" && $("url").value.trim() ? "URL không thuộc môi trường đã biết." : "";
      return;
    }
    $("envInfo").textContent = `${env.label}: POS ${env.posOrigin} · Nextwaves ${env.nwUiOrigin} · mọi cửa hàng (theo cửa hàng đang đăng nhập POS)${env.writeEnabled ? "" : " · CHỈ ĐỌC"}`;
  }

  async function renderSessions() {
    const list = await bg("session:list");
    const box = $("sessions");
    box.replaceChildren();
    if (!list.length) {
      box.appendChild(el("p", "Chưa có phiên.", "note"));
      return;
    }
    for (const s of list.slice(0, 20)) {
      const row = el("div", undefined, "s");
      const info = el("div");
      info.appendChild(el("b", `${s.envId} · ${s.grCode || s.grId}${s.posName ? ` · ${s.posName}` : ""}`));
      info.appendChild(el("span", STATE_LABEL[s.state] || s.state));
      const wh = s.warehouseName || s.warehouseCode ? ` · kho ${[s.warehouseName, s.warehouseCode ? `(${s.warehouseCode})` : ""].filter(Boolean).join(" ")}` : "";
      info.appendChild(el("span", `${s.deliveryCode || s.soBase}${s.nwPoNumber ? ` → ${s.nwPoNumber}` : ""}${wh} · ${new Date(s.updatedAt).toLocaleString("vi-VN")}`));
      if (s.nwTenant) info.appendChild(el("span", `Tenant Nextwaves: ${s.nwTenant}`));
      if (s.reader && s.reader.state) info.appendChild(el("span", `Đầu đọc: ${READER_LABEL[s.reader.state] || s.reader.state}`));
      if (!s.schema || s.schema < 2) info.appendChild(el("span", "Phiên của bản cũ — không dùng để điền; mở lại phiếu để tạo phiên mới"));
      const locks = [].concat(s.writeLocks || [], s.nwWriteLocks || []);
      if (locks.length) info.appendChild(el("span", `Khoá điền: ${locks.join(", ")}`));
      if (s.applyError) info.appendChild(el("span", `Dừng: ${s.applyError.reason}${s.applyError.status ? ` (HTTP ${s.applyError.status})` : ""}`));
      row.appendChild(info);
      const del = el("button", "Xoá", "sec");
      del.addEventListener("click", async () => {
        try {
          await bg("session:cancel", { key: s.key });
        } catch (err) {
          say("msg", String((err && err.message) || err), true);
        }
        renderSessions();
      });
      row.appendChild(del);
      box.appendChild(row);
    }
  }

  async function load() {
    $("ver").textContent = "v" + chrome.runtime.getManifest().version;
    const c = await bg("config:get");
    $("mode").value = c.mode || (c.url ? "URL" : "");
    $("url").value = c.url || "";
    $("tenant").value = c.nwTenant || "";
    showEnv();
    renderSessions();
  }

  $("mode").addEventListener("change", showEnv);
  $("url").addEventListener("input", showEnv);
  $("tenant").addEventListener("input", showEnv);
  $("save").addEventListener("click", async () => {
    const mode = $("mode").value;
    const nwTenant = $("tenant").value.trim().toLowerCase();
    const patch = mode === "URL" ? { mode: "", url: $("url").value.trim(), nwTenant } : { mode, url: "", nwTenant };
    try {
      await bg("config:set", { patch });
      say("msg", "Đã lưu. Tải lại (F5) tab POS / Nextwaves đang mở.");
      showEnv();
    } catch (err) {
      say("msg", String((err && err.message) || err), true);
    }
  });

  load().catch((err) => say("msg", String((err && err.message) || err), true));
})();
