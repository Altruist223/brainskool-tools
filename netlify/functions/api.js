// netlify/functions/api.js
// Wraps the Express app as a Netlify Serverless Function.
// All /api/* requests are redirected here via netlify.toml.

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const serverless    = require('serverless-http');
const mongoose      = require('mongoose');
const authRoutes    = require('../../routes/auth');

const app = express();

// ─── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── MongoDB — cached connection (avoids reconnect on every call) ──
async function connectDB() {
    if (mongoose.connection.readyState >= 1) return;
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
}

// ─── Routes ───────────────────────────────────────────────────
// Mount at both '/api' and '/' to be robust under different Netlify redirect scenarios
app.use('/api', authRoutes);
app.use('/', authRoutes);

// ─── Handler ──────────────────────────────────────────────────
const handler = serverless(app);

exports.handler = async (event, context) => {
    // Reuse DB connection across warm invocations
    context.callbackWaitsForEmptyEventLoop = false;
    try {
        await connectDB();
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Database connection failed', details: err.message }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
    }
    return handler(event, context);
};
