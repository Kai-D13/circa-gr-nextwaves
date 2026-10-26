"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { lib } = require("./helpers.js");
const { env, keys } = lib();

const STG = env.ENVS.STG;
const PRD = env.ENVS.PRD;

test("chế độ STG / PRD / URL → đúng môi trường; URL lạ hoặc http → null", () => {
  assert.equal(env.envFromConfig({ mode: "stg" }), STG);
  assert.equal(env.envFromConfig({ mode: "PRD" }), PRD);
  assert.equal(env.envFromConfig({ mode: "DEV" }), null);
  assert.equal(env.envFromConfig({ url: "https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang" }), STG);
  assert.equal(env.envFromConfig({ url: "https://circa.nextwaves.app/vi/purchases" }), PRD);
  assert.equal(env.envFromConfig({ url: "https://api.v2.circa.vn/v1/x" }), PRD);
  assert.equal(env.envFromConfig({ url: "https://pos.dev.circa-v2.buymed.tech/" }), null);
  assert.equal(env.envFromConfig({ url: "http://pos.v2.circa.vn/" }), null);
  assert.equal(env.envFromConfig({ url: "https://evil.example/pos.v2.circa.vn" }), null);
  assert.equal(env.envFromConfig(null), null);
});

test("nhận dạng trang POS: GR, chi-tiet-so; sai origin hoặc trang khác → null", () => {
  assert.deepEqual(env.classifyPosPage("https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang/2DE6C0EC-2EA8-4038-8616-659FA3F5820A", STG), { kind: "gr", grId: "2de6c0ec-2ea8-4038-8616-659fa3f5820a" });
  assert.deepEqual(env.classifyPosPage("https://pos.stg.circa-v2.buymed.tech/chi-tiet-so/1593858", STG), { kind: "so", so: "1593858" });
  assert.equal(env.classifyPosPage("https://pos.stg.circa-v2.buymed.tech/danh-sach-phieu-nhan-hang", STG), null);
  assert.equal(env.classifyPosPage("https://pos.v2.circa.vn/danh-sach-phieu-nhan-hang/2de6c0ec-2ea8-4038-8616-659fa3f5820a", STG), null, "trang PRD khi đang ở chế độ STG");
  assert.deepEqual(env.classifyNwPage("https://circa-stg.nextwaves.app/vi/purchases/receive?po=SOBD1593858", STG), { kind: "receive", po: "SOBD1593858" });
  assert.equal(env.classifyNwPage("https://circa-stg.nextwaves.app/vi/purchases/55bd221f-65de-4a4d-8a77-40c568a6f176", STG), null);
  assert.equal(env.classifyNwPage("https://circa.nextwaves.app/vi/purchases/receive?po=X", STG), null);
});

test("đường dẫn API đúng từng môi trường (staging /backend/v1, production api.v2/v1)", () => {
  assert.equal(env.api.grDetail(STG, "g1"), "https://pos.stg.circa-v2.buymed.tech/backend/v1/order/goods-receipt/g1");
  assert.equal(env.api.grDetail(PRD, "g1"), "https://api.v2.circa.vn/v1/order/goods-receipt/g1");
  assert.equal(env.api.poDetail(STG, "s", "p"), "https://pos.stg.circa-v2.buymed.tech/backend/v1/pos/s/po/p?order_by_detail=desc");
  assert.equal(env.api.qrLookup(STG, "1792145819958AA1"), "https://pos.stg.circa-v2.buymed.tech/thuocsi-warehouse/qrcode?code=1792145819958AA1");
  assert.equal(env.api.nwReceivingSearch(STG, "SOBD1593858"), "https://api-circa-stg.nextwaves.app/api/v1/inter-tenant-orders/receiving?pageSize=50&q=SOBD1593858");
  assert.equal(env.api.nwReceivePage(PRD, "SOBD1"), "https://circa.nextwaves.app/vi/purchases/receive?po=SOBD1");
  assert.ok(env.isPosApiUrl("https://pos.stg.circa-v2.buymed.tech/backend/v1/order/goods-receipt/x", STG));
  assert.ok(!env.isPosApiUrl("https://pos.stg.circa-v2.buymed.tech/backend/tsapi/core/x", STG));
  assert.ok(env.isPosApiUrl("https://api.v2.circa.vn/v1/order/goods-receipt/x", PRD));
  assert.ok(!env.isPosApiUrl("https://api.v2.circa.vn/v1/order/goods-receipt/x", STG), "STG không coi host PRD là API của mình");
  assert.ok(env.isNwApiUrl("https://api-circa-stg.nextwaves.app/api/v1/purchase-orders/x", STG));
  assert.ok(!env.isNwApiUrl("https://api-circa.nextwaves.app/api/v1/purchase-orders/x", STG));
  for (const k of Object.keys(env.api)) {
    const u = env.api[k](STG, "a", "b", "c");
    assert.ok(!/integrations\/circa/.test(u), `${k} không được trỏ vào /integrations/circa`);
  }
});

