require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Connect on first API request so serverless deployments (Vercel) work; open connections are reused
app.use('/api', async (req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/bookings', require('./routes/bookings'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Unknown API route
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ message: `${field} already exists` });
  }
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

// Start only when run directly (tests import the app without listening)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other server (Ctrl+C in its terminal) or change PORT in .env`);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
  }).catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
}

module.exports = app;
