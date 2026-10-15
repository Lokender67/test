# Bridgehorn Test Store: setup and deployment guide

A free, working test e-commerce site with:

- A product catalog with images kept as separate files
- A cart and checkout
- Razorpay payments in test mode (no real money)
- Auto-generated GST tax invoices (download as PDF)
- Customer order tracking
- An admin page to update shipment status, courier and tracking number

It runs entirely on free tiers: GitHub, Cloudflare Pages + Functions + KV, and Razorpay test mode.

---

## 1. How it works

```
Browser (HTML/JS)  ──►  Cloudflare Pages Functions (/api/*)  ──►  Razorpay API
        ▲                         │
        └──── order data ◄──── Cloudflare KV (ORDERS)
```

| Page | What it does |
|---|---|
| `/` | Product grid with category filter and Add to cart |
| `/cart.html` | Change quantities, see GST and shipping, proceed |
| `/checkout.html` | Delivery form, then Razorpay checkout |
| `/track.html` | Confirmation page and order tracking (order ID + email) |
| `/invoice.html` | Printable tax invoice. Use **Download PDF / Print** and choose "Save as PDF" |
| `/admin.html` | Password-protected order list and shipment updates |

| API | What it does |
|---|---|
| `POST /api/create-order` | Recalculates prices on the server, creates a Razorpay order, saves a pending order |
| `POST /api/verify-payment` | Checks the Razorpay signature (HMAC-SHA256), marks the order paid, creates the invoice number |
| `GET /api/order` | Returns an order only if the order ID and email match |
| `GET/POST /api/admin/orders` | Lists orders and updates status (needs `ADMIN_KEY`) |

**Demo mode:** if the Razorpay keys aren't set, checkout shows a simulated payment screen. That lets you test the full flow before you create a Razorpay account. Demo mode switches off automatically once the keys are added.

---

## 2. Accounts to create (all free)

