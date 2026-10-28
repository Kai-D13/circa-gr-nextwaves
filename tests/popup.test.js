"use strict";
// v0.2.5 (PM AUDIT-A1-GR03887 P3): popup cảnh báo TRƯỚC khi gửi grant:create khi mã phiếu không khớp phiên đang hoạt động.
// A1 thật 28/10: operator gõ "GR3887" (thiếu số 0) → v0.2.4 tạo cấp phép STG:GR3887 không dùng được cho phiếu nào.
// Chạy THẬT src/popup/popup.js (+ lib/env.js) trên DOM giả, message tới background thật của trình duyệt giả. Không gọi POS / Nextwaves.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowser, until, settle, closeAll } = require("./browser-sim.js");
const { createDom } = require("./fake-dom.js");
const H = require("./helpers.js");

test.afterEach(() => closeAll());

const SRC = path.join(__dirname, "..", "src");
const GR_ID = "f2ae6e25-64bc-497b-81db-2de87284ec80";
const session = (extra) =>
  Object.assign({ schema: 1, key: `STG:${GR_ID}`, envId: "STG", grId: GR_ID, grCode: "GR03887", deliveryCode: "SOBD1594095-F", soBase: "SOBD1594095", state: "received", writeLocks: [], nwWriteLocks: [], createdAt: Date.now(), updatedAt: Date.now(), log: [] }, extra || {});

// Mở popup trên trình duyệt giả có sẵn phiên `sessions`. `sent` ghi lại mọi message popup gửi background.
async function openPopup({ sessions = [], config = { mode: "STG", url: "" }, interceptBg } = {}) {
  const sent = [];
  const b = createBrowser(
    async () => {
      throw new Error("popup không được gọi mạng");
    },
    { interceptBg: (msg) => (sent.push(msg.type), interceptBg ? interceptBg(msg) : undefined) },
  );
  await b.setConfig(config);
  b.store.sessions = Object.fromEntries(sessions.map((s) => [s.key, s]));
  const dom = createDom();
  const ids = [["small", "ver"], ["select", "mode"], ["input", "url"], ["p", "envInfo"], ["button", "save"], ["span", "msg"], ["section", "grantBox"], ["input", "grCode"], ["button", "grant"], ["p", "grantMsg"], ["div", "grants"], ["div", "sessions"]];
  for (const [tag, id] of ids) dom.document.body.appendChild(dom.el(tag, undefined, id));
  const chrome = { runtime: { sendMessage: (msg) => b.sendFromPopup(msg), getManifest: () => JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8")) } };
  const ctx = vm.createContext({ document: dom.document, chrome, console, URL });
  for (const f of ["lib/env.js", "popup/popup.js"]) vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), ctx, { filename: f });
  const $ = (id) => dom.document.getElementById(id);
  await until(() => $("grantBox").hidden === false && sent.includes("session:list"));
  const grants = async () => (await b.sendFromPopup({ type: "grant:list" })).data;
  // Gõ mã → bấm "Cho phép điền 1 lần" → chờ dòng thông báo đổi.
  const press = async (code) => {
    $("grantMsg").textContent = "";
    $("grCode").value = code;
    $("grant").click();
    await until(() => $("grantMsg").textContent !== "");
    await settle(30);
    return { text: $("grantMsg").textContent, err: /\berr\b/.test($("grantMsg").className) };
  };
  return { b, $, sent, grants, press, dom };
}

test("P3: mã gõ nhầm 'GR3887' khi phiên là GR03887 → cảnh báo không khớp, KHÔNG gửi grant:create, 0 cấp phép, giữ nguyên ô nhập", async () => {
  const p = await openPopup({ sessions: [session()] });
  try {
    const r = await p.press("GR3887");
    assert.equal(r.err, true);
    assert.match(r.text, /^Mã phiếu không khớp phiên đang có/);
    assert.match(r.text, /GR03887/, "nêu mã của phiên đang mở để operator so");
    assert.ok(!p.sent.includes("grant:create"), "không gửi grant:create");
    assert.deepEqual(await p.grants(), []);
    assert.equal(p.$("grCode").value, "GR3887", "không tự sửa / xoá mã người dùng nhập");
  } finally {
    p.b.close();
  }
});

