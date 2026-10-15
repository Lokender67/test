import {
  json, handle, HttpError, requireKV, getOrder, saveOrder, addHistory, safeEqual, readJson,
} from "../../../lib/shop.js";

const UPDATABLE = ["placed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];

function auth(env, request) {
  if (!env.ADMIN_KEY) throw new HttpError("ADMIN_KEY is not set in the Cloudflare project settings.", 500);
  if (!safeEqual(request.headers.get("x-admin-key"), env.ADMIN_KEY)) throw new HttpError("Wrong admin key.", 401);
}

// GET /api/admin/orders → newest 100 orders
export const onRequestGet = handle(async ({ env, request }) => {
  auth(env, request);
  const kv = requireKV(env);
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: "order:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && keys.length < 2000);

  keys.sort((a, b) => (b.metadata?.createdAt || "").localeCompare(a.metadata?.createdAt || ""));
  const orders = (await Promise.all(keys.slice(0, 100).map((k) => kv.get(k.name, "json")))).filter(Boolean);
  return json({ orders });
});

// POST /api/admin/orders { id, status, courier, awb, note } → update shipment
export const onRequestPost = handle(async ({ env, request }) => {
  auth(env, request);
  const { id, status, courier = "", awb = "", note = "" } = await readJson(request);
  const order = await getOrder(env, id);
  if (!order) throw new HttpError("Order not found.", 404);
  if (!order.payment.paidAt) throw new HttpError("Unpaid orders cannot be shipped.");
  if (!UPDATABLE.includes(status)) throw new HttpError("Invalid status.");

  order.shipment.courier = String(courier).slice(0, 60);
  order.shipment.awb = String(awb).slice(0, 60);
  const statusChanged = status !== order.status;
  if (statusChanged || note) addHistory(order, status, String(note).slice(0, 200));
  await saveOrder(env, order);
  return json({ ok: true, order });
});
