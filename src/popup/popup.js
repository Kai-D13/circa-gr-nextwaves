/* Popup: chọn môi trường (STG / PRD / theo URL), chế độ điền phiếu, xem / xoá phiên. Không hiển thị token. */
(function () {
  "use strict";
  const E = globalThis.__CGN__.env;
  const $ = (id) => document.getElementById(id);
  const STATE_LABEL = {
    waiting_nw: "Chờ nhận trên Nextwaves",
    nw_ready: "Đã khớp đơn Nextwaves",
    received: "Nextwaves đã nhận — chờ điền phiếu",
    applying: "Đang điền phiếu",
    applied: "Đã điền phiếu — chờ HOÀN THÀNH",
    apply_stopped: "Điền phiếu bị dừng",
    done: "Đã HOÀN THÀNH",
  };
  const WRITE_NOTE = {
    off: "",
    confirm: "Extension sẽ GHI vào phiếu nhận POS (PUT chi tiết lô) sau khi dược sĩ bấm nút trên khung extension.",
    auto: "Extension sẽ tự GHI vào phiếu nhận POS ngay khi Nextwaves nhận đủ.",
  };

  async function bg(type, extra) {
    const r = await chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
    if (!r || !r.ok) throw new Error((r && r.error) || "background");
    return r.data;
  }

  function el(tag, text) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showEnv() {
    const mode = $("mode").value;
    $("url").hidden = mode !== "URL";
    const env = mode === "URL" ? E.envFromAnyUrl($("url").value.trim()) : E.envById(mode);
    if (!env) {
      $("envInfo").textContent = mode === "URL" && $("url").value.trim() ? "URL không thuộc môi trường đã biết." : "";
      return;
    }
    const store = env.storeAllowlist ? `chỉ cửa hàng ${env.storeAllowlist.join(", ")}` : "theo cửa hàng đang đăng nhập";
    $("envInfo").textContent = `${env.label}: POS ${env.posOrigin} · Nextwaves ${env.nwUiOrigin} · ${store}`;
  }

  function showWriteNote() {
    $("writeNote").textContent = WRITE_NOTE[$("writeMode").value] || "";
  }

  async function renderSessions() {
    const list = await bg("session:list");
    const box = $("sessions");
    box.replaceChildren();
    if (!list.length) {
      box.appendChild(el("p", "Chưa có phiên.")).className = "note";
      return;
    }
    for (const s of list.slice(0, 20)) {
      const row = el("div");
      row.className = "s";
      const info = el("div");
      info.appendChild(el("b", `${s.envId} · ${s.grCode || s.grId}`));
      info.appendChild(el("span", STATE_LABEL[s.state] || s.state));
      info.appendChild(el("span", `${s.deliveryCode || s.soBase}${s.nwPoNumber ? ` → ${s.nwPoNumber}` : ""} · ${new Date(s.updatedAt).toLocaleString("vi-VN")}`));
      if (s.applyError) info.appendChild(el("span", `Dừng: ${s.applyError.reason}${s.applyError.status ? ` (HTTP ${s.applyError.status})` : ""}`));
      row.appendChild(info);
      const del = el("button", "Xoá");
      del.className = "sec";
      del.addEventListener("click", async () => {
        await bg("session:cancel", { key: s.key });
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
    $("writeMode").value = c.writeMode || "off";
    showEnv();
    showWriteNote();
    renderSessions();
  }

  $("mode").addEventListener("change", showEnv);
  $("url").addEventListener("input", showEnv);
  $("writeMode").addEventListener("change", showWriteNote);
  $("save").addEventListener("click", async () => {
    const mode = $("mode").value;
    const patch = { writeMode: $("writeMode").value };
    if (mode === "URL") Object.assign(patch, { mode: "", url: $("url").value.trim() });
    else Object.assign(patch, { mode, url: "" });
    try {
      await bg("config:set", { patch });
      $("msg").className = "";
      $("msg").textContent = "Đã lưu. Tải lại tab POS / Nextwaves đang mở.";
    } catch (err) {
      $("msg").className = "err";
      $("msg").textContent = String((err && err.message) || err);
    }
  });

  load().catch((err) => {
    $("msg").className = "err";
    $("msg").textContent = String((err && err.message) || err);
  });
})();
