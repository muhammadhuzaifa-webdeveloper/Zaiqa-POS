const router = require('express').Router();
const mongoose = require('mongoose');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { User, Restaurant, Category, MenuItem, Cart, Order, unit } = require('./models');
const { ApiError, wrap, ok, esc, authenticate, authorize, validate, paginate } = require('./middleware');

/* ---------- validation schemas ---------- */
const id = Joi.string().hex().length(24);
const phone = Joi.string().pattern(/^\+?[0-9]{10,15}$/).messages({ 'string.pattern.base': 'Phone must be 10-15 digits, optional +' });
const pw = Joi.string().min(8).max(64).pattern(/[A-Z]/).pattern(/[a-z]/).pattern(/\d/)
  .messages({ 'string.pattern.base': 'Password needs an uppercase letter, a lowercase letter and a number' });
const restKeys = {
  name: Joi.string().trim().min(2).max(80), description: Joi.string().allow('').max(500), phone, email: Joi.string().email(),
  address: Joi.string().max(200), city: Joi.string().max(60), image: Joi.string().uri().allow(''),
  openingTime: Joi.string(), closingTime: Joi.string(), isOpen: Joi.boolean(), deliveryFee: Joi.number().min(0),
  isActive: Joi.boolean(), owner: id,
};
const catKeys = { name: Joi.string().trim().min(2).max(60), description: Joi.string().allow('').max(300), image: Joi.string().uri().allow(''), sortOrder: Joi.number().integer(), isActive: Joi.boolean() };
const menuKeys = {
  category: id, name: Joi.string().trim().min(2).max(100), description: Joi.string().allow('').max(500),
  price: Joi.number().min(0), discountPrice: Joi.number().min(0), image: Joi.string().uri().allow(''),
  ingredients: Joi.array().items(Joi.string().max(40)).max(30), isAvailable: Joi.boolean(), preparationTime: Joi.number().integer().min(1).max(240),
};
const S = {
  register: Joi.object({ name: Joi.string().trim().min(2).max(60).required(), email: Joi.string().email().lowercase().required(), password: pw.required(), phone: phone.required(), accountType: Joi.string().valid('customer', 'restaurant_admin').default('customer') }),
  login: Joi.object({ email: Joi.string().email().lowercase().required(), password: Joi.string().required() }),
  profile: Joi.object({ name: Joi.string().trim().min(2).max(60), phone }).min(1),
  chpw: Joi.object({ currentPassword: Joi.string().required(), newPassword: pw.required() }),
  adminUser: Joi.object({ name: Joi.string().trim().min(2).max(60).required(), email: Joi.string().email().lowercase().required(), password: pw.required(), phone, role: Joi.string().valid('customer', 'restaurant_admin', 'admin').required() }),
  block: Joi.object({ blocked: Joi.boolean().required() }),
  restCreate: Joi.object(restKeys).fork(['name', 'address', 'city'], (s) => s.required()),
  restUpdate: Joi.object(restKeys).min(1),
  catCreate: Joi.object(catKeys).fork(['name'], (s) => s.required()),
  catUpdate: Joi.object(catKeys).min(1),
  menuCreate: Joi.object(menuKeys).fork(['category', 'name', 'price'], (s) => s.required()),
  menuUpdate: Joi.object(menuKeys).min(1),
  avail: Joi.object({ isAvailable: Joi.boolean().required() }),
  cartAdd: Joi.object({ menuItemId: id.required(), quantity: Joi.number().integer().min(1).max(50).required() }),
  cartUpd: Joi.object({ quantity: Joi.number().integer().min(1).max(50).required() }),
  order: Joi.object({
    deliveryAddress: Joi.object({ address: Joi.string().required(), city: Joi.string().required(), postalCode: Joi.string().allow('') }).required(),
    phone: phone.required(), paymentMethod: Joi.string().valid('cash', 'card').default('cash'), notes: Joi.string().allow('').max(300),
  }),
  pos: Joi.object({
    orderType: Joi.string().valid('dine_in', 'takeaway', 'delivery').default('dine_in'),
    table: Joi.string().allow('').max(20), customerName: Joi.string().allow('').max(60), phone: phone.allow(''),
    items: Joi.array().min(1).items(Joi.object({ menuItemId: id.required(), quantity: Joi.number().integer().min(1).max(50).required() })).required(),
    paymentMethod: Joi.string().valid('cash', 'card').default('cash'), discount: Joi.number().min(0).default(0),
    paid: Joi.boolean().default(true), notes: Joi.string().allow('').max(300),
  }),
  status: Joi.object({ status: Joi.string().valid('confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected').required() }),
};

