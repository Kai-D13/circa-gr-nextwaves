/* Popup: chọn môi trường (STG / PRD / theo URL), cấp phép điền phiếu từng lần, xem / xoá phiên. Không hiển thị token. */
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
    return mode === "URL" ? E.envFromAnyUrl($("url").value.trim()) : E.envById(mode);
  }

  function showEnv() {
    const mode = $("mode").value;
    $("url").hidden = mode !== "URL";
    const env = selectedEnv();
    if (!env) {
      $("envInfo").textContent = mode === "URL" && $("url").value.trim() ? "URL không thuộc môi trường đã biết." : "";
      return;
    }
    const store = env.storeAllowlist ? `chỉ cửa hàng ${env.storeAllowlist.join(", ")}` : "theo cửa hàng đang đăng nhập";
    $("envInfo").textContent = `${env.label}: POS ${env.posOrigin} · Nextwaves ${env.nwUiOrigin} · ${store}${env.writeEnabled ? "" : " · CHỈ ĐỌC"}`;
  }

  async function renderGrants(env) {
    $("grantBox").hidden = !(env && env.writeEnabled);
    if (!env || !env.writeEnabled) return;
    const list = (await bg("grant:list")).filter((g) => g.envId === env.id);
    const box = $("grants");
    box.replaceChildren();
    for (const g of list) {
      const row = el("div", undefined, "s");
      const info = el("div");
      info.appendChild(el("b", `${g.envId} · ${g.grCode}`));
      info.appendChild(el("span", `Hết hạn ${new Date(g.expiresAt).toLocaleTimeString("vi-VN")}`));
      row.appendChild(info);
      const del = el("button", "Thu hồi", "sec");
      del.addEventListener("click", async () => {
        await bg("grant:revoke", { key: `${g.envId}:${g.grCode}` });
        renderGrants(env);
      });
      row.appendChild(del);
      box.appendChild(row);
    }
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
      info.appendChild(el("b", `${s.envId} · ${s.grCode || s.grId}`));
      info.appendChild(el("span", STATE_LABEL[s.state] || s.state));
      info.appendChild(el("span", `${s.deliveryCode || s.soBase}${s.nwPoNumber ? ` → ${s.nwPoNumber}` : ""} · ${new Date(s.updatedAt).toLocaleString("vi-VN")}`));
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
    showEnv();
    renderGrants(E.envFromConfig(c));
    renderSessions();
  }

  $("mode").addEventListener("change", showEnv);
  $("url").addEventListener("input", showEnv);
  $("save").addEventListener("click", async () => {
    const mode = $("mode").value;
    const patch = mode === "URL" ? { mode: "", url: $("url").value.trim() } : { mode, url: "" };
    try {
      const c = await bg("config:set", { patch });
      say("msg", "Đã lưu. Tải lại tab POS / Nextwaves đang mở.");
      renderGrants(E.envFromConfig(c));
    } catch (err) {
      say("msg", String((err && err.message) || err), true);
    }
  });
  $("grant").addEventListener("click", async () => {
    try {
      const c = await bg("config:get");
      const env = E.envFromConfig(c);
      if (!env) throw new Error("Chưa lưu môi trường");
      const g = await bg("grant:create", { envId: env.id, grCode: $("grCode").value });
      say("grantMsg", `Đã cho phép điền 1 lần: ${g.grCode} (${env.label}).`);
      $("grCode").value = "";
      renderGrants(env);
    } catch (err) {
      say("grantMsg", String((err && err.message) || err), true);
    }
  });

  load().catch((err) => say("msg", String((err && err.message) || err), true));
})();
