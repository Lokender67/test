import { json, handle, HttpError, getOrder, publicOrder } from "../../lib/shop.js";

// GET /api/order?id=...&email=...
// Email must match so order details can't be looked up by guessing IDs.
export const onRequestGet = handle(async ({ env, request }) => {
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const order = await getOrder(env, id);
  if (!order || order.customer.email !== email) {
    throw new HttpError("No order found with that order ID and email.", 404);
  }
  return json(publicOrder(order));
});
