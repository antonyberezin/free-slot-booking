const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rules = require('../middleware/validate');
const { protect } = require('../middleware/auth');

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

function publicUser(u) {
  return { id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}

// POST /api/auth/register
router.post('/register', rules.register, async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'Email already registered', errors: { email: 'Email already registered' } });
    }
    const user = await User.create({ name, email, phone, password });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', rules.login, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
