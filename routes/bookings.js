const router = require('express').Router();
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const rules = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { isSlotFree } = require('../utils/freeSlots');

// POST /api/bookings - book a free slot
router.post('/', protect, rules.createBooking, async (req, res, next) => {
  try {
    const { slotId, vehicleNumber, vehicleType } = req.body;
    const start = new Date(req.body.startTime);
    const end = new Date(req.body.endTime);

    const slot = await Slot.findById(slotId);
    if (!slot || !slot.isActive) return res.status(404).json({ message: 'Slot not found or inactive' });
    if (slot.vehicleType !== vehicleType) {
      return res.status(400).json({ message: `Slot ${slot.slotNumber} is only for ${slot.vehicleType}` });
    }

    // Re-check availability at booking time (someone may have just booked it)
    if (!(await isSlotFree(slot._id, start, end))) {
      return res.status(409).json({ message: `Slot ${slot.slotNumber} was just booked for this time. Please search again.` });
    }

    // The same vehicle cannot be parked in two slots at once
    const vehicleClash = await Booking.exists({ vehicleNumber, ...Booking.overlapFilter(start, end) });
    if (vehicleClash) {
      return res.status(409).json({
        message: 'This vehicle already has a booking in this time window',
        errors: { vehicleNumber: 'Vehicle already booked for an overlapping time' },
      });
    }

    const hours = (end - start) / 3600000;
    const booking = await Booking.create({
      user: req.user._id,
      slot: slot._id,
      vehicleNumber,
      vehicleType,
      startTime: start,
      endTime: end,
      amount: Math.round(slot.pricePerHour * hours),
    });
    await booking.populate('slot');
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/mine - logged-in user's bookings
router.get('/mine', protect, async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user: req.user._id }).populate('slot').sort({ startTime: -1 });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bookings/:id/cancel - owner or admin
router.patch('/:id/cancel', protect, rules.id, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const isOwner = String(booking.user) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not allowed to cancel this booking' });
    }
    if (booking.status === 'cancelled') return res.status(400).json({ message: 'Booking already cancelled' });
    if (booking.endTime <= new Date()) return res.status(400).json({ message: 'Completed bookings cannot be cancelled' });

    booking.status = 'cancelled';
    await booking.save();
    res.json({ message: 'Booking cancelled - the slot is free again', booking });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings - admin: all bookings
router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate('slot')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/stats - admin dashboard numbers
router.get('/stats', protect, adminOnly, async (req, res, next) => {
  try {
    const [total, active, cancelled, revenue] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'booked', endTime: { $gt: new Date() } }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.aggregate([{ $match: { status: 'booked' } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
    ]);
    res.json({ total, active, cancelled, revenue: revenue[0]?.sum || 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
