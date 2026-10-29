// Run with: npm run seed
// Creates an admin account and sample parking slots.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Slot = require('./models/Slot');

const slots = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ slotNumber: `A-0${n}`, vehicleType: 'car', floor: 0, pricePerHour: 40 })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ slotNumber: `B-0${n}`, vehicleType: 'bike', floor: 0, pricePerHour: 15 })),
  ...[1, 2, 3].map((n) => ({ slotNumber: `C-0${n}`, vehicleType: 'ev', floor: 1, pricePerHour: 50 })),
  ...[1, 2].map((n) => ({ slotNumber: `D-0${n}`, vehicleType: 'truck', floor: 1, pricePerHour: 100 })),
];

(async () => {
  await connectDB();

  if (!(await User.exists({ email: 'admin@slotfinder.com' }))) {
    await User.create({
      name: 'System Admin',
      email: 'admin@slotfinder.com',
      phone: '9876543210',
      password: 'Admin@123',
      role: 'admin',
    });
    console.log('Admin created -> admin@slotfinder.com / Admin@123');
  } else {
    console.log('Admin already exists');
  }

  let added = 0;
  for (const s of slots) {
    const res = await Slot.updateOne({ slotNumber: s.slotNumber }, { $setOnInsert: s }, { upsert: true });
    added += res.upsertedCount;
  }
  console.log(`Slots added: ${added} (total ${await Slot.countDocuments()})`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