test("P3: mã đúng GR03887 + phiên STG đang hoạt động → đúng một cấp phép như cũ (30 phút, một lần)", async () => {
  for (const state of ["received", "apply_stopped", "nw_ready"]) {
    const p = await openPopup({ sessions: [session({ state })] });
    try {
      const r = await p.press("GR03887");
      assert.equal(r.err, false, state);
      assert.match(r.text, /^Đã cho phép điền 1 lần: GR03887 \(Staging\)\.$/);
      const g = await p.grants();
      assert.deepEqual(g.map((x) => [x.envId, x.grCode]), [["STG", "GR03887"]]);
      assert.equal(p.sent.filter((t) => t === "grant:create").length, 1);
    } finally {
      p.b.close();
    }
  }
});

test("P3: mã đúng nhưng gõ chữ thường / có khoảng trắng → so như background (trim + chữ hoa), cấp phép GR03887", async () => {
  const p = await openPopup({ sessions: [session()] });
  try {
    const r = await p.press("  gr03887 ");
    assert.equal(r.err, false);
    assert.deepEqual((await p.grants()).map((x) => x.grCode), ["GR03887"]);
  } finally {
    p.b.close();
  }
});

test("P3: mã đúng nhưng chỉ có phiên PRD, phiên done, hoặc phiên bản cũ (không schema) → cảnh báo, 0 cấp phép", async () => {
  const cases = [
    ["PRD", [session({ envId: "PRD", key: `PRD:${GR_ID}` })]],
    ["done", [session({ state: "done" })]],
    ["không schema", [session({ schema: undefined })]],
    ["không có phiên", []],
  ];
  for (const [name, sessions] of cases) {
    const p = await openPopup({ sessions });
    try {
      const r = await p.press("GR03887");
      assert.equal(r.err, true, name);
      assert.match(r.text, /^Mã phiếu không khớp phiên đang có/, name);
      assert.ok(!p.sent.includes("grant:create"), name);
      assert.deepEqual(await p.grants(), [], name);
    } finally {
      p.b.close();
    }
  }
});

test("P3: không đọc được danh sách phiên (background lỗi) → báo lỗi, KHÔNG gửi grant:create, 0 cấp phép", async () => {
  let fail = false;
  const p = await openPopup({ sessions: [session()], interceptBg: (msg) => (fail && msg.type === "session:list" ? { ok: false, error: "lỗi giả" } : undefined) });
  try {
    fail = true;
    const r = await p.press("GR03887");
    assert.equal(r.err, true);
    assert.match(r.text, /Không đọc được danh sách phiên/);
    assert.ok(!p.sent.includes("grant:create"));
    assert.deepEqual(await p.grants(), []);
  } finally {
    p.b.close();
  }
});

// ---------- v0.3.0 (PM DECISION-ONE-STG-AUTO-FLOW §2.1): quyền tự động một lần trong popup ----------
const A1KEY = `STG:${GR_ID}`;
const a1Ready = (extra) => {
  const s = H.clone(H.sample("ext-stg-storage-GR03887-20261028.json").sessions[A1KEY]);
  for (const k of ["nwResult", "scanOk", "authorization", "applyResult", "applyToken", "lease", "autoRun", "autoToken", "completeClaim", "completeResult"]) delete s[k];
  return Object.assign(s, { state: "nw_ready", posName: "2222", log: [], createdAt: Date.now(), updatedAt: Date.now() }, extra || {});
};
const buttons = (dom, label) => dom.all(dom.document.body, (n) => n.tagName === "BUTTON" && n.textContent === label);
const texts = (dom) => dom.all(dom.document.getElementById("sessions"), (n) => n.tagName === "SPAN").map((n) => n.textContent);

