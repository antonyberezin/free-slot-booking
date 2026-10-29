const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    vehicleNumber: {
      type: String,
      required: true,
      uppercase: true,
      match: [/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/, 'Invalid vehicle number'],
    },
    vehicleType: { type: String, enum: ['car', 'bike', 'truck', 'ev'], required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['booked', 'cancelled'], default: 'booked' },
  },
  { timestamps: true }
);

// Speeds up the overlap check used for free-slot identification
bookingSchema.index({ slot: 1, status: 1, startTime: 1, endTime: 1 });

/**
 * Two intervals [aStart, aEnd) and [bStart, bEnd) overlap when
 * aStart < bEnd AND aEnd > bStart. This returns the filter for
 * active bookings that collide with the requested window.
 */
bookingSchema.statics.overlapFilter = function (start, end) {
  return { status: 'booked', startTime: { $lt: end }, endTime: { $gt: start } };
};

module.exports = mongoose.model('Booking', bookingSchema);
