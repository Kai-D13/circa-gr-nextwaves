/*
 * Cấu hình môi trường + nhận dạng URL. Thuần: dùng được trong content script, service worker, trang (MAIN world) và Node test.
 * Một gói cho cả STG và PRD; chế độ do operator chọn trong popup (STG / PRD hoặc dán URL thuộc một môi trường đã biết).
 * Không có môi trường "tự do": URL lạ không mở quyền host nào.
 */
(function (root) {
  "use strict";

  const ENVS = Object.freeze({
    STG: Object.freeze({
      id: "STG",
      label: "Staging",
      posOrigin: "https://pos.stg.circa-v2.buymed.tech",
      posApiBase: "https://pos.stg.circa-v2.buymed.tech/backend",
      nwUiOrigin: "https://circa-stg.nextwaves.app",
      nwApiBase: "https://api-circa-stg.nextwaves.app/api",
      buymedSlug: "buymed-stag",
      // Staging chỉ chạy với cửa hàng 2222 (operator chốt 24/10/2026).
      storeAllowlist: Object.freeze(["64a8663b-0c9e-49c6-9626-0a4c7c4bd53d"]),
      warehouseByStore: Object.freeze({ "64a8663b-0c9e-49c6-9626-0a4c7c4bd53d": "82bf85e4-84e2-4158-ae27-1aaa6fe1bc57" }),
    }),
    PRD: Object.freeze({
      id: "PRD",
      label: "Production",
      posOrigin: "https://pos.v2.circa.vn",
      posApiBase: "https://api.v2.circa.vn",
      nwUiOrigin: "https://circa.nextwaves.app",
      nwApiBase: "https://api-circa.nextwaves.app/api",
      buymedSlug: "buymed",
      // Production: theo tài khoản đang đăng nhập, không giới hạn cửa hàng.
      storeAllowlist: null,
      warehouseByStore: Object.freeze({ "c476efb2-415c-429a-978e-d389b4b06607": "eb5e2b4f-6f92-413b-90ef-6be1730b94c0" }),
    }),
  });

  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const GR_PAGE_RE = new RegExp("^/danh-sach-phieu-nhan-hang/(" + UUID + ")/?$", "i");
  const SO_PAGE_RE = /^\/chi-tiet-so\/([^/?#]+)\/?$/i;
  const NW_RECEIVE_RE = /^\/[a-z]{2}\/purchases\/receive\/?$/i;

  function parseUrl(url) {
    try {
      return new URL(String(url));
    } catch (_) {
      return null;
    }
  }

  function envById(id) {
    return id && Object.prototype.hasOwnProperty.call(ENVS, id) ? ENVS[id] : null;
  }

  // Chế độ từ cấu hình: {mode:"STG"|"PRD"} hoặc {url:"https://…"} (URL phải thuộc đúng một môi trường đã biết).
  function envFromConfig(config) {
    if (!config) return null;
    if (config.mode) return envById(String(config.mode).toUpperCase());
    if (config.url) return envFromAnyUrl(config.url);
    return null;
  }

  // URL bất kỳ của POS hoặc Nextwaves (trang hoặc API) → môi trường; không khớp → null.
  function envFromAnyUrl(url) {
    const u = parseUrl(url);
    if (!u || u.protocol !== "https:") return null;
    const origin = u.origin.toLowerCase();
    for (const id of Object.keys(ENVS)) {
      const e = ENVS[id];
      const origins = [e.posOrigin, new URL(e.posApiBase).origin, e.nwUiOrigin, new URL(e.nwApiBase).origin];
      if (origins.some((o) => o.toLowerCase() === origin)) return e;
    }
    return null;
  }

  // Trang POS của môi trường env: {kind:"gr", grId} | {kind:"so", so} | null.
  function classifyPosPage(url, env) {
    const u = parseUrl(url);
    if (!u || !env || u.origin.toLowerCase() !== env.posOrigin.toLowerCase()) return null;
    let m = GR_PAGE_RE.exec(u.pathname);
    if (m) return { kind: "gr", grId: m[1].toLowerCase() };
    m = SO_PAGE_RE.exec(u.pathname);
    if (m) return { kind: "so", so: decodeURIComponent(m[1]) };
    return null;
  }

  // Trang nhận hàng Nextwaves của env: {kind:"receive", po} | null.
  function classifyNwPage(url, env) {
    const u = parseUrl(url);
    if (!u || !env || u.origin.toLowerCase() !== env.nwUiOrigin.toLowerCase()) return null;
    if (!NW_RECEIVE_RE.test(u.pathname)) return null;
    const po = (u.searchParams.get("po") || "").trim();
    return po ? { kind: "receive", po } : null;
  }

  function isPosApiUrl(url, env) {
    const u = parseUrl(url);
    if (!u || !env) return false;
    const base = new URL(env.posApiBase);
    return u.origin === base.origin && u.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/v1/");
  }

  function isNwApiUrl(url, env) {
    const u = parseUrl(url);
    if (!u || !env) return false;
    const base = new URL(env.nwApiBase);
    return u.origin === base.origin && u.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/v1/");
  }

  function storeAllowed(env, posId) {
    if (!env || !posId) return false;
    if (!env.storeAllowlist) return true;
    return env.storeAllowlist.includes(String(posId).toLowerCase());
  }

  function warehouseForStore(env, posId) {
    if (!env || !posId) return null;
    return env.warehouseByStore[String(posId).toLowerCase()] || null;
  }

  const enc = encodeURIComponent;
  const api = {
    // POS
    grDetail: (env, grId) => `${env.posApiBase}/v1/order/goods-receipt/${enc(grId)}`,
    poDetail: (env, posId, poId) => `${env.posApiBase}/v1/pos/${enc(posId)}/po/${enc(poId)}?order_by_detail=desc`,
    grSearchBySo: (env, soDigits, posId) =>
      `${env.posApiBase}/v1/order/goods-receipt/search?query=so_thuocsi=${enc(soDigits)},pos_id=${enc(posId)},with_items=true,with_seller_code=true,with_details=true&limit=1000&is_with_retail_unit=true&is_with_lot=true`,
    grDetailLine: (env, grId, itemId, detailId) =>
      `${env.posApiBase}/v1/order/goods-receipt/${enc(grId)}/item/${enc(itemId)}/detail/${enc(detailId)}`,
    qrLookup: (env, code) => `${env.posOrigin}/thuocsi-warehouse/qrcode?code=${enc(code)}`,
    // Nextwaves (API thường; KHÔNG dùng /integrations/circa/*)
    nwReceivingSearch: (env, q) => `${env.nwApiBase}/v1/inter-tenant-orders/receiving?pageSize=50&q=${enc(q)}`,
    nwReceiving: (env, poId) => `${env.nwApiBase}/v1/inter-tenant-orders/purchase-orders/${enc(poId)}/receiving`,
    nwOrderOfPo: (env, poId) => `${env.nwApiBase}/v1/inter-tenant-orders/purchase-orders/${enc(poId)}`,
    nwShipment: (env, shipmentId) => `${env.nwApiBase}/v1/inter-tenant-shipments/${enc(shipmentId)}`,
    nwPoDetail: (env, poId) => `${env.nwApiBase}/v1/purchase-orders/${enc(poId)}`,
    // Trang
    nwReceivePage: (env, po) => `${env.nwUiOrigin}/vi/purchases/receive?po=${enc(po)}`,
  };

  // Lời gọi "Xác nhận nhận hàng" của web Nextwaves: POST …/inter-tenant-shipments/<id>/receive-scan.
  function nwReceiveScanCall(url, method, env) {
    if (String(method || "").toUpperCase() !== "POST" || !isNwApiUrl(url, env)) return null;
    const m = new RegExp("/v1/inter-tenant-shipments/(" + UUID + ")/receive-scan/?$", "i").exec(parseUrl(url).pathname);
    return m ? { shipmentId: m[1].toLowerCase() } : null;
  }

  // POS hoàn tất phiếu: PUT …/order/goods-receipt/<id>/status/COMPLETED.
  function posGrStatusCall(url, method, env) {
    if (String(method || "").toUpperCase() !== "PUT" || !isPosApiUrl(url, env)) return null;
    const m = new RegExp("/v1/order/goods-receipt/(" + UUID + ")/status/([A-Z_]+)/?$", "i").exec(parseUrl(url).pathname);
    return m ? { grId: m[1].toLowerCase(), status: m[2].toUpperCase() } : null;
  }

  const lib = {
    ENVS,
    envById,
    envFromConfig,
    envFromAnyUrl,
    classifyPosPage,
    classifyNwPage,
    isPosApiUrl,
    isNwApiUrl,
    storeAllowed,
    warehouseForStore,
    api,
    nwReceiveScanCall,
    posGrStatusCall,
  };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.env = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