test("v0.3.0 popup: phiên nw_ready có nút cho phép tự động; bấm chỉ MỞ khung xác nhận ghi rõ môi trường / cửa hàng / GR / SO / PO / số tem / việc tự HOÀN THÀNH; chỉ 'Xác nhận cho phép' mới gửi auto:arm; sau đó hiện hạn + 'Thu hồi tự động'", async () => {
  const p = await openPopup({ sessions: [a1Ready()] });
  try {
    await until(() => buttons(p.dom, "Cho phép tự điền và HOÀN THÀNH 1 lần").length === 1);
    buttons(p.dom, "Cho phép tự điền và HOÀN THÀNH 1 lần")[0].click();
    const t = texts(p.dom).join("\n");
    for (const re of [/Môi trường: Staging · cửa hàng 2222/, /Phiếu nhận: GR03887 · SO SOBD1594095-F/, /Nextwaves: PO13806459 · 15 tem dự kiến/, /TỰ ĐIỀN phiếu và POS sẽ TỰ HOÀN THÀNH/, /hết hạn sau 30 phút, chỉ dùng một lần/i]) assert.match(t, re);
    await settle(50);
    assert.ok(!p.sent.includes("auto:arm"), "mở khung xác nhận chưa gửi gì");
    buttons(p.dom, "Xác nhận cho phép")[0].click();
    await until(() => p.sent.includes("auto:arm"));
    const g = await until(async () => (await p.b.sendFromPopup({ type: "auto:list" })).data[0]);
    assert.deepEqual([g.grCode, g.nwPoNumber, g.epcs.length], ["GR03887", "PO13806459", 15]);
    await until(() => buttons(p.dom, "Thu hồi tự động").length === 1);
    assert.ok(texts(p.dom).some((x) => /Tự động: ĐÃ CHO PHÉP 1 lần · hết hạn/.test(x)));
    buttons(p.dom, "Thu hồi tự động")[0].click();
    await until(async () => (await p.b.sendFromPopup({ type: "auto:list" })).data.length === 0);
  } finally {
    p.b.close();
  }
});

test("v0.3.0 popup: 'Huỷ' trong khung xác nhận không cấp quyền; không có nút cho phép ở phiên đã nhận / chưa khớp đơn / môi trường PRD", async () => {
  const p = await openPopup({ sessions: [a1Ready()] });
  try {
    await until(() => buttons(p.dom, "Cho phép tự điền và HOÀN THÀNH 1 lần").length === 1);
    buttons(p.dom, "Cho phép tự điền và HOÀN THÀNH 1 lần")[0].click();
    buttons(p.dom, "Huỷ")[0].click();
    await settle(80);
    assert.ok(!p.sent.includes("auto:arm"));
    assert.equal((await p.b.sendFromPopup({ type: "auto:list" })).data.length, 0);
  } finally {
    p.b.close();
  }
  for (const [name, s] of [["received", a1Ready({ state: "received" })], ["waiting_nw", a1Ready({ state: "waiting_nw" })], ["PRD", a1Ready({ envId: "PRD", key: "PRD:" + GR_ID })]]) {
    const q = await openPopup({ sessions: [s] }); // popup ở Staging: phiên PRD không có nút
    try {
      await settle(80);
      assert.equal(buttons(q.dom, "Cho phép tự điền và HOÀN THÀNH 1 lần").length, 0, name);
    } finally {
      q.b.close();
    }
  }
});

test("v0.3.0 P2.5 popup: lượt tự động đã bị bỏ qua → 'Tự động đã dừng — xử lý theo luồng thủ công', không 'ĐÃ CHO PHÉP', không nút; đã dùng quyền → báo đã dùng", async () => {
  const cases = [
    ["skipped", a1Ready({ state: "received", autoRun: { at: Date.now(), tabId: 1, skipped: { at: Date.now(), reason: "plan_blocked" } } }), /Tự động đã dừng — xử lý theo luồng thủ công/],
    ["skip lúc nhận", a1Ready({ state: "received", log: [{ at: new Date().toISOString(), type: "auto_skipped", reason: "epc_set" }] }), /Tự động đã dừng/],
    ["đã dùng", a1Ready({ state: "applied", authorization: { auto: true, grCode: "GR03887", planHash: "EF0E020C" } }), /đã dùng quyền 1 lần/],
  ];
  for (const [name, s, re] of cases) {
    const p = await openPopup({ sessions: [s] });
    try {
      await until(() => texts(p.dom).some((x) => re.test(x)));
      assert.ok(!texts(p.dom).some((x) => /ĐÃ CHO PHÉP/.test(x)), name);
      assert.equal(buttons(p.dom, "Cho phép tự điền và HOÀN THÀNH 1 lần").length, 0, name);
      assert.equal(buttons(p.dom, "Thu hồi tự động").length, 0, name);
    } finally {
      p.b.close();
    }
  }
});
