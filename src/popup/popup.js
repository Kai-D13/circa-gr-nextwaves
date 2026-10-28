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
    auto_completing: "Đang tự HOÀN THÀNH (đã giữ lượt gửi)",
    auto_complete_unknown: "Chưa rõ đã HOÀN THÀNH chưa — không gửi lại",
  };
  // Phiên còn hoạt động (như background / trang POS): chỉ các phiên này mới được cấp phép điền.
  const ACTIVE = new Set(["waiting_nw", "nw_ready", "received", "applying", "applied", "apply_stopped", "auto_completing", "auto_complete_unknown"]);
  // Tem dự kiến của phiên (phiếu gửi Nextwaves đã khớp) — như background tính khi cấp quyền tự động.
  const expectedEpcCount = (s) =>
    new Set(((s.expected && s.expected.shipments) || []).flatMap((sh) => (sh.lines || []).flatMap((l) => (l.units || []).map((u) => String(u.epc || "").toUpperCase()))).filter(Boolean)).size;
  const hhmm = (ms) => new Date(ms).toLocaleTimeString("vi-VN");

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

  // v0.3.0 (PM DECISION-ONE-STG-AUTO-FLOW §2.1): quyền tự điền + tự HOÀN THÀNH một lần cho đúng một phiên đã khớp đơn Nextwaves, trước
  // khi dược sĩ xác nhận nhận hàng. Bấm nút chỉ MỞ khung xác nhận ghi rõ phạm vi; phải bấm "Xác nhận cho phép" mới gửi auto:arm.
  function autoBlock(env, s, autoGrant) {
    const wrap = el("div", undefined, "auto");
    if (autoGrant) {
      wrap.appendChild(el("span", `Tự động: ĐÃ CHO PHÉP 1 lần · hết hạn ${hhmm(autoGrant.expiresAt)}`));
      const revoke = el("button", "Thu hồi tự động", "sec");
      revoke.addEventListener("click", async () => {
        try {
          await bg("auto:revoke", { key: s.key });
          say("msg", `Đã thu hồi quyền tự động ${s.grCode}.`);
        } catch (err) {
          say("msg", String((err && err.message) || err), true);
        }
        renderSessions(env);
      });
      wrap.appendChild(revoke);
      return wrap;
    }
    // v0.3.0 P2.5: lượt tự động đã bị bỏ qua (kế hoạch / phiếu / trang không đạt, quyền hết hạn / không khớp lúc nhận) → nói rõ đã dừng,
    // không còn nút / chữ "ĐÃ CHO PHÉP". Đã dùng quyền (claim tự động) → chỉ báo đã dùng.
    const skipped = (s.autoRun && s.autoRun.skipped) || (s.state !== "nw_ready" && (s.log || []).some((l) => l.type === "auto_skipped"));
    if (skipped) {
      wrap.appendChild(el("span", "Tự động đã dừng — xử lý theo luồng thủ công (cấp phép điền + dược sĩ HOÀN THÀNH)."));
      return wrap;
    }
    if (s.authorization && s.authorization.auto) {
      wrap.appendChild(el("span", "Tự động: đã dùng quyền 1 lần cho lượt nhận này."));
      return wrap;
    }
    if (!env || !env.writeEnabled || s.envId !== env.id || s.state !== "nw_ready") return null;
    const epcs = expectedEpcCount(s);
    const open = el("button", "Cho phép tự điền và HOÀN THÀNH 1 lần", "sec");
    open.addEventListener("click", () => {
      wrap.replaceChildren();
      const box = el("div", undefined, "confirm");
      box.appendChild(el("b", "Xác nhận cho phép TỰ ĐỘNG một lần"));
      for (const line of [
        `Môi trường: ${env.label} · cửa hàng ${s.posName || s.posId}`,
        `Phiếu nhận: ${s.grCode} · SO ${s.deliveryCode}`,
        `Nextwaves: ${s.nwPoNumber} · ${epcs} tem dự kiến`,
        "Sau khi dược sĩ bấm “Xác nhận nhận hàng” trên Nextwaves, extension TỰ ĐIỀN phiếu và POS sẽ TỰ HOÀN THÀNH sau khi đọc lại đúng toàn bộ phiếu.",
        "Lỗi / không rõ thì dừng, không tự thử lại. Quyền hết hạn sau 30 phút, chỉ dùng một lần.",
      ])
        box.appendChild(el("span", line));
      const yes = el("button", "Xác nhận cho phép");
      yes.addEventListener("click", async () => {
        try {
          const g = await bg("auto:arm", { key: s.key, confirm: { grCode: s.grCode, nwPoNumber: s.nwPoNumber, epcCount: epcs } });
          say("msg", `Đã cho phép tự động 1 lần: ${g.grCode} → ${g.nwPoNumber}, hết hạn ${hhmm(g.expiresAt)}.`);
        } catch (err) {
          say("msg", String((err && err.message) || err), true);
        }
        renderSessions(env);
      });
      const no = el("button", "Huỷ", "sec");
      no.addEventListener("click", () => renderSessions(env));
      box.appendChild(yes);
      box.appendChild(no);
      wrap.appendChild(box);
    });
    wrap.appendChild(open);
    return wrap;
  }

  async function renderSessions(env) {
    const list = await bg("session:list");
    const autos = new Map((await bg("auto:list").catch(() => [])).map((g) => [g.key, g]));
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
      if (!s.schema) info.appendChild(el("span", "Phiên của bản cũ — không dùng để điền; mở lại phiếu để tạo phiên mới"));
      const locks = [].concat(s.writeLocks || [], s.nwWriteLocks || []);
      if (locks.length) info.appendChild(el("span", `Khoá điền: ${locks.join(", ")}`));
      if (s.applyError) info.appendChild(el("span", `Dừng: ${s.applyError.reason}${s.applyError.status ? ` (HTTP ${s.applyError.status})` : ""}`));
      const ab = autoBlock(env, s, autos.get(s.key));
      if (ab) info.appendChild(ab);
      row.appendChild(info);
      const del = el("button", "Xoá", "sec");
      del.addEventListener("click", async () => {
        try {
          await bg("session:cancel", { key: s.key });
        } catch (err) {
          say("msg", String((err && err.message) || err), true);
        }
        renderSessions(env);
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
    renderSessions(E.envFromConfig(c));
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
      // v0.2.5 (PM AUDIT-A1 P3): chỉ cấp phép khi mã khớp CHÍNH XÁC một phiên còn hoạt động của môi trường đang chọn (A1 28/10: "GR3887"
      // gõ thiếu số 0 vẫn tạo được cấp phép). So như background (bỏ khoảng trắng hai đầu, chữ hoa); không sửa ô nhập.
      // Không đọc được phiên → không cấp.
      const code = String($("grCode").value || "").trim().toUpperCase();
      let list;
      try {
        list = await bg("session:list");
      } catch (err) {
        throw new Error(`Không đọc được danh sách phiên — chưa cấp phép (${String((err && err.message) || err)}).`);
      }
      const open = (list || []).filter((s) => s && s.schema && s.envId === env.id && ACTIVE.has(s.state));
      if (!open.some((s) => String(s.grCode || "").toUpperCase() === code)) {
        const codes = [...new Set(open.map((s) => s.grCode))];
        const odd = /[^A-Z0-9]/.test(code) ? " Mã có ký tự lạ (khoảng trắng / ký tự ẩn, thường do dán) — hãy gõ tay." : "";
        throw new Error(`Mã phiếu không khớp phiên đang có — chưa cấp phép.${odd} ${codes.length ? `Phiên đang mở (${env.label}): ${codes.join(", ")}.` : `Không có phiên đang mở ở ${env.label}.`}`);
      }
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
