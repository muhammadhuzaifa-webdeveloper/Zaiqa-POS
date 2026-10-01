process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { User } = require('../src/models');

let mongo, owner, cust, rid, cid, mid;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.data.accessToken;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.create({ name: 'Owner', email: 'o@z.pk', password: await bcrypt.hash('Owner@123', 4), role: 'restaurant_admin' });
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

test('register, duplicate email, login', async () => {
  const body = { name: 'Jo Doe', email: 'jo@z.pk', password: 'Password123!', phone: '+923001234567' };
  const r = await request(app).post('/api/auth/register').send(body);
  expect(r.status).toBe(201); expect(r.body.data.user.password).toBeUndefined();
  expect((await request(app).post('/api/auth/register').send(body)).status).toBe(409);
  expect((await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrong' })).status).toBe(401);
  cust = await login(body.email, body.password); owner = await login('o@z.pk', 'Owner@123');
});

test('owner can self-register and admin role cannot be self-assigned', async () => {
  const b = { name: 'Own Er', email: 'own@z.pk', password: 'Password123!', phone: '+923001234567' };
  expect((await request(app).post('/api/auth/register').send({ ...b, accountType: 'restaurant_admin' })).body.data.user.role).toBe('restaurant_admin');
  expect((await request(app).post('/api/auth/register').send({ ...b, email: 'x@z.pk', accountType: 'admin' })).status).toBe(422);
});

test('customers cannot use admin endpoints; missing token is 401', async () => {
  expect((await request(app).post('/api/restaurants').set(auth(cust)).send({})).status).toBe(403);
  expect((await request(app).get('/api/users/me')).status).toBe(401);
});

test('owner builds a menu; cart + order use DB prices and follow the status flow', async () => {
  rid = (await request(app).post('/api/restaurants').set(auth(owner)).send({ name: 'Test Grill', address: 'Main St', city: 'Karachi' })).body.data.id;
  cid = (await request(app).post(`/api/restaurants/${rid}/categories`).set(auth(owner)).send({ name: 'Burgers' })).body.data.id;
  mid = (await request(app).post(`/api/restaurants/${rid}/menu`).set(auth(owner)).send({ category: cid, name: 'Zinger', price: 650, discountPrice: 599 })).body.data.id;
  const add = await request(app).post('/api/cart/items').set(auth(cust)).send({ menuItemId: mid, quantity: 2, price: 1 });
  expect(add.body.data.subtotal).toBe(1198);
  const o = await request(app).post('/api/orders').set(auth(cust)).send({ deliveryAddress: { address: 'House 1', city: 'Karachi' }, phone: '+923001234567' });
  expect(o.status).toBe(201); expect(o.body.data.total).toBe(1198 + 150);
  const oid = o.body.data.id;
  expect((await request(app).patch(`/api/orders/${oid}/status`).set(auth(owner)).send({ status: 'delivered' })).status).toBe(422);
  expect((await request(app).patch(`/api/orders/${oid}/status`).set(auth(owner)).send({ status: 'confirmed' })).status).toBe(200);
});

test('POS order is priced server-side', async () => {
  const r = await request(app).post(`/api/restaurants/${rid}/pos-orders`).set(auth(owner)).send({ items: [{ menuItemId: mid, quantity: 3 }], discount: 100 });
  expect(r.status).toBe(201); expect(r.body.data.total).toBe(599 * 3 - 100);
});
