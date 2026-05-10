'use strict';
if (typeof globalThis.crypto === 'undefined') globalThis.crypto = require('crypto').webcrypto;
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');
const connectDB = require('./config/db');

connectDB();

const app = express();

// Disable ETag so API responses always return 200 (never 304 from cache)
app.set('etag', false);

// ── Security & Parsing ────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// app.use(cors({
//     origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
// }));
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://35.154.216.100:5010',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {

    // allow requests with no origin
    // (mobile apps, postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// No-cache for all /api routes — prevents stale responses after schema changes
app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static Files (uploads) ────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/api/auth'));
app.use('/api/super-admin',   require('./routes/api/superAdmin'));
app.use('/api/admin',         require('./routes/api/admin'));
app.use('/api/teacher',       require('./routes/api/teacher'));
app.use('/api/student',       require('./routes/api/student'));
app.use('/api/parent',        require('./routes/api/parent'));
app.use('/api/fees',          require('./routes/api/fees'));
app.use('/api/payroll',       require('./routes/api/payroll'));
app.use('/api/library',       require('./routes/api/library'));
app.use('/api/notifications', require('./routes/api/notifications'));
app.use('/api/profile',       require('./routes/api/profile'));
app.use('/internal',          require('./routes/api/internal'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
