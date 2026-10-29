const Slot = require('../models/Slot');
const Booking = require('../models/Booking');

/**
 * Core algorithm: identify free slots for a vehicle type in [start, end).
 * 1. Find all active slots of that vehicle type.
 * 2. Find bookings on those slots that overlap the window.
 * 3. Free slots = all slots minus slots that have an overlapping booking.
 */
async function findFreeSlots(vehicleType, start, end) {
  const slots = await Slot.find({ vehicleType, isActive: true }).sort({ floor: 1, slotNumber: 1 }).lean();
  const busy = await Booking.find({
    slot: { $in: slots.map((s) => s._id) },
    ...Booking.overlapFilter(start, end),
  }).distinct('slot');

  const busyIds = new Set(busy.map(String));
  const free = slots.filter((s) => !busyIds.has(String(s._id)));
  return { total: slots.length, free, occupied: slots.length - free.length };
}

/**
 * When nothing is free, suggest the earliest start time (>= requested start)
 * at which any slot of this type is free for the same duration.
 * For each slot we walk its bookings in order and push the candidate
 * start past every booking that collides with it.
 */
async function suggestNextFree(vehicleType, start, end) {
  const duration = end - start;
  const slots = await Slot.find({ vehicleType, isActive: true }).lean();
  let best = null;

  for (const slot of slots) {
    const bookings = await Booking.find({ slot: slot._id, status: 'booked', endTime: { $gt: start } })
      .sort({ startTime: 1 })
      .lean();

    let candidate = new Date(start);
    for (const b of bookings) {
      const candidateEnd = new Date(candidate.getTime() + duration);
      if (b.startTime >= candidateEnd) break; // gap is big enough
      if (b.endTime > candidate) candidate = new Date(b.endTime);
    }
    if (!best || candidate < best.startTime) {
      best = { slot, startTime: candidate, endTime: new Date(candidate.getTime() + duration) };
    }
  }
  return best;
}

async function isSlotFree(slotId, start, end) {
  return !(await Booking.exists({ slot: slotId, ...Booking.overlapFilter(start, end) }));
}

module.exports = { findFreeSlots, suggestNextFree, isSlotFree };
