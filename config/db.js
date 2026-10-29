const mongoose = require('mongoose');

// Reused across requests so serverless functions (Vercel) connect only once per instance
let connection = null;

async function connectDB() {
  if (connection) return connection;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set. Copy .env.example to .env and set it.');

  connection = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then((m) => {
    console.log(`MongoDB connected: ${m.connection.host}/${m.connection.name}`);
    return m;
  });
  try {
    return await connection;
  } catch (err) {
    connection = null; // allow a retry on the next request
    throw err;
  }
}

module.exports = connectDB;
