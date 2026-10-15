// Shared server-side helpers for the Pages Functions.
// Money is always handled in paise (integer) on the server.

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const fail = (message, status = 400) => json({ error: message }, status);

export function isDemo(env) {
  return !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function requireKV(env) {
  if (!env.ORDERS) {
    throw new HttpError(
      "Order storage is not set up. Bind a KV namespace named ORDERS to this Pages project (see README, step 5).",
      500
    );
  }
  return env.ORDERS;
}

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Wrap a handler so thrown HttpErrors become JSON responses.
export const handle = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    console.error(err);
    return fail("Something went wrong on the server.", 500);
  }
};

// Read static JSON files that are deployed alongside the site.
export async function loadAsset(ctx, path) {
  const res = await ctx.env.ASSETS.fetch(new URL(path, ctx.request.url));
  if (!res.ok) throw new HttpError(`Could not load ${path}`, 500);
  return res.json();
}

// Recalculate the order from the catalog. Never trust prices sent by the browser.
export function priceCart(items, products, store) {
  if (!Array.isArray(items) || !items.length) throw new HttpError("Your cart is empty.");
  if (items.length > 50) throw new HttpError("Too many items.");

  const lines = items.map(({ id, qty }) => {
    const p = products.find((x) => x.id === id);
    const q = Number(qty);
    if (!p) throw new HttpError(`Product "${id}" is no longer available.`);
    if (!p.inStock) throw new HttpError(`${p.name} is out of stock.`);
    if (!Number.isInteger(q) || q < 1 || q > 20) throw new HttpError(`Invalid quantity for ${p.name}.`);
    const price = Math.round(p.price * 100);
    return { id: p.id, name: p.name, price, qty: q, lineTotal: price * q };
  });

  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const shipping = subtotal >= store.freeShippingAbove * 100 ? 0 : Math.round(store.shippingFee * 100);
  const gst = Math.round(subtotal * store.gstRate);
  return { lines, subtotal, shipping, gst, total: subtotal + shipping + gst };
}

export function validateCustomer(c = {}) {
  const s = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const out = {
    name: s(c.name, 100),
    email: s(c.email, 120).toLowerCase(),
    phone: s(c.phone, 10),
    address: s(c.address, 300),
    city: s(c.city, 80),
    state: s(c.state, 80),
    pincode: s(c.pincode, 6),
  };
  if (!out.name) throw new HttpError("Please enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new HttpError("Please enter a valid email.");
  if (!/^[6-9]\d{9}$/.test(out.phone)) throw new HttpError("Please enter a valid 10-digit mobile number.");
  if (!out.address || !out.city || !out.state) throw new HttpError("Please complete the delivery address.");
  if (!/^[1-9]\d{5}$/.test(out.pincode)) throw new HttpError("Please enter a valid 6-digit PIN code.");
  return out;
}

export function newOrderId() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => (b % 36).toString(36)).join("");
  return `BH-${Date.now().toString(36).toUpperCase()}-${rand.toUpperCase()}`;
}

const key = (id) => `order:${id}`;

export async function getOrder(env, id) {
  if (!id || !/^[A-Z0-9-]{4,40}$/i.test(id)) return null;
  return requireKV(env).get(key(id.toUpperCase()), "json");
}

export async function saveOrder(env, order, opts = {}) {
  await requireKV(env).put(key(order.id), JSON.stringify(order), {
    ...opts,
    metadata: { status: order.status, createdAt: order.createdAt },
  });
}

export async function nextInvoiceNumber(env) {
  // KV is not transactional; fine for a test store. Use D1 for strict sequencing in production.
  const kv = requireKV(env);
  const n = Number((await kv.get("counter:invoice")) || 0) + 1;
  await kv.put("counter:invoice", String(n));
  return `INV-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

export function addHistory(order, status, note = "") {
  order.status = status;
  order.shipment.history.push({ status, at: new Date().toISOString(), note });
}

// What a customer is allowed to see.
export function publicOrder(o) {
  return {
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    customer: o.customer,
    items: o.items,
    subtotal: o.subtotal,
    shipping: o.shipping,
    gst: o.gst,
    total: o.total,
    invoice: o.invoice,
    payment: { mode: o.payment.mode, paymentId: o.payment.paymentId, paidAt: o.payment.paidAt },
    shipment: o.shipment,
  };
}

export function safeEqual(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret, message) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError("Invalid request body.");
  }
}