/* ---------- helpers ---------- */
['restaurantId', 'categoryId', 'menuItemId', 'orderId', 'userId'].forEach((p) =>
  router.param(p, (req, res, next, v) => (mongoose.isValidObjectId(v) ? next() : next(new ApiError(400, `Invalid ${p}`)))));

const sign = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
const staff = [authenticate, authorize('restaurant_admin', 'admin')];
const loadRest = async (rid) => { const x = await Restaurant.findById(rid); if (!x) throw new ApiError(404, 'Restaurant not found'); return x; };
const canManage = (u, x) => u.role === 'admin' || String(x.owner) === String(u._id);
const mustManage = async (u, rid) => {
  const x = await loadRest(rid);
  if (!canManage(u, x)) throw new ApiError(403, 'You do not manage this restaurant');
  return x;
};
const FREE = () => +process.env.FREE_DELIVERY_OVER || 2000;
const orderNumber = () => `ZQ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomInt(1000, 10000)}`;
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const nextStates = (o) => ({
  pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['ready'],
  ready: [o.orderType === 'delivery' ? 'out_for_delivery' : 'delivered'], out_for_delivery: ['delivered'],
}[o.orderStatus] || []);

function restFilter(q, allowInactive) {
  const f = {};
  if (q.search) { const re = new RegExp(esc(q.search), 'i'); f.$or = [{ name: re }, { description: re }]; }
  if (q.city) f.city = new RegExp(`^${esc(q.city)}$`, 'i');
  f.isActive = allowInactive && q.isActive !== undefined ? q.isActive === 'true' : true;
  if (q.isOpen !== undefined) f.isOpen = q.isOpen === 'true';
  return f;
}

/* ---------- health ---------- */
router.get('/health', (req, res) => ok(res, { uptime: process.uptime() }, 'Zaiqa API is running'));

/* ---------- auth ---------- */
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: +process.env.AUTH_RATE_LIMIT || 50, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts, try again later', errors: [] } });

router.post('/auth/register', authLimiter, validate(S.register), wrap(async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw new ApiError(409, 'Email already registered');
  const { accountType, ...data } = req.body; // only customer / restaurant_admin can self-register; admin is never self-assigned
  const u = await User.create({ ...data, password: await bcrypt.hash(data.password, 12), role: accountType });
  ok(res, { user: u, accessToken: sign(u) }, 'Registration successful', 201);
}));
router.post('/auth/login', authLimiter, validate(S.login), wrap(async (req, res) => {
  const u = await User.findOne({ email: req.body.email }).select('+password');
  if (!u || !(await bcrypt.compare(req.body.password, u.password))) throw new ApiError(401, 'Invalid email or password');
  if (u.isBlocked) throw new ApiError(403, 'Your account is blocked');
  ok(res, { user: u, accessToken: sign(u) }, 'Login successful');
}));
router.post('/auth/logout', authenticate, (req, res) => ok(res, null, 'Logged out. Discard the token on the client.'));

/* ---------- users ---------- */
router.get('/users/me', authenticate, (req, res) => ok(res, req.user, 'Profile fetched successfully'));
router.patch('/users/me', authenticate, validate(S.profile), wrap(async (req, res) => {
  Object.assign(req.user, req.body); await req.user.save();
  ok(res, req.user, 'Profile updated successfully');
}));
router.patch('/users/change-password', authenticate, validate(S.chpw), wrap(async (req, res) => {
  const u = await User.findById(req.user._id).select('+password');
  if (!(await bcrypt.compare(req.body.currentPassword, u.password))) throw new ApiError(400, 'Current password is incorrect');
  u.password = await bcrypt.hash(req.body.newPassword, 12);
  u.passwordChangedAt = new Date(); // revokes all earlier tokens
  await u.save();
  ok(res, { accessToken: sign(u) }, 'Password changed. Other sessions were signed out.');
}));
router.get('/users/me/restaurants', ...staff, wrap(async (req, res) => {
  const f = req.user.role === 'admin' ? {} : { owner: req.user._id };
  ok(res, await Restaurant.find(f).sort('name'), 'Restaurants fetched successfully');
}));

