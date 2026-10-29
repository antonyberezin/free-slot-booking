const mongoose = require('mongoose');

const VEHICLE_TYPES = ['car', 'bike', 'truck', 'ev'];

const slotSchema = new mongoose.Schema(
  {
    slotNumber: {
      type: String,
      required: [true, 'Slot number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]-\d{2,3}$/, 'Slot number must look like A-01'],
    },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    floor: { type: Number, required: true, min: 0, max: 10 },
    pricePerHour: { type: Number, required: true, min: 1, max: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

slotSchema.statics.VEHICLE_TYPES = VEHICLE_TYPES;

module.exports = mongoose.model('Slot', slotSchema);
