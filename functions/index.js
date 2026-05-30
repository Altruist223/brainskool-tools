// functions/index.js
// Firebase Cloud Function wrapping the Express API

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const functions = require('firebase-functions/v2/https');
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');

// ─── App Setup ───────────────────────────────────────────────
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── MongoDB ─────────────────────────────────────────────────
// Use environment variables (set via functions/.env)
function getMongoUri() {
    return process.env.MONGO_URI;
}

async function connectDB() {
    if (mongoose.connection.readyState >= 1) return;
    const uri = getMongoUri();
    if (!uri) throw new Error('MONGO_URI is not configured');
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 10000,
    });
    console.log('✅ MongoDB connected');
}

// ─── Routes ──────────────────────────────────────────────────
// Inline User model (Cloud Functions need self-contained code)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role:     { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// ─── Auth Routes ─────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

function getSecret() { return process.env.JWT_SECRET; }
function getResetSecret() { return process.env.ADMIN_RESET_SECRET; }

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(header.split(' ')[1], getSecret());
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

function adminOnly(req, res, next) {
    if (req.user?.role !== 'admin')
        return res.status(403).json({ error: 'Admin access required' });
    next();
}

// DB connectivity middleware
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('DB Error:', err.message);
        res.status(500).json({ error: 'Database connection failed', details: err.message });
    }
});

// POST /api/login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required' });
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            getSecret(),
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/users (admin only)
app.get('/users', authMiddleware, adminOnly, async (req, res) => {
    try {
        const users = await User.find({}, 'username role createdAt');
        res.json(users.map((u, i) => ({
            id: i + 1, _id: u._id, username: u.username, role: u.role, joined: u.createdAt
        })));
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/users (admin creates user)
app.post('/users', authMiddleware, adminOnly, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required' });
    try {
        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({
            username: username.toLowerCase(),
            password: hashed,
            role: role === 'admin' ? 'admin' : 'user'
        });
        res.status(201).json({ message: 'User created', id: user._id, username: user.username, role: user.role });
    } catch (err) {
        if (err.code === 11000)
            return res.status(400).json({ error: 'Username already exists' });
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/users/:id (admin only)
app.delete('/users/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user.id)
            return res.status(400).json({ error: "You can't delete yourself" });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// PATCH /api/users/:id/role (admin only)
app.patch('/users/:id/role', authMiddleware, adminOnly, async (req, res) => {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role))
        return res.status(400).json({ error: 'Invalid role' });
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
        res.json({ message: 'Role updated', username: user.username, role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin-reset
app.post('/admin-reset', async (req, res) => {
    const { resetSecret, newPassword } = req.body;
    if (!resetSecret || !newPassword)
        return res.status(400).json({ error: 'Reset secret and new password are required' });
    if (resetSecret !== getResetSecret())
        return res.status(403).json({ error: 'Invalid reset secret' });
    if (newPassword.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        const result = await User.updateMany({ role: 'admin' }, { password: hashed });
        if (result.matchedCount === 0) {
            await User.create({ username: 'admin', password: hashed, role: 'admin' });
            return res.json({ message: 'Initial admin account created (username: admin)' });
        }
        res.json({ message: `Password updated for ${result.modifiedCount} admin account(s)` });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/test-db
app.get('/test-db', async (req, res) => {
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const state  = mongoose.connection.readyState;
    res.json({
        status: states[state] || 'unknown',
        readyState: state,
        uriConfigured: !!getMongoUri(),
        dbName: state === 1 ? mongoose.connection.name : 'N/A'
    });
});

// ─── Export as Firebase Cloud Function (v2) ─────────────────
exports.api = functions.onRequest({ timeoutSeconds: 60, memory: '256MiB', region: 'us-central1' }, app);