1. **GitHub** (https://github.com) stores the code.
2. **Cloudflare** (https://dash.cloudflare.com/sign-up) provides hosting, the API functions and order storage.
3. **Razorpay** (https://dashboard.razorpay.com/signup) is the payment gateway. Test mode works without KYC.

Optional: a domain registrar, if you want your own domain (see step 8).

---

## 3. Customize the store

| What | File |
|---|---|
| Products (name, price in ₹, category, description, stock) | `public/products.json` |
| Product images | `public/images/` (replace the SVG placeholders with your .jpg/.png/.webp files) |
| Store name, GST rate, shipping fee, free-shipping threshold, seller address and GSTIN | `public/store.json` |
| Colours and fonts | `public/assets/style.css` (the `:root` variables at the top) |

**To add a product:** put the image in `public/images/`, for example `my-shoe.jpg`, and add an entry to `products.json`:

```json
{
  "id": "my-shoe",
  "name": "Running Shoe",
  "category": "Footwear",
  "price": 2499,
  "image": "images/my-shoe.jpg",
  "description": "Lightweight mesh runner.",
  "inStock": true
}
```

The `id` must be unique and must not change after orders exist. Images look best at a 4:3 ratio, around 800×600 px.

---

## 4. Run it on your computer (optional)

You need Node.js 18 or later (https://nodejs.org).

```bash
npm install
cp .dev.vars.example .dev.vars     # edit ADMIN_KEY inside
npm run dev
```

Open http://localhost:8788. Orders are stored locally in the `.wrangler/` folder.

---

## 5. Push to GitHub

1. On GitHub, click **New repository**, name it (for example `bh-test-store`) and create it. Private is fine.
2. Upload the project. You can drag the folder contents into **"uploading an existing file"**, or use git:

```bash
git init
git add .
git commit -m "Test store"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/bh-test-store.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `.wrangler/` and `.dev.vars`, so secrets don't get committed.

---

## 6. Deploy on Cloudflare Pages

### 6a. Create the project

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize GitHub and pick your repo.
3. Use these build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`public`**
4. Click **Save and Deploy**. The `functions/` folder is detected automatically and becomes `/api/*`.

### 6b. Create order storage (KV)

1. Go to **Storage & Databases → KV → Create namespace** (the menu may say Workers KV) and name it `bh-orders`.
2. Open your Pages project and go to **Settings → Bindings → Add → KV namespace**.
   - Variable name: **`ORDERS`** (must be exactly this)
   - KV namespace: `bh-orders`
3. Save.

### 6c. Add the admin password

In your Pages project, go to **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `ADMIN_KEY` | Secret | A long password of your choice |

### 6d. Redeploy

Go to **Deployments**, open the latest one, and click **⋯ → Retry deployment**. New settings take effect only after a redeploy.

Your site is now live at `https://<project>.pages.dev`, in demo payment mode.

---

## 7. Turn on Razorpay test payments

1. Log in to the Razorpay Dashboard and switch the toggle to **Test Mode**.
2. Go to **Account & Settings → API Keys → Generate Test Key** (or Generate Key) and copy the **Key ID** (`rzp_test_…`) and the **Key Secret**.
3. In your Cloudflare Pages project, go to **Settings → Variables and Secrets** and add:

| Name | Type | Value |
|---|---|---|
| `RAZORPAY_KEY_ID` | Text | `rzp_test_…` |
| `RAZORPAY_KEY_SECRET` | Secret | the key secret |

4. Redeploy (step 6d). Checkout now opens the real Razorpay test popup.

**Test payments:** use the test cards and UPI IDs from Razorpay's docs at https://razorpay.com/docs/payments/payments/test-card-details/. For UPI, `success@razorpay` succeeds and `failure@razorpay` fails. Any future expiry date and any CVV work. In test mode no real money moves, and you can see payments under **Transactions → Payments** in Test Mode.

**Security notes:**

- The Key Secret is stored only as a Cloudflare secret. The browser only ever sees the Key ID.
- Prices are recalculated on the server, so a tampered cart can't change the amount.
- Payment is accepted only after the Razorpay signature is verified on the server.

**Going live later:** complete KYC on Razorpay, generate **Live** keys, swap them in, and redeploy. Then also add a Razorpay **webhook** (`payment.captured`) for reliability, and update the invoice footer text and the real seller GSTIN.

---

## 8. Connect your own domain (optional, paid)

1. Buy a domain. Cloudflare Registrar sells at cost; Namecheap, GoDaddy and others also work.
2. If you bought it outside Cloudflare, go to Cloudflare **Add a site**, choose the Free plan, and set the two Cloudflare nameservers at your registrar. This can take minutes to 24 hours.
3. In your Pages project, go to **Custom domains → Set up a custom domain** and enter `shop.yourdomain.com` or `yourdomain.com`. DNS and HTTPS are configured automatically.

---

## 9. Test-case checklist

1. Add 2 or more products and change quantities in the cart.
2. Check that the cart shows shipping below ₹999 and **Free** at ₹999 or more.
3. Try adding an out-of-stock item. It shows **Out of stock** with no Add to cart button.
4. Submit checkout with an invalid phone or PIN code. You should see validation errors.
5. Make a failed payment and confirm the order stays unpaid and you can retry.
6. Make a successful payment. You're redirected to the confirmation page.
7. Open the invoice and check GST: CGST + SGST if the customer's state is the same as the seller's (Haryana), otherwise IGST. Save it as a PDF.
8. In Admin, set Packed → Shipped (with courier and tracking number) → Out for delivery → Delivered.
9. On Track order, confirm each step and timestamp appears for the customer.
10. Track with the right order ID but the wrong email. You should get "not found".
11. Open Admin with a wrong key and confirm it's rejected.

---

## 10. Project structure

```
bh-store/
├─ public/                 # static site (served as-is)
│  ├─ index.html  cart.html  checkout.html  track.html  invoice.html  admin.html
│  ├─ products.json        # catalog
│  ├─ store.json           # store / seller / tax settings
│  ├─ images/              # product images (separate files)
│  └─ assets/  style.css  app.js
├─ functions/api/          # serverless API (Cloudflare Pages Functions)
│  ├─ config.js  create-order.js  verify-payment.js  order.js
│  └─ admin/orders.js
├─ lib/shop.js             # shared server helpers (pricing, KV, HMAC)
├─ .dev.vars.example       # local secrets template
└─ package.json
```

## Free-tier limits (good enough for testing)

- **Cloudflare Pages:** unlimited static requests, and 500 builds a month.
- **Functions:** 100k requests a day.
- **KV:** 100k reads and 1k writes a day.
- **Razorpay test mode:** unlimited and free.

For production volume, move orders to **Cloudflare D1** (SQL), and connect a courier aggregator such as **Shiprocket** to replace the manual tracking updates.
