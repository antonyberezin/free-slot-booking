// API tests. Run with: npm test
// Uses a separate database (slotbooking_test) so real data is never touched.
require('dotenv').config();
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const baseUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/slotbooking';
process.env.MONGO_URI = baseUri.replace(/\/([^/?]*)(\?|$)/, '/slotbooking_test$2');
process.env.JWT_SECRET ||= 'test_secret';

const app = require('../server');
const User = require('../models/User');
const Slot = require('../models/Slot');

let server, base, userToken, adminToken, carSlots;
const hour = 3600000;
const at = (h) => new Date(Date.now() + h * hour).toISOString();

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (mongoose.connection.name !== 'slotbooking_test') throw new Error('Refusing to run on a non-test database');
  await mongoose.connection.dropDatabase();
  await User.create({ name: 'Admin', email: 'admin@test.com', phone: '9876543210', password: 'Admin@123', role: 'admin' });
  carSlots = await Slot.create([
    { slotNumber: 'A-01', vehicleType: 'car', floor: 0, pricePerHour: 40 },
    { slotNumber: 'A-02', vehicleType: 'car', floor: 0, pricePerHour: 40 },
  ]);
  await Slot.create({ slotNumber: 'B-01', vehicleType: 'bike', floor: 0, pricePerHour: 15 });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
});

const validUser = {
  name: 'Test User', email: 'user@test.com', phone: '9123456789',
  password: 'Test@1234', confirmPassword: 'Test@1234',
};

// ---------- Auth & validation ----------

test('register rejects invalid input with field errors', async () => {
  const r = await call('/auth/register', {
    method: 'POST',
    body: { name: 'A1', email: 'bad', phone: '12345', password: 'weak', confirmPassword: 'x' },
  });
  assert.equal(r.status, 422);
  for (const f of ['name', 'email', 'phone', 'password', 'confirmPassword']) assert.ok(r.body.errors[f], f);
});

test('register succeeds and returns a token', async () => {
  const r = await call('/auth/register', { method: 'POST', body: validUser });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.role, 'user');
  userToken = r.body.token;
});

test('duplicate email is rejected', async () => {
  const r = await call('/auth/register', { method: 'POST', body: validUser });
  assert.equal(r.status, 409);
});

test('password is stored hashed', async () => {
  const u = await User.findOne({ email: 'user@test.com' }).select('+password');
  assert.notEqual(u.password, validUser.password);
});

test('login with wrong password fails, correct password works', async () => {
  const bad = await call('/auth/login', { method: 'POST', body: { email: 'user@test.com', password: 'Wrong@123' } });
  assert.equal(bad.status, 401);
  const ok = await call('/auth/login', { method: 'POST', body: { email: 'admin@test.com', password: 'Admin@123' } });
  assert.equal(ok.status, 200);
  adminToken = ok.body.token;
});

test('protected routes need a token', async () => {
  const r = await call('/bookings/mine');
  assert.equal(r.status, 401);
});

// ---------- Free slot identification ----------

test('search validates time window', async () => {
  const past = await call(`/slots/available?vehicleType=car&startTime=2020-01-01T10:00:00Z&endTime=2020-01-01T12:00:00Z`, { token: userToken });
  assert.equal(past.status, 422);
  const short = await call(`/slots/available?vehicleType=car&startTime=${at(1)}&endTime=${at(1.2)}`, { token: userToken });
  assert.equal(short.status, 422);
  const badType = await call(`/slots/available?vehicleType=plane&startTime=${at(1)}&endTime=${at(2)}`, { token: userToken });
  assert.equal(badType.status, 422);
});

