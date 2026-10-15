import { json, isDemo } from "../../lib/shop.js";

// Public config for the browser. Only the Razorpay KEY ID is public; the secret never leaves the server.
export const onRequestGet = ({ env }) =>
  json({ demo: isDemo(env), razorpayKeyId: isDemo(env) ? null : env.RAZORPAY_KEY_ID });