/* ---------- restaurants ---------- */
router.get('/restaurants', wrap(async (req, res) => {
  const { items, pagination } = await paginate(Restaurant, restFilter(req.query, false), req, { sort: 'name' });
  ok(res, items, 'Restaurants fetched successfully', 200, { pagination });
}));
router.post('/restaurants', ...staff, validate(S.restCreate), wrap(async (req, res) => {
  const owner = req.user.role === 'admin' && req.body.owner ? req.body.owner : req.user._id;
  const { isActive, ...rest } = req.body;
  const x = await Restaurant.create({ ...rest, owner, isActive: req.user.role === 'admin' ? isActive : true });
  ok(res, x, 'Restaurant created successfully', 201);
}));
router.get('/restaurants/:restaurantId', wrap(async (req, res) => {
  const x = await loadRest(req.params.restaurantId);
  if (!x.isActive) throw new ApiError(404, 'Restaurant not found');
  const [categories, menuItems] = await Promise.all([
    Category.find({ restaurant: x._id, isActive: true }).sort('sortOrder'), MenuItem.find({ restaurant: x._id }).sort('name')]);
  ok(res, { ...x.toJSON(), categories, menuItems }, 'Restaurant fetched successfully');
}));
router.patch('/restaurants/:restaurantId', ...staff, validate(S.restUpdate), wrap(async (req, res) => {
  const x = await mustManage(req.user, req.params.restaurantId);
  if (req.user.role !== 'admin') { delete req.body.isActive; delete req.body.owner; }
  Object.assign(x, req.body); await x.save();
  ok(res, x, 'Restaurant updated successfully');
}));
router.delete('/restaurants/:restaurantId', authenticate, authorize('admin'), wrap(async (req, res) => {
  const x = await loadRest(req.params.restaurantId);
  x.isActive = false; await x.save(); // soft delete
  ok(res, x, 'Restaurant deactivated successfully');
}));
router.get('/restaurants/:restaurantId/stats', ...staff, wrap(async (req, res) => {
  const x = await mustManage(req.user, req.params.restaurantId);
  const base = { restaurant: x._id, createdAt: { $gte: dayStart() }, orderStatus: { $nin: ['cancelled', 'rejected'] } };
  const [sales, top, pending] = await Promise.all([
    Order.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: base }, { $unwind: '$items' }, { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } }, { $sort: { qty: -1 } }, { $limit: 6 }]),
    Order.countDocuments({ restaurant: x._id, orderStatus: { $in: ['pending', 'confirmed', 'preparing'] } }),
  ]);
  const s = sales[0] || { total: 0, count: 0 };
  ok(res, { salesToday: s.total, ordersToday: s.count, avgTicket: s.count ? Math.round(s.total / s.count) : 0, inKitchen: pending, topItems: top.map((t) => ({ name: t._id, qty: t.qty, revenue: t.revenue })) }, 'Stats fetched successfully');
}));

