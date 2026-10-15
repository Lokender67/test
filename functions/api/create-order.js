import {
  json, handle, HttpError, isDemo, loadAsset, priceCart, validateCustomer,
  newOrderId, saveOrder, readJson,
} from "../../lib/shop.js";

// POST /api/create-order  { items: [{id, qty}], customer: {...} }
// Prices the cart on the server, creates a Razorpay order, stores a pending order.
export const onRequestPost = handle(async (ctx) => {
  const { env, request } = ctx;
  const body = await readJson(request);
  const [products, store] = await Promise.all([loadAsset(ctx, "/products.json"), loadAsset(ctx, "/store.json")]);

  const customer = validateCustomer(body.customer);
  const priced = priceCart(body.items, products, store);
  const id = newOrderId();
  const demo = isDemo(env);

  let razorpayOrderId = null;
  if (!demo) {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`),
      },
      body: JSON.stringify({
        amount: priced.total,
        currency: "INR",
        receipt: id,
        notes: { store_order_id: id, email: customer.email },
      }),
    });
    const rz = await res.json();
    if (!res.ok) {
      console.error("Razorpay order error", rz);
      throw new HttpError(`Payment gateway error: ${rz?.error?.description || res.status}`, 502);
    }
    razorpayOrderId = rz.id;
  }

  const now = new Date().toISOString();
  const order = {
    id,
    createdAt: now,
    status: "pending_payment",
    customer,
    items: priced.lines,
    subtotal: priced.subtotal,
    shipping: priced.shipping,
    gst: priced.gst,
    total: priced.total,
    payment: { provider: "razorpay", mode: demo ? "demo" : "test", razorpayOrderId, paymentId: null, paidAt: null },
    invoice: null,
    shipment: { courier: "", awb: "", history: [{ status: "pending_payment", at: now, note: "" }] },
  };

  // Unpaid orders expire after 2 days; paid orders are re-saved without expiry.
  await saveOrder(env, order, { expirationTtl: 60 * 60 * 48 });

  return json({
    orderId: id,
    amount: priced.total,
    demo,
    keyId: demo ? null : env.RAZORPAY_KEY_ID,
    razorpayOrderId,
  });
});
