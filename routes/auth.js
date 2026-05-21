const express = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET;

/* ─── Middleware: verify JWT ─────────────────────────────────────── */
function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(header.split(' ')[1], SECRET_KEY);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

/* ─── Middleware: verify Admin ───────────────────────────────────── */
function adminOnly(req, res, next) {
    if (req.user?.role !== 'admin')
        return res.status(403).json({ error: 'Admin access required' });
    next();
}

/* ─── POST /api/login ────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
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
            SECRET_KEY,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── GET /api/users  (admin only) ──────────────────────────────── */
router.get('/users', auth, adminOnly, async (req, res) => {
    try {
        const users = await User.find({}, 'username role createdAt');
        res.json(users.map((u, i) => ({
            id: i + 1,
            _id: u._id,
            username: u.username,
            role: u.role,
            joined: u.createdAt
        })));
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── POST /api/users  (admin creates a user) ───────────────────── */
router.post('/users', auth, adminOnly, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            username: username.toLowerCase(),
            password: hashedPassword,
            role: role === 'admin' ? 'admin' : 'user'
        });
        res.status(201).json({ message: 'User created', id: user._id, username: user.username, role: user.role });
    } catch (err) {
        if (err.code === 11000)
            return res.status(400).json({ error: 'Username already exists' });
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── DELETE /api/users/:id  (admin only) ───────────────────────── */
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user.id)
            return res.status(400).json({ error: "You can't delete yourself" });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── PATCH /api/users/:id/role  (admin only) ───────────────────── */
router.patch('/users/:id/role', auth, adminOnly, async (req, res) => {
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

/* ─── POST /api/admin-reset  (reset secret required) ────────────── */
router.post('/admin-reset', async (req, res) => {
    const { resetSecret, newPassword } = req.body;

    if (!resetSecret || !newPassword) {
        return res.status(400).json({ error: 'Reset secret and new password are required' });
    }

    if (resetSecret !== process.env.ADMIN_RESET_SECRET) {
        return res.status(403).json({ error: 'Invalid reset secret' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        const result = await User.updateMany({ role: 'admin' }, { password: hashed });
        
        // If no admin exists in the database, create the initial one
        if (result.matchedCount === 0) {
            await User.create({
                username: 'admin',
                password: hashed,
                role: 'admin'
            });
            return res.json({ message: 'Initial admin account created (username: admin)' });
        }

        res.json({ message: `Password updated for ${result.modifiedCount} admin account(s)` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
