const router = require('express').Router();
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const rules = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { findFreeSlots, suggestNextFree } = require('../utils/freeSlots');

// GET /api/slots/available?vehicleType=car&startTime=..&endTime=..
router.get('/available', protect, rules.availability, async (req, res, next) => {
  try {
    const start = new Date(req.query.startTime);
    const end = new Date(req.query.endTime);
    const { vehicleType } = req.query;

    const result = await findFreeSlots(vehicleType, start, end);
    const hours = (end - start) / 3600000;
    const free = result.free.map((s) => ({ ...s, estimatedCost: Math.round(s.pricePerHour * hours) }));

    let suggestion = null;
    if (free.length === 0 && result.total > 0) {
      suggestion = await suggestNextFree(vehicleType, start, end);
    }
    res.json({ total: result.total, occupied: result.occupied, freeCount: free.length, free, suggestion });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots/status - live occupancy right now for every slot
router.get('/status', protect, async (req, res, next) => {
  try {
    const now = new Date();
    const slots = await Slot.find().sort({ floor: 1, slotNumber: 1 }).lean();
    const current = await Booking.find({ status: 'booked', startTime: { $lte: now }, endTime: { $gt: now } }).lean();
    const busy = new Map(current.map((b) => [String(b.slot), b.endTime]));

    const list = slots.map((s) => ({
      ...s,
      state: !s.isActive ? 'inactive' : busy.has(String(s._id)) ? 'occupied' : 'free',
      freeAt: busy.get(String(s._id)) || null,
    }));

    const summary = { total: slots.length, free: 0, occupied: 0, inactive: 0, byType: {} };
    list.forEach((s) => {
      summary[s.state]++;
      const t = (summary.byType[s.vehicleType] ||= { total: 0, free: 0 });
      t.total++;
      if (s.state === 'free') t.free++;
    });
    res.json({ summary, slots: list });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots/day?date=<ISO of local midnight> - bookings per slot for a timeline view
router.get('/day', protect, rules.dayView, async (req, res, next) => {
  try {
    const now = new Date();
    const dayStart = req.query.date
      ? new Date(req.query.date)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600000);

    const slots = await Slot.find({ isActive: true }).sort({ floor: 1, slotNumber: 1 }).lean();
    const bookings = await Booking.find(Booking.overlapFilter(dayStart, dayEnd))
      .select('slot startTime endTime')
      .lean();

    const bySlot = {};
    bookings.forEach((b) => (bySlot[b.slot] ||= []).push({ startTime: b.startTime, endTime: b.endTime }));
    res.json({
      dayStart,
      dayEnd,
      slots: slots.map((s) => ({ ...s, bookings: bySlot[s._id] || [] })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Admin CRUD ----------

router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    res.json(await Slot.find().sort({ floor: 1, slotNumber: 1 }));
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, adminOnly, rules.slot, async (req, res, next) => {
  try {
    const { slotNumber, vehicleType, floor, pricePerHour, isActive } = req.body;
    if (await Slot.exists({ slotNumber })) {
      return res.status(409).json({ message: 'Slot already exists', errors: { slotNumber: 'Slot number already exists' } });
    }
    const slot = await Slot.create({ slotNumber, vehicleType, floor, pricePerHour, isActive });
    res.status(201).json(slot);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', protect, adminOnly, rules.id, rules.slot, async (req, res, next) => {
  try {
    const { slotNumber, vehicleType, floor, pricePerHour, isActive } = req.body;
    const clash = await Slot.findOne({ slotNumber, _id: { $ne: req.params.id } });
    if (clash) {
      return res.status(409).json({ message: 'Slot already exists', errors: { slotNumber: 'Slot number already exists' } });
    }
    const slot = await Slot.findByIdAndUpdate(
      req.params.id,
      { slotNumber, vehicleType, floor, pricePerHour, isActive },
      { new: true, runValidators: true }
    );
    if (!slot) return res.status(404).json({ message: 'Slot not found' });
    res.json(slot);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, rules.id, async (req, res, next) => {
  try {
    const upcoming = await Booking.exists({ slot: req.params.id, status: 'booked', endTime: { $gt: new Date() } });
    if (upcoming) {
      return res.status(409).json({ message: 'Slot has active/upcoming bookings. Deactivate it instead.' });
    }
    const slot = await Slot.findByIdAndDelete(req.params.id);
    if (!slot) return res.status(404).json({ message: 'Slot not found' });
    res.json({ message: 'Slot deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
