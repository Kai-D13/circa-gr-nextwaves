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
  return { b, $, sent, grants, press };
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
