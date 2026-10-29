const { body, query, param, validationResult } = require('express-validator');

const VEHICLE_TYPES = ['car', 'bike', 'truck', 'ev'];
const VEHICLE_NO = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const MIN_MINUTES = 30;
const MAX_HOURS = 24;
const MAX_DAYS_AHEAD = 30;

// Sends 422 with field-wise errors if any rule failed
function handle(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = {};
  result.array().forEach((e) => {
    if (!errors[e.path]) errors[e.path] = e.msg;
  });
  res.status(422).json({ message: 'Validation failed', errors });
}

// Shared check for start/end time windows (body or query)
function timeWindow(source) {
  const field = source === 'query' ? query : body;
  return [
    field('startTime')
      .notEmpty().withMessage('Start time is required')
      .isISO8601().withMessage('Start time must be a valid date')
      .custom((v) => {
        const start = new Date(v);
        if (start.getTime() < Date.now() - 60 * 1000) throw new Error('Start time cannot be in the past');
        const limit = Date.now() + MAX_DAYS_AHEAD * 24 * 3600 * 1000;
        if (start.getTime() > limit) throw new Error(`Bookings allowed only ${MAX_DAYS_AHEAD} days ahead`);
        return true;
      }),
    field('endTime')
      .notEmpty().withMessage('End time is required')
      .isISO8601().withMessage('End time must be a valid date')
      .custom((v, { req }) => {
        const start = new Date(req[source].startTime);
        const end = new Date(v);
        if (end <= start) throw new Error('End time must be after start time');
        const mins = (end - start) / 60000;
        if (mins < MIN_MINUTES) throw new Error(`Minimum booking is ${MIN_MINUTES} minutes`);
        if (mins > MAX_HOURS * 60) throw new Error(`Maximum booking is ${MAX_HOURS} hours`);
        return true;
      }),
  ];
}

const rules = {
  register: [
    body('name').trim()
      .notEmpty().withMessage('Name is required')
      .isLength({ min: 3, max: 50 }).withMessage('Name must be 3-50 characters')
      .matches(/^[A-Za-z ]+$/).withMessage('Name can contain only letters and spaces'),
    body('email').trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Enter a valid email').toLowerCase(),
    body('phone').trim()
      .notEmpty().withMessage('Phone is required')
      .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit mobile number'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .matches(STRONG_PASSWORD)
      .withMessage('Password needs 8+ chars with upper, lower, number and special character'),
    body('confirmPassword').custom((v, { req }) => {
      if (v !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
    handle,
  ],

  login: [
    body('email').trim().notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Enter a valid email').toLowerCase(),
    body('password').notEmpty().withMessage('Password is required'),
    handle,
  ],

  availability: [
    query('vehicleType').isIn(VEHICLE_TYPES).withMessage('Select a valid vehicle type'),
    ...timeWindow('query'),
    handle,
  ],

  createBooking: [
    body('slotId').isMongoId().withMessage('Invalid slot'),
    body('vehicleNumber')
      .trim().toUpperCase().customSanitizer((v) => v.replace(/[\s-]/g, ''))
      .matches(VEHICLE_NO).withMessage('Vehicle number must look like TN01AB1234'),
    body('vehicleType').isIn(VEHICLE_TYPES).withMessage('Select a valid vehicle type'),
    ...timeWindow('body'),
    handle,
  ],

  slot: [
    body('slotNumber').trim().toUpperCase()
      .matches(/^[A-Z]-\d{2,3}$/).withMessage('Slot number must look like A-01'),
    body('vehicleType').isIn(VEHICLE_TYPES).withMessage('Select a valid vehicle type'),
    body('floor').isInt({ min: 0, max: 10 }).withMessage('Floor must be 0-10').toInt(),
    body('pricePerHour').isFloat({ min: 1, max: 1000 }).withMessage('Price must be 1-1000').toFloat(),
    body('isActive').optional().isBoolean().withMessage('isActive must be true/false').toBoolean(),
    handle,
  ],

  dayView: [
    query('date').optional().isISO8601().withMessage('Invalid date'),
    handle,
  ],

  id: [param('id').isMongoId().withMessage('Invalid ID'), handle],
};

module.exports = rules;
