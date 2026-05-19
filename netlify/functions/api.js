// netlify/functions/api.js
// Wraps the Express app as a Netlify Serverless Function.
// All /api/* requests are redirected here via netlify.toml.

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
let isConnected = false;

async function connectDB() {
    if (isConnected) return;
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log('✅ MongoDB connected');
}

// ─── Routes ───────────────────────────────────────────────────
// Mount at root "/" because Netlify already strips the /api prefix
// via the redirect rule: /api/* → /.netlify/functions/api/:splat
app.use('/', authRoutes);

// ─── Handler ──────────────────────────────────────────────────
const handler = serverless(app);

exports.handler = async (event, context) => {
    // Reuse DB connection across warm invocations
    context.callbackWaitsForEmptyEventLoop = false;
    await connectDB();
    return handler(event, context);
};