/* ---------- categories ---------- */
router.post('/restaurants/:restaurantId/categories', ...staff, validate(S.catCreate), wrap(async (req, res) => {
  const x = await mustManage(req.user, req.params.restaurantId);
  ok(res, await Category.create({ ...req.body, restaurant: x._id }), 'Category created successfully', 201);
}));
router.get('/restaurants/:restaurantId/categories', wrap(async (req, res) => {
  const x = await loadRest(req.params.restaurantId);
  ok(res, await Category.find({ restaurant: x._id }).sort('sortOrder name'), 'Categories fetched successfully');
}));
router.get('/categories/:categoryId', wrap(async (req, res) => {
  const c = await Category.findById(req.params.categoryId);
  if (!c) throw new ApiError(404, 'Category not found');
  ok(res, c, 'Category fetched successfully');
}));
router.patch('/categories/:categoryId', ...staff, validate(S.catUpdate), wrap(async (req, res) => {
  const c = await Category.findById(req.params.categoryId);
  if (!c) throw new ApiError(404, 'Category not found');
  await mustManage(req.user, c.restaurant);
  Object.assign(c, req.body); await c.save();
  ok(res, c, 'Category updated successfully');
}));
router.delete('/categories/:categoryId', ...staff, wrap(async (req, res) => {
  const c = await Category.findById(req.params.categoryId);
  if (!c) throw new ApiError(404, 'Category not found');
  await mustManage(req.user, c.restaurant);
  if (await MenuItem.exists({ category: c._id })) throw new ApiError(409, 'Move or delete the menu items in this category first');
  await c.deleteOne();
  ok(res, null, 'Category deleted successfully');
}));

/* ---------- menu ---------- */
async function checkCategory(cat, rid) {
  const c = await Category.findById(cat);
  if (!c || String(c.restaurant) !== String(rid)) throw new ApiError(422, 'Category does not belong to this restaurant');
}
const checkDiscount = (d) => { if (d.discountPrice != null && d.price != null && d.discountPrice >= d.price) throw new ApiError(422, 'Discount price must be lower than price'); };

router.post('/restaurants/:restaurantId/menu', ...staff, validate(S.menuCreate), wrap(async (req, res) => {
  const x = await mustManage(req.user, req.params.restaurantId);
  await checkCategory(req.body.category, x._id); checkDiscount(req.body);
  ok(res, await MenuItem.create({ ...req.body, restaurant: x._id }), 'Menu item created successfully', 201);
}));
router.get('/restaurants/:restaurantId/menu', wrap(async (req, res) => {
  const x = await loadRest(req.params.restaurantId);
  const q = req.query, f = { restaurant: x._id };
  if (q.category && mongoose.isValidObjectId(q.category)) f.category = q.category;
  if (q.search) f.name = new RegExp(esc(q.search), 'i');
  if (q.minPrice || q.maxPrice) f.price = { ...(q.minPrice && { $gte: +q.minPrice }), ...(q.maxPrice && { $lte: +q.maxPrice }) };
  if (q.available !== undefined) f.isAvailable = q.available === 'true';
  const { items, pagination } = await paginate(MenuItem, f, req, { sort: 'name' });
  ok(res, items, 'Menu fetched successfully', 200, { pagination });
}));
router.get('/menu/:menuItemId', wrap(async (req, res) => {
  const m = await MenuItem.findById(req.params.menuItemId);
  if (!m) throw new ApiError(404, 'Menu item not found');
  ok(res, m, 'Menu item fetched successfully');
}));
const loadItem = async (req) => {
  const m = await MenuItem.findById(req.params.menuItemId);
  if (!m) throw new ApiError(404, 'Menu item not found');
  await mustManage(req.user, m.restaurant);
  return m;
};
router.patch('/menu/:menuItemId/availability', ...staff, validate(S.avail), wrap(async (req, res) => {
  const m = await loadItem(req); m.isAvailable = req.body.isAvailable; await m.save();
  ok(res, m, 'Availability updated successfully');
}));
router.patch('/menu/:menuItemId', ...staff, validate(S.menuUpdate), wrap(async (req, res) => {
  const m = await loadItem(req);
  if (req.body.category) await checkCategory(req.body.category, m.restaurant);
  checkDiscount({ price: req.body.price ?? m.price, discountPrice: req.body.discountPrice ?? m.discountPrice });
  Object.assign(m, req.body); await m.save();
  ok(res, m, 'Menu item updated successfully');
}));
router.delete('/menu/:menuItemId', ...staff, wrap(async (req, res) => {
  const m = await loadItem(req); await m.deleteOne();
  ok(res, null, 'Menu item deleted successfully');
}));

