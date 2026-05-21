// api/index.js
// Wraps the Express app as a Vercel Serverless Function.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('../routes/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB cached connection
async function connectDB() {
    if (mongoose.connection.readyState >= 1) {
        return;
    }
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }
    await mongoose.connect(process.env.MONGO_URI);
}

// Middleware to ensure DB is connected before handling request
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Mount auth routes.
// We mount at both '/' and '/api' to be safe with different routing scenarios.
app.use('/api', authRoutes);
app.use('/', authRoutes);

module.exports = app;
