# Zaiqa (ذائقہ) — Restaurant API + POS

Express + MongoDB backend with a React (Vite) frontend: sign in / sign up, a customer ordering app, and a POS for restaurant staff.

## Run
```bash
npm install
cp .env.example .env      # set JWT_SECRET
npm run seed              # 6 users, 3 restaurants, 30 dishes
npm run dev               # http://localhost:5000  (POS)  ·  /api  (REST API)
 + Supertest (in-memory MongoDB)
```
Seed logins: `admin@zaiqa.pk / Admin@123` · `owner1@zaiqa.pk / Owner@123` · `owner2@zaiqa.pk / Owner@123` · `customer1@zaiqa.pk / Customer@123`

## Run
```bash
npm install
cp .env.example .env      # set JWT_SECRET, MONGODB_URI
npm run seed
npm run dev               # API on :5000
npm run client            # React dev server on :5173 (proxies /api)
```
Production: `npm run build` then `npm start` — Express serves `client/dist` and the API on one port.

## Accounts
- **Sign up** creates a *customer* or a *restaurant owner* (`accountType`). Super admins are never self-registered (seed or `POST /api/admin/users`).
- Customers land on `/shop` (browse, cart, checkout, my orders, cancel). Owners land on `/pos`; a new owner is asked to create their restaurant first.
- Seed logins: `admin@zaiqa.pk / Admin@123` · `owner1@zaiqa.pk / Owner@123` · `customer1@zaiqa.pk / Customer@123`

## POS screens (staff only)
Counter (tap dishes, dine-in/takeaway/delivery, discount, cash/card, printed-receipt animation) · Kitchen & orders (confirm → cooking → ready → hand over, auto-refresh) · Menu (sold-out switch, add dish) · Sales (today's totals, best sellers).

## API
All routes from the spec are implemented under `/api`, with the `{success,message,data,pagination?}` response shape. Extras for the POS:
- `POST /api/restaurants/:id/pos-orders` — walk-in order, priced from the DB, created as `confirmed`
- `GET  /api/restaurants/:id/stats` — today's sales, avg order, best sellers
- `GET  /api/users/me/restaurants` — restaurants the staff user manages
- `POST /api/admin/users`, `PATCH /api/admin/users/:userId/block {blocked}`

Order flow: `pending → confirmed → preparing → ready → (out_for_delivery →) delivered`; `rejected`/`cancelled` only from early states. Anything else returns 422. Changing a password revokes older tokens.

Import `postman/zaiqa.postman_collection.json` (run Login first; Create requests save ids).

## Not included
Cloudinary upload (images are stored as URLs), reviews, favorites, coupons, notifications, and token blacklist on logout (tokens are stateless; they're revoked on password change).