/* ---------- cart ---------- */
async function syncCart(cart) {
  const ms = await MenuItem.find({ _id: { $in: cart.items.map((i) => i.menuItem) } });
  const map = new Map(ms.map((m) => [m.id, m]));
  const removed = [];
  cart.items = cart.items.filter((i) => {
    const m = map.get(String(i.menuItem));
    if (!m || !m.isAvailable) { removed.push(m ? m.name : 'An item that no longer exists'); return false; }
    i.price = unit(m); return true; // price always re-read from DB
  });
  let rest = null;
  if (cart.items.length) {
    rest = await Restaurant.findById(cart.restaurant);
    if (!rest || !rest.isActive) { removed.push('Items from an unavailable restaurant'); cart.items = []; rest = null; }
  }
  if (!cart.items.length) cart.restaurant = undefined;
  cart.subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
  cart.deliveryFee = rest && cart.subtotal < FREE() ? rest.deliveryFee : 0;
  cart.discount = 0;
  cart.total = cart.subtotal + cart.deliveryFee - cart.discount;
  await cart.save();
  const view = cart.toObject();
  view.id = view._id; delete view._id;
  view.items = cart.items.map((i) => { const m = map.get(String(i.menuItem)); return { menuItem: i.menuItem, name: m.name, image: m.image, quantity: i.quantity, price: i.price }; });
  return { cart, view: { ...view, removed }, map, removed };
}
const getCart = async (u) => (await Cart.findOne({ user: u._id })) || new Cart({ user: u._id, items: [] });
const cust = [authenticate, authorize('customer')];

router.get('/cart', ...cust, wrap(async (req, res) => ok(res, (await syncCart(await getCart(req.user))).view, 'Cart fetched successfully')));
router.post('/cart/items', ...cust, validate(S.cartAdd), wrap(async (req, res) => {
  const { menuItemId, quantity } = req.body;
  const m = await MenuItem.findById(menuItemId);
  if (!m) throw new ApiError(404, 'Menu item not found');
  if (!m.isAvailable) throw new ApiError(409, 'This item is currently unavailable');
  const rest = await Restaurant.findById(m.restaurant);
  if (!rest || !rest.isActive) throw new ApiError(409, 'This restaurant is not accepting orders');
  const cart = await getCart(req.user);
  const synced = await syncCart(cart);
  if (cart.items.length && String(cart.restaurant) !== String(m.restaurant))
    throw new ApiError(409, 'Your cart has items from another restaurant. Clear it first.');
  cart.restaurant = m.restaurant;
  const line = cart.items.find((i) => String(i.menuItem) === menuItemId);
  if (line) line.quantity = Math.min(line.quantity + quantity, 50); else cart.items.push({ menuItem: m._id, quantity, price: unit(m) });
  void synced;
  ok(res, (await syncCart(cart)).view, 'Item added to cart', 201);
}));
router.patch('/cart/items/:menuItemId', ...cust, validate(S.cartUpd), wrap(async (req, res) => {
  const cart = await getCart(req.user);
  const line = cart.items.find((i) => String(i.menuItem) === req.params.menuItemId);
  if (!line) throw new ApiError(404, 'Item is not in your cart');
  line.quantity = req.body.quantity;
  ok(res, (await syncCart(cart)).view, 'Cart updated successfully');
}));
router.delete('/cart/items/:menuItemId', ...cust, wrap(async (req, res) => {
  const cart = await getCart(req.user);
  cart.items = cart.items.filter((i) => String(i.menuItem) !== req.params.menuItemId);
  ok(res, (await syncCart(cart)).view, 'Item removed from cart');
}));
router.delete('/cart', ...cust, wrap(async (req, res) => {
  const cart = await getCart(req.user); cart.items = [];
  ok(res, (await syncCart(cart)).view, 'Cart cleared');
}));

