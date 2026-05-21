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
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle OPTIONS preflight
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── MongoDB — cached connection (avoids reconnect on every call) ──
async function connectDB() {
    if (mongoose.connection.readyState >= 1) return;
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not defined in environment variables');
    }
    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 8000,
    });
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

    // Netlify sometimes base64-encodes the body — decode it so express.json() can parse it
    if (event.isBase64Encoded && event.body) {
        event.body = Buffer.from(event.body, 'base64').toString('utf8');
        event.isBase64Encoded = false;
    }

    // Ensure Content-Type header is present for JSON bodies
    if (event.body && !event.headers['content-type'] && !event.headers['Content-Type']) {
        event.headers['content-type'] = 'application/json';
    }

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
    try {
        return await handler(event, context);
    } catch (err) {
        console.error('❌ Handler Error:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: err.message }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
    }
};
