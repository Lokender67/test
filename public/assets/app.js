// Shared client helpers: catalog, cart (stored in the browser), formatting, header.
const CART_KEY = "bh_cart_v1";

const App = {
  store: null,
  products: null,

  async loadStore() {
    if (!this.store) this.store = await (await fetch("/store.json")).json();
    return this.store;
  },
  async loadProducts() {
    if (!this.products) this.products = await (await fetch("/products.json")).json();
    return this.products;
  },

  // Money is handled in paise (integer) on the server; the catalog stores rupees.
  inr(rupees) {
    return "₹" + Number(rupees).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  inrPaise(paise) { return this.inr(paise / 100); },

  getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
  },
  saveCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
    this.renderCartCount();
  },
  addToCart(id, qty = 1) {
    const cart = this.getCart();
    cart[id] = Math.min((cart[id] || 0) + qty, 20);
    this.saveCart(cart);
  },
  setQty(id, qty) {
    const cart = this.getCart();
    if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, 20);
    this.saveCart(cart);
  },
  clearCart() { this.saveCart({}); },
  cartCount() { return Object.values(this.getCart()).reduce((a, b) => a + b, 0); },

  // Client-side estimate only. The server recalculates the real amount.
  async cartLines() {
    const products = await this.loadProducts();
    const cart = this.getCart();
    return Object.entries(cart)
      .map(([id, qty]) => {
        const p = products.find((x) => x.id === id);
        return p ? { ...p, qty, lineTotal: p.price * qty } : null;
      })
      .filter(Boolean);
  },
  async totals(lines) {
    const s = await this.loadStore();
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    const shipping = subtotal === 0 || subtotal >= s.freeShippingAbove ? 0 : s.shippingFee;
    const gst = Math.round(subtotal * s.gstRate * 100) / 100;
    return { subtotal, shipping, gst, total: subtotal + shipping + gst };
  },

  renderCartCount() {
    const el = document.getElementById("cart-count");
    if (el) el.textContent = this.cartCount();
  },

  async renderHeader() {
    const s = await this.loadStore();
    document.querySelectorAll("[data-store-name]").forEach((el) => (el.textContent = s.name));
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    this.renderCartCount();
  },

  qs(name) { return new URLSearchParams(location.search).get(name); },

  esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  STATUS_LABELS: {
    pending_payment: "Awaiting payment",
    payment_failed: "Payment failed",
    placed: "Order placed",
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  },
  FLOW: ["placed", "packed", "shipped", "out_for_delivery", "delivered"],

  fmtDate(iso) {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  },
};

document.addEventListener("DOMContentLoaded", () => App.renderHeader());