/* ---------- orders ---------- */
router.post('/orders', ...cust, validate(S.order), wrap(async (req, res) => {
  const cart = await getCart(req.user);
  const { view, map, removed } = await syncCart(cart);
  if (!cart.items.length) throw new ApiError(400, removed.length ? `Cart is empty. Removed: ${removed.join(', ')}` : 'Your cart is empty');
  const items = cart.items.map((i) => ({ menuItem: i.menuItem, name: map.get(String(i.menuItem)).name, price: i.price, quantity: i.quantity, subtotal: i.price * i.quantity }));
  const order = await Order.create({
    orderNumber: orderNumber(), user: req.user._id, restaurant: cart.restaurant || view.restaurant, orderType: 'delivery', source: 'online',
    items, deliveryAddress: req.body.deliveryAddress, phone: req.body.phone, notes: req.body.notes, paymentMethod: req.body.paymentMethod,
    subtotal: view.subtotal, deliveryFee: view.deliveryFee, discount: view.discount, total: view.total,
  });
  cart.items = []; await syncCart(cart);
  ok(res, order, 'Order placed successfully', 201);
}));
router.get('/orders/my-orders', ...cust, wrap(async (req, res) => {
  const f = { user: req.user._id }; if (req.query.status) f.orderStatus = req.query.status;
  const { items, pagination } = await paginate(Order, f, req, { populate: { path: 'restaurant', select: 'name image' } });
  ok(res, items, 'Orders fetched successfully', 200, { pagination });
}));
router.get('/orders/:orderId', authenticate, wrap(async (req, res) => {
  const o = await Order.findById(req.params.orderId).populate('restaurant', 'name owner phone');
  if (!o) throw new ApiError(404, 'Order not found');
  const u = req.user;
  const allowed = u.role === 'admin' || String(o.user) === String(u._id) || String(o.restaurant.owner) === String(u._id);
  if (!allowed) throw new ApiError(403, 'You cannot access this order');
  ok(res, o, 'Order fetched successfully');
}));
router.patch('/orders/:orderId/cancel', ...cust, wrap(async (req, res) => {
  const o = await Order.findById(req.params.orderId);
  if (!o || String(o.user) !== String(req.user._id)) throw new ApiError(404, 'Order not found');
  if (!['pending', 'confirmed'].includes(o.orderStatus)) throw new ApiError(409, `Orders that are ${o.orderStatus.replace(/_/g, ' ')} cannot be cancelled`);
  o.orderStatus = 'cancelled'; if (o.paymentStatus === 'paid') o.paymentStatus = 'refunded';
  await o.save();
  ok(res, o, 'Order cancelled successfully');
}));
router.patch('/orders/:orderId/status', ...staff, validate(S.status), wrap(async (req, res) => {
  const o = await Order.findById(req.params.orderId);
  if (!o) throw new ApiError(404, 'Order not found');
  await mustManage(req.user, o.restaurant);
  const to = req.body.status;
  if (!nextStates(o).includes(to)) throw new ApiError(422, `Cannot move an order from ${o.orderStatus} to ${to}`, [{ field: 'status', message: `Allowed: ${nextStates(o).join(', ') || 'none'}` }]);
  o.orderStatus = to;
  if (to === 'delivered' && o.paymentMethod === 'cash') o.paymentStatus = 'paid';
  if (['cancelled', 'rejected'].includes(to) && o.paymentStatus === 'paid') o.paymentStatus = 'refunded';
  await o.save();
  ok(res, o, 'Order status updated successfully');
}));