test('all car slots are free initially, with estimated cost', async () => {
  const r = await call(`/slots/available?vehicleType=car&startTime=${at(1)}&endTime=${at(3)}`, { token: userToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 2);
  assert.equal(r.body.freeCount, 2);
  assert.equal(r.body.free[0].estimatedCost, 80);
});

test('booking validates vehicle number', async () => {
  const r = await call('/bookings', {
    method: 'POST', token: userToken,
    body: { slotId: String(carSlots[0]._id), vehicleNumber: '1234', vehicleType: 'car', startTime: at(1), endTime: at(3) },
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.vehicleNumber);
});

test('booking a slot for the wrong vehicle type is rejected', async () => {
  const r = await call('/bookings', {
    method: 'POST', token: userToken,
    body: { slotId: String(carSlots[0]._id), vehicleNumber: 'TN01AB1234', vehicleType: 'bike', startTime: at(1), endTime: at(3) },
  });
  assert.equal(r.status, 400);
});

let firstBookingId;
test('booking a free slot works and amount is calculated', async () => {
  const r = await call('/bookings', {
    method: 'POST', token: userToken,
    body: { slotId: String(carSlots[0]._id), vehicleNumber: 'tn 01 ab 1234', vehicleType: 'car', startTime: at(1), endTime: at(3) },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.amount, 80);
  assert.equal(r.body.vehicleNumber, 'TN01AB1234');
  firstBookingId = r.body._id;
});

test('booked slot is no longer listed as free for an overlapping window', async () => {
  const r = await call(`/slots/available?vehicleType=car&startTime=${at(2)}&endTime=${at(4)}`, { token: userToken });
  assert.equal(r.body.freeCount, 1);
  assert.equal(r.body.free[0].slotNumber, 'A-02');
});

test('slot is free again for a non-overlapping window (back-to-back)', async () => {
  const r = await call(`/slots/available?vehicleType=car&startTime=${at(3)}&endTime=${at(5)}`, { token: userToken });
  assert.equal(r.body.freeCount, 2);
});

test('double booking the same slot is blocked', async () => {
  const r = await call('/bookings', {
    method: 'POST', token: userToken,
    body: { slotId: String(carSlots[0]._id), vehicleNumber: 'KA05MN4321', vehicleType: 'car', startTime: at(2), endTime: at(4) },
  });
  assert.equal(r.status, 409);
});

test('same vehicle cannot be booked in two slots at once', async () => {
  const r = await call('/bookings', {
    method: 'POST', token: userToken,
    body: { slotId: String(carSlots[1]._id), vehicleNumber: 'TN01AB1234', vehicleType: 'car', startTime: at(2), endTime: at(4) },
  });
  assert.equal(r.status, 409);
  assert.ok(r.body.errors.vehicleNumber);
});

test('when all slots are full, the next free time is suggested', async () => {
  const b = await call('/bookings', {
    method: 'POST', token: userToken,
    body: { slotId: String(carSlots[1]._id), vehicleNumber: 'KA05MN4321', vehicleType: 'car', startTime: at(1), endTime: at(5) },
  });
  assert.equal(b.status, 201);

  const r = await call(`/slots/available?vehicleType=car&startTime=${at(1)}&endTime=${at(3)}`, { token: userToken });
  assert.equal(r.body.freeCount, 0);
  assert.equal(r.body.suggestion.slot.slotNumber, 'A-01');
  // A-01 is booked until +3h, so the earliest 2h window starts at +3h
  assert.ok(Math.abs(new Date(r.body.suggestion.startTime) - new Date(at(3))) < 60000);
});

test('cancelling a booking frees the slot', async () => {
  const c = await call(`/bookings/${firstBookingId}/cancel`, { method: 'PATCH', token: userToken });
  assert.equal(c.status, 200);
  const r = await call(`/slots/available?vehicleType=car&startTime=${at(1)}&endTime=${at(3)}`, { token: userToken });
  assert.equal(r.body.freeCount, 1);
  const again = await call(`/bookings/${firstBookingId}/cancel`, { method: 'PATCH', token: userToken });
  assert.equal(again.status, 400);
});

test('my bookings, live status and day view respond', async () => {
  const mine = await call('/bookings/mine', { token: userToken });
  assert.equal(mine.body.length, 2);
  const status = await call('/slots/status', { token: userToken });
  assert.equal(status.body.summary.total, 3);
  const day = await call('/slots/day', { token: userToken });
  assert.equal(day.status, 200);
});

// ---------- Admin ----------

test('normal user cannot access admin routes', async () => {
  const r = await call('/bookings', { token: userToken });
  assert.equal(r.status, 403);
});

test('admin slot form validates input', async () => {
  const r = await call('/slots', {
    method: 'POST', token: adminToken,
    body: { slotNumber: 'zz', vehicleType: 'plane', floor: 20, pricePerHour: 0 },
  });
  assert.equal(r.status, 422);
  for (const f of ['slotNumber', 'vehicleType', 'floor', 'pricePerHour']) assert.ok(r.body.errors[f], f);
});

test('admin can add, edit and deactivate slots', async () => {
  const add = await call('/slots', {
    method: 'POST', token: adminToken,
    body: { slotNumber: 'e-01', vehicleType: 'ev', floor: 1, pricePerHour: 50 },
  });
  assert.equal(add.status, 201);
  assert.equal(add.body.slotNumber, 'E-01');

  const dup = await call('/slots', {
    method: 'POST', token: adminToken,
    body: { slotNumber: 'E-01', vehicleType: 'ev', floor: 1, pricePerHour: 50 },
  });
  assert.equal(dup.status, 409);

  const edit = await call(`/slots/${add.body._id}`, {
    method: 'PUT', token: adminToken,
    body: { slotNumber: 'E-01', vehicleType: 'ev', floor: 2, pricePerHour: 60, isActive: false },
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.isActive, false);

  const search = await call(`/slots/available?vehicleType=ev&startTime=${at(1)}&endTime=${at(2)}`, { token: userToken });
  assert.equal(search.body.total, 0, 'inactive slots are not offered');
});

test('slot with upcoming bookings cannot be deleted', async () => {
  const r = await call(`/slots/${carSlots[1]._id}`, { method: 'DELETE', token: adminToken });
  assert.equal(r.status, 409);
});

test('admin stats and all bookings', async () => {
  const s = await call('/bookings/stats', { token: adminToken });
  assert.deepEqual([s.body.total, s.body.cancelled, s.body.revenue], [2, 1, 160]);
  const all = await call('/bookings', { token: adminToken });
  assert.equal(all.body.length, 2);
});

test('invalid ids and unknown routes are handled', async () => {
  const bad = await call('/bookings/not-an-id/cancel', { method: 'PATCH', token: userToken });
  assert.equal(bad.status, 422);
  const missing = await call('/nope');
  assert.equal(missing.status, 404);
});