test("phạm vi cửa hàng: STG chỉ 2222; PRD theo phiên; bảng kho", () => {
  assert.ok(env.storeAllowed(STG, "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d"));
  assert.ok(!env.storeAllowed(STG, "c476efb2-415c-429a-978e-d389b4b06607"));
  assert.ok(!env.storeAllowed(STG, ""));
  assert.ok(env.storeAllowed(PRD, "bat-ky"));
  assert.equal(env.warehouseForStore(STG, "64A8663B-0C9E-49C6-9626-0A4C7C4BD53D"), "82bf85e4-84e2-4158-ae27-1aaa6fe1bc57");
  assert.equal(env.warehouseForStore(PRD, "khong-co"), null);
});

test("nhận dạng lời gọi xác nhận nhận hàng Nextwaves và hoàn tất GR POS", () => {
  const s = "34e67fb9-ea76-4606-ab65-4c515934c0e1";
  assert.deepEqual(env.nwReceiveScanCall(`https://api-circa-stg.nextwaves.app/api/v1/inter-tenant-shipments/${s}/receive-scan`, "post", STG), { shipmentId: s });
  assert.equal(env.nwReceiveScanCall(`https://api-circa-stg.nextwaves.app/api/v1/inter-tenant-shipments/${s}/receive-scan`, "GET", STG), null);
  assert.equal(env.nwReceiveScanCall(`https://api-circa-stg.nextwaves.app/api/v1/integrations/circa/hub-orders/X/receive`, "POST", STG), null);
  const g = "2de6c0ec-2ea8-4038-8616-659fa3f5820a";
  assert.deepEqual(env.posGrStatusCall(`https://pos.stg.circa-v2.buymed.tech/backend/v1/order/goods-receipt/${g}/status/COMPLETED`, "PUT", STG), { grId: g, status: "COMPLETED" });
});

test("khoá SO: mã giao POS và refId Nextwaves cùng gốc; định dạng lạ → rỗng", () => {
  assert.equal(keys.soBase("SOBD1593849-F"), "SOBD1593849");
  assert.equal(keys.soBase("SOBD1593858-1056745"), "SOBD1593858");
  assert.equal(keys.soBase("sobd1593859"), "SOBD1593859");
  assert.equal(keys.soBase(""), "");
  assert.equal(keys.soBase("1593858"), "");
  assert.equal(keys.soBase("SOBD1593858-F-X"), "");
  assert.ok(keys.sameSo("SOBD1593858-F", "SOBD1593858-1056745"));
  assert.ok(!keys.sameSo("SOBD1593858-F", "SOBD1593849-1056738"));
  assert.ok(!keys.sameSo("", ""));
  assert.equal(keys.soDigits("SOBD1593858-F"), "1593858");
});

test("khoá lô: batch Nextwaves và tra QR POS ra cùng lot_date POS", () => {
  assert.equal(keys.lotKeyFromBatch("261009DHAUS", "2028-12-12"), "261009DHAUS-121228");
  assert.equal(keys.lotKeyFromQr("261009DHAUS", "12-12-2028"), "261009DHAUS-121228");
  assert.equal(keys.lotKeyFromQr("A98", "6-6-2027"), "A98-060627");
  assert.equal(keys.lotKeyFromQr("A98", ""), "");
  assert.equal(keys.lotKeyFromBatch("", "2028-12-12"), "");
  assert.equal(keys.posProductIdFromSku("CIRCA-2431732"), "2431732");
  assert.equal(keys.posProductIdFromSku("MEDX.BRI-BRI-001"), "");
});