/* restaurant order list + POS */
router.get('/restaurants/:restaurantId/orders', ...staff, wrap(async (req, res) => {
  const x = await mustManage(req.user, req.params.restaurantId);
  const q = req.query, f = { restaurant: x._id };
  if (q.status) f.orderStatus = q.status;
  if (q.search) f.orderNumber = new RegExp(esc(q.search), 'i');
  if (q.from || q.to) f.createdAt = { ...(q.from && { $gte: new Date(q.from) }), ...(q.to && { $lte: new Date(q.to) }) };
  const { items, pagination } = await paginate(Order, f, req);
  ok(res, items, 'Orders fetched successfully', 200, { pagination });
}));
router.post('/restaurants/:restaurantId/pos-orders', ...staff, validate(S.pos), wrap(async (req, res) => {
  const x = await mustManage(req.user, req.params.restaurantId);
  const b = req.body;
  const ms = await MenuItem.find({ _id: { $in: b.items.map((i) => i.menuItemId) }, restaurant: x._id });
  const map = new Map(ms.map((m) => [m.id, m]));
  const items = b.items.map((i) => {
    const m = map.get(i.menuItemId);
    if (!m) throw new ApiError(404, 'A menu item was not found in this restaurant');
    if (!m.isAvailable) throw new ApiError(409, `${m.name} is sold out`);
    return { menuItem: m._id, name: m.name, price: unit(m), quantity: i.quantity, subtotal: unit(m) * i.quantity };
  });
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  if (b.discount > subtotal) throw new ApiError(422, 'Discount cannot exceed the subtotal');
  const deliveryFee = b.orderType === 'delivery' && subtotal < FREE() ? x.deliveryFee : 0;
  const order = await Order.create({
    orderNumber: orderNumber(), restaurant: x._id, source: 'pos', createdBy: req.user._id, orderType: b.orderType,
    table: b.table || undefined, customerName: b.customerName || undefined, phone: b.phone || undefined, notes: b.notes,
    items, subtotal, deliveryFee, discount: b.discount, total: subtotal + deliveryFee - b.discount,
    paymentMethod: b.paymentMethod, paymentStatus: b.paid ? 'paid' : 'pending', orderStatus: 'confirmed',
  });
  ok(res, order, 'Order created successfully', 201);
}));

/* ---------- admin ---------- */
const adminOnly = [authenticate, authorize('admin')];
router.get('/admin/users', ...adminOnly, wrap(async (req, res) => {
  const f = {};
  if (req.query.role) f.role = req.query.role;
  if (req.query.search) { const re = new RegExp(esc(req.query.search), 'i'); f.$or = [{ name: re }, { email: re }]; }
  const { items, pagination } = await paginate(User, f, req);
  ok(res, items, 'Users fetched successfully', 200, { pagination });
}));
router.post('/admin/users', ...adminOnly, validate(S.adminUser), wrap(async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw new ApiError(409, 'Email already registered');
  ok(res, await User.create({ ...req.body, password: await bcrypt.hash(req.body.password, 12) }), 'User created successfully', 201);
}));
router.patch('/admin/users/:userId/block', ...adminOnly, validate(S.block), wrap(async (req, res) => {
  const u = await User.findById(req.params.userId);
  if (!u) throw new ApiError(404, 'User not found');
  if (u.role === 'admin') throw new ApiError(403, 'Super admins cannot be blocked');
  u.isBlocked = req.body.blocked; await u.save();
  ok(res, u, u.isBlocked ? 'User blocked' : 'User unblocked');
}));
router.get('/admin/restaurants', ...adminOnly, wrap(async (req, res) => {
  const { items, pagination } = await paginate(Restaurant, restFilter(req.query, true), req, { sort: 'name', populate: { path: 'owner', select: 'name email' } });
  ok(res, items, 'Restaurants fetched successfully', 200, { pagination });
}));
router.get('/admin/orders', ...adminOnly, wrap(async (req, res) => {
  const f = {};
  if (req.query.status) f.orderStatus = req.query.status;
  if (req.query.restaurant && mongoose.isValidObjectId(req.query.restaurant)) f.restaurant = req.query.restaurant;
  const { items, pagination } = await paginate(Order, f, req, { populate: { path: 'restaurant', select: 'name' } });
  ok(res, items, 'Orders fetched successfully', 200, { pagination });
}));
router.get('/admin/dashboard', ...adminOnly, wrap(async (req, res) => {
  const [users, restaurants, orders, rev, today, pending, completed] = await Promise.all([
    User.countDocuments(), Restaurant.countDocuments(), Order.countDocuments(),
    Order.aggregate([{ $match: { orderStatus: 'delivered' } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
    Order.countDocuments({ createdAt: { $gte: dayStart() } }), Order.countDocuments({ orderStatus: 'pending' }), Order.countDocuments({ orderStatus: 'delivered' })]);
  ok(res, { totalUsers: users, totalRestaurants: restaurants, totalOrders: orders, totalRevenue: rev[0]?.t || 0, todaysOrders: today, pendingOrders: pending, completedOrders: completed }, 'Dashboard fetched successfully');
}));

module.exports = router;
