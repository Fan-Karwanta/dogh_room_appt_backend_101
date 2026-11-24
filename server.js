const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');
const { generalLimiter } = require('./middleware/rateLimiter');

// Workaround: c-ares (used for mongodb+srv:// SRV lookups) picks up a stale
// DNS server list on this machine and times out; pin it to the adapter's DNS.
dns.setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(generalLimiter);

// Routes
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
