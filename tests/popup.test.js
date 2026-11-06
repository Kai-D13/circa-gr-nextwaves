"use strict";
// v0.4.0 popup: môi trường + tenant Nextwaves của máy + phiên gần đây (Xoá). Không còn cấp phép điền / quyền tự động.
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
  Object.assign(
    { schema: 2, nwTenant: "circa-stg", key: `STG:${GR_ID}`, envId: "STG", grId: GR_ID, grCode: "GR03887", posName: "2222", deliveryCode: "SOBD1594095-F", soBase: "SOBD1594095", state: "received", writeLocks: [], nwWriteLocks: [], createdAt: Date.now(), updatedAt: Date.now(), log: [] },
    extra || {}
  );
const fire = (el, type) => el.listeners.filter((l) => l.type === type).forEach((l) => l.fn({ type, target: el }));

async function openPopup({ sessions = [], config = { mode: "STG", url: "" } } = {}) {
  const sent = [];
  const b = createBrowser(
    async () => {
      throw new Error("popup không được gọi mạng");
    },
    { interceptBg: (msg) => (sent.push(msg.type), undefined) }
  );
  await b.setConfig(config);
  b.store.sessions = Object.fromEntries(sessions.map((s) => [s.key, s]));
  const dom = createDom();
  const ids = [["small", "ver"], ["select", "mode"], ["input", "url"], ["div", "tenantRow"], ["input", "tenant"], ["p", "tenantNote"], ["p", "envInfo"], ["button", "save"], ["span", "msg"], ["div", "sessions"]];
  for (const [tag, id] of ids) dom.document.body.appendChild(dom.el(tag, undefined, id));
  const chrome = { runtime: { sendMessage: (msg) => b.sendFromPopup(msg), getManifest: () => JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8")) } };
  const ctx = vm.createContext({ document: dom.document, chrome, console, URL });
  for (const f of ["lib/env.js", "popup/popup.js"]) vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), ctx, { filename: f });
  const $ = (id) => dom.document.getElementById(id);
  await until(() => sent.includes("session:list") && $("ver").textContent);
  await settle(20);
  return { b, $, sent, dom };
}

test("v0.4.0 popup: không còn cấp phép / quyền tự động — không gửi grant:* / auto:*; nhãn môi trường 'mọi cửa hàng'", async () => {
  const p = await openPopup({ sessions: [session({ state: "nw_ready" })] });
  try {
    assert.equal(p.$("ver").textContent, "v" + require("../src/manifest.json").version);
    assert.match(p.$("envInfo").textContent, /^Staging: POS https:\/\/pos\.stg\.circa-v2\.buymed\.tech · Nextwaves https:\/\/circa-stg\.nextwaves\.app · mọi cửa hàng/);
    assert.equal(p.$("tenantRow").hidden, true, "staging: tenant cố định, không có ô");
    const text = p.$("sessions").textContent;
    assert.match(text, /GR03887/);
    assert.ok(!/Cho phép|cấp phép/i.test(text), "không còn nút / chữ cấp phép");
    assert.ok(!p.sent.some((t) => /^(grant|auto):/.test(t)), p.sent.join(","));
  } finally {
    p.b.close();
  }
});

test("v0.4.0 popup: Production có ô Tenant Nextwaves (mặc định circa); lưu tenant hợp lệ → URL Nextwaves đổi; tenant sai → báo, không lưu", async () => {
  const p = await openPopup({ config: { mode: "PRD", url: "" } });
  try {
    assert.equal(p.$("tenantRow").hidden, false);
    assert.equal(p.$("tenant").value, "");
    assert.match(p.$("envInfo").textContent, /Nextwaves https:\/\/circa\.nextwaves\.app · mọi cửa hàng/);
    p.$("tenant").value = "Circa-Medly";
    fire(p.$("tenant"), "input");
    assert.match(p.$("envInfo").textContent, /Nextwaves https:\/\/circa-medly\.nextwaves\.app/);
    p.$("save").click();
    await until(() => p.$("msg").textContent);
    assert.match(p.$("msg").textContent, /^Đã lưu/);
    assert.deepEqual(p.b.store.config, { mode: "PRD", url: "", nwTenant: "circa-medly" });
    p.$("msg").textContent = "";
    p.$("tenant").value = "circa.evil";
    fire(p.$("tenant"), "input");
    assert.match(p.$("tenantNote").textContent, /chữ thường, số, gạch ngang/);
    p.$("save").click();
    await until(() => p.$("msg").textContent);
    assert.match(p.$("msg").className, /err/);
    assert.equal(p.b.store.config.nwTenant, "circa-medly", "tenant sai không lưu");
  } finally {
    p.b.close();
  }
});

test("v0.4.0 popup: phiên gần đây ghi trạng thái mới (không có đơn / tự điền / dừng), kho, tenant, đầu đọc; Xoá gọi session:cancel", async () => {
  const sessions = [
    session({ key: "STG:a", grCode: "GR00001", state: "no_nw_order", updatedAt: 3 }),
    session({ key: "STG:b", grCode: "GR00002", state: "applied", warehouseName: "CIRCA FLORITA", warehouseCode: "30145", nwPoNumber: "PO1", reader: { state: "returned" }, updatedAt: 2 }),
    session({ key: "STG:c", grCode: "GR00003", state: "apply_stopped", applyError: { reason: "put_uncertain", status: 503 }, reader: { state: "no_qsl" }, updatedAt: 1 }),
  ];
  const p = await openPopup({ sessions });
  try {
    const text = p.$("sessions").textContent;
    assert.match(text, /GR00001 · 2222Nextwaves chưa có đơn chờ nhận — nhận tay/);
    assert.match(text, /Đã điền phiếu — dược sĩ kiểm rồi HOÀN THÀNH/);
    assert.match(text, /PO1 · kho CIRCA FLORITA \(30145\)/);
    assert.match(text, /Tenant Nextwaves: circa-stg/);
    assert.match(text, /Đầu đọc: đã trả/);
    assert.match(text, /Điền phiếu bị dừng — mở phiếu, bấm “Đọc lại và điền tiếp”/);
    assert.match(text, /Dừng: put_uncertain \(HTTP 503\)/);
    assert.match(text, /Đầu đọc: QR Scan Log chưa hỗ trợ mượn/);
    const del = p.$("sessions").childNodes[0].childNodes.find((n) => n.tagName === "BUTTON");
    del.click();
    await until(() => !("STG:a" in (p.b.store.sessions || {})));
    assert.ok(p.sent.includes("session:cancel"));
  } finally {
    p.b.close();
  }
});
