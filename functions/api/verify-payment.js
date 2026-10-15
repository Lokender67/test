import {
  json, handle, HttpError, isDemo, getOrder, saveOrder, nextInvoiceNumber,
  addHistory, hmacSha256Hex, safeEqual, readJson,
} from "../../lib/shop.js";

// POST /api/verify-payment
// Real mode: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Demo mode: { orderId, demo: true }
export const onRequestPost = handle(async ({ env, request }) => {
  const body = await readJson(request);
  const order = await getOrder(env, body.orderId);
  if (!order) throw new HttpError("Order not found.", 404);

  // Idempotent: already paid → just return it.
  if (order.status !== "pending_payment") {
    return json({ orderId: order.id, email: order.customer.email, status: order.status });
  }

  let paymentId;
  if (isDemo(env)) {
    if (!body.demo) throw new HttpError("Demo payment not expected.");
    paymentId = "demo_" + crypto.randomUUID().slice(0, 12);
  } else {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) throw new HttpError("Missing payment details.");
    if (razorpay_order_id !== order.payment.razorpayOrderId) throw new HttpError("Payment does not match this order.");

    // Razorpay signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!safeEqual(expected, razorpay_signature)) throw new HttpError("Payment signature verification failed.", 400);
    paymentId = razorpay_payment_id;
  }

  const now = new Date().toISOString();
  order.payment.paymentId = paymentId;
  order.payment.paidAt = now;
  order.invoice = { number: await nextInvoiceNumber(env), date: now };
  addHistory(order, "placed", "Payment received");
  await saveOrder(env, order); // no expiry for paid orders

  return json({ orderId: order.id, email: order.customer.email, status: order.status });
});
