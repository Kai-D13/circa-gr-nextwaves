/*
 * Cấu hình môi trường + nhận dạng URL. Thuần: dùng được trong content script, service worker, trang (MAIN world) và Node test.
 * Một gói cho cả STG và PRD; chế độ do operator chọn trong popup (STG / PRD hoặc dán URL thuộc một môi trường đã biết).
 * Không có môi trường "tự do": URL lạ không mở quyền host nào.
 *
 * Có BẢN SAO Y HỆT ở src/main/env.js cho content script MAIN world (hook). Chrome / Edge chỉ nạp một file MỘT lần cho mỗi
 * trang dù file được khai ở nhiều mục content_scripts (mục đứng trước được nạp) — dùng chung lib/env.js làm ISOLATED world
 * thiếu env (lỗi T1 25/10). Sửa file này thì chép lại sang src/main/env.js; tests/manifest.test.js kiểm hai file giống nhau.
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
      writeEnabled: true,
      // Tenant Nextwaves staging cố định (không đổi được trong popup).
      nwTenant: "circa-stg",
      nwTenantFixed: true,
    }),
    PRD: Object.freeze({
      id: "PRD",
      label: "Production",
      posOrigin: "https://pos.v2.circa.vn",
      posApiBase: "https://api.v2.circa.vn",
      nwUiOrigin: "https://circa.nextwaves.app",
      nwApiBase: "https://api-circa.nextwaves.app/api",
      buymedSlug: "buymed",
      writeEnabled: true,
      // v0.4.0 (operator 06/11): mọi cửa hàng — không còn bảng cửa hàng → kho. Đơn Nextwaves nhận dạng theo SO (refId) + Buymed + số
      // lượng; kho lấy từ đơn đã khớp. Tenant Nextwaves mặc định "circa" (Florita, Lumina); máy ở tenant khác đặt trong popup.
      nwTenant: "circa",
      nwTenantFixed: false,
    }),
  });

  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const GR_PAGE_RE = new RegExp("^/danh-sach-phieu-nhan-hang/(" + UUID + ")/?$", "i");
  const GR_LIST_PAGE_RE = /^\/danh-sach-phieu-nhan-hang\/?$/i;
  const UUID_RE = new RegExp("^" + UUID + "$", "i");
  const SO_PAGE_RE = /^\/chi-tiet-so\/([^/?#]+)\/?$/i;
  const NW_RECEIVE_RE = /^\/[a-z]{2}\/purchases\/receive\/?$/i;

  function parseUrl(url) {
    try {
      return new URL(String(url));
    } catch (_) {
      return null;
    }
  }

  // Môi trường gốc (tenant mặc định). Nơi cần origin Nextwaves của một phiên / cấu hình dùng envFor / envFromConfig.
  function envById(id) {
    return id && Object.prototype.hasOwnProperty.call(ENVS, id) ? ENVS[id] : null;
  }

  // v0.4.0: tenant Nextwaves ("circa", "circa-medly", …): chữ thường, số, gạch ngang; 2..40 ký tự. Sai → null.
  const TENANT_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;
  function normTenant(t) {
    const s = String(t || "").trim().toLowerCase();
    return TENANT_RE.test(s) ? s : null;
  }

  const tenantCache = new Map();
  // Môi trường với tenant Nextwaves cụ thể (staging luôn tenant cố định). Tenant sai / rỗng → tenant mặc định của môi trường.
  function withTenant(env, tenant) {
    if (!env) return null;
    const t = env.nwTenantFixed ? env.nwTenant : normTenant(tenant) || env.nwTenant;
    if (t === env.nwTenant) return env;
    const k = env.id + "|" + t;
    if (!tenantCache.has(k)) {
      tenantCache.set(k, Object.freeze(Object.assign({}, env, { nwTenant: t, nwUiOrigin: `https://${t}.nextwaves.app`, nwApiBase: `https://api-${t}.nextwaves.app/api` })));
    }
    return tenantCache.get(k);
  }

  function envFor(id, tenant) {
    return withTenant(envById(id), tenant);
  }

  // Chế độ từ cấu hình: {mode:"STG"|"PRD", nwTenant} hoặc {url:"https://…"} (URL phải thuộc đúng một môi trường đã biết).
  function envFromConfig(config) {
    if (!config) return null;
    let env = null;
    if (config.mode) env = envById(String(config.mode).toUpperCase());
    else if (config.url) env = envFromAnyUrl(config.url);
    return env ? withTenant(env, config.nwTenant || env.nwTenant) : null;
  }

  // Origin Nextwaves → {envId, tenant} ("https://<t>.nextwaves.app" / "https://api-<t>.nextwaves.app"); tenant staging → STG.
  const NW_ORIGIN_RE = /^https:\/\/(api-)?([a-z0-9-]+)\.nextwaves\.app$/;
  function nwTenantOfOrigin(origin) {
    const m = NW_ORIGIN_RE.exec(String(origin || "").toLowerCase());
    const t = m ? normTenant(m[2]) : null;
    if (!t) return null;
    if (t === ENVS.STG.nwTenant) return { envId: "STG", tenant: t };
    return { envId: "PRD", tenant: t };
  }

  // URL bất kỳ của POS hoặc Nextwaves (trang hoặc API) → môi trường (Nextwaves: kèm đúng tenant); không khớp → null.
  function envFromAnyUrl(url) {
    const u = parseUrl(url);
    if (!u || u.protocol !== "https:") return null;
    const origin = u.origin.toLowerCase();
    for (const id of Object.keys(ENVS)) {
      const e = ENVS[id];
      if ([e.posOrigin, new URL(e.posApiBase).origin].some((o) => o.toLowerCase() === origin)) return e;
    }
    const nw = nwTenantOfOrigin(origin);
    return nw ? envFor(nw.envId, nw.tenant) : null;
  }

  // Lời gọi API Nextwaves (mọi tenant) → môi trường kèm tenant của chính URL đó; không phải API Nextwaves → null.
  function nwApiEnvOf(url) {
    const u = parseUrl(url);
    if (!u) return null;
    const nw = nwTenantOfOrigin(u.origin);
    if (!nw || !/^api-/.test(u.hostname)) return null;
    const env = envFor(nw.envId, nw.tenant);
    return isNwApiUrl(url, env) ? env : null;
  }

  // Trang POS của môi trường env: {kind:"gr", grId} | {kind:"gr_list"} | {kind:"so", so} | null.
  function classifyPosPage(url, env) {
    const u = parseUrl(url);
    if (!u || !env || u.origin.toLowerCase() !== env.posOrigin.toLowerCase()) return null;
    let m = GR_PAGE_RE.exec(u.pathname);
    if (m) return { kind: "gr", grId: m[1].toLowerCase() };
    if (GR_LIST_PAGE_RE.test(u.pathname)) return { kind: "gr_list" };
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

  const enc = encodeURIComponent;
  const api = {
    // POS
    grDetail: (env, grId) => `${env.posApiBase}/v1/order/goods-receipt/${enc(grId)}`,
    poDetail: (env, posId, poId) => `${env.posApiBase}/v1/pos/${enc(posId)}/po/${enc(poId)}?order_by_detail=desc`,
    grSearchBySo: (env, soDigits, posId) =>
      `${env.posApiBase}/v1/order/goods-receipt/search?query=so_thuocsi=${enc(soDigits)},pos_id=${enc(posId)},with_items=true,with_seller_code=true,with_details=true&limit=1000&is_with_retail_unit=true&is_with_lot=true`,
    grDetailLine: (env, grId, itemId, detailId) =>
      `${env.posApiBase}/v1/order/goods-receipt/${enc(grId)}/item/${enc(itemId)}/detail/${enc(detailId)}`,
    // v0.3.0 (PM DECISION-ONE-STG-AUTO-FLOW §2.3): HOÀN THÀNH ở chế độ tự động — đúng request trang POS gửi (A1): PUT, không body.
    grStatus: (env, grId, status) => `${env.posApiBase}/v1/order/goods-receipt/${enc(grId)}/status/${enc(status)}`,
    qrLookup: (env, code) => `${env.posOrigin}/thuocsi-warehouse/qrcode?code=${enc(code)}`,
    // Nextwaves (API thường; KHÔNG dùng /integrations/circa/*)
    nwReceivingSearch: (env, q) => `${env.nwApiBase}/v1/inter-tenant-orders/receiving?pageSize=50&q=${enc(q)}`,
    nwReceiving: (env, poId) => `${env.nwApiBase}/v1/inter-tenant-orders/purchase-orders/${enc(poId)}/receiving`,
    nwOrderOfPo: (env, poId) => `${env.nwApiBase}/v1/inter-tenant-orders/purchase-orders/${enc(poId)}`,
    nwShipment: (env, shipmentId) => `${env.nwApiBase}/v1/inter-tenant-shipments/${enc(shipmentId)}`,
    nwPoDetail: (env, poId) => `${env.nwApiBase}/v1/purchase-orders/${enc(poId)}`,
    // Trang
    nwReceivePage: (env, po) => `${env.nwUiOrigin}/vi/purchases/receive?po=${enc(po)}`,
    // Trang phiếu nhận POS: đích quay về sau khi Nextwaves nhận xong (background tự dựng, không lấy từ trang — PM rev 1 S4).
    posGrPage: (env, grId) => `${env.posOrigin}/danh-sach-phieu-nhan-hang/${enc(grId)}`,
  };

  const isUuid = (s) => UUID_RE.test(String(s || ""));

  // Request danh sách phiếu nhận mà CHÍNH trang danh sách POS gửi (Spec v0.2 S5 / R1):
  // GET <posApiBase>/v1/order/goods-receipt/search có query `pos_id=` (không phải tìm theo SO của extension).
  // → {queryKey} — khoá chuẩn hoá: path + mọi tham số query, sắp theo tên (bộ lọc / trang / sắp xếp đổi thì khoá đổi). Không khớp → null.
  function posGrListCall(url, method, env) {
    if (String(method || "GET").toUpperCase() !== "GET" || !isPosApiUrl(url, env)) return null;
    const u = parseUrl(url);
    const base = new URL(env.posApiBase).pathname.replace(/\/$/, "");
    if (u.pathname.replace(/\/$/, "") !== base + "/v1/order/goods-receipt/search") return null;
    const q = u.searchParams.get("query") || "";
    if (!/(^|,)pos_id=/.test(q) || /(^|,)so_thuocsi=/.test(q)) return null;
    const params = [...u.searchParams.entries()].sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
    return { queryKey: u.pathname + "?" + params.map(([k, v]) => `${k}=${v}`).join("&") };
  }

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
    envFor,
    withTenant,
    normTenant,
    nwTenantOfOrigin,
    nwApiEnvOf,
    envFromConfig,
    envFromAnyUrl,
    classifyPosPage,
    classifyNwPage,
    isPosApiUrl,
    isNwApiUrl,
    api,
    isUuid,
    nwReceiveScanCall,
    posGrStatusCall,
    posGrListCall,
  };
  root.__CGN__ = root.__CGN__ || {};
  root.__CGN__.env = lib;
  if (typeof module !== "undefined" && module.exports) module.exports = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
