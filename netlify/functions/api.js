// netlify/functions/api.js
// Express API using Firebase Admin SDK (Auth + Firestore)

const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const serverless = require('serverless-http');
const admin      = require('firebase-admin');

// ─── Firebase Admin Init (cached) ────────────────────────────
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}
const db   = admin.firestore();
const auth = admin.auth();

// ─── Express App ─────────────────────────────────────────────
const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Auth Middleware ──────────────────────────────────────────
async function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
        return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = await auth.verifyIdToken(header.split('Bearer ')[1]);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function adminOnly(req, res, next) {
    if (!req.user?.admin)
        return res.status(403).json({ error: 'Admin access required' });
    next();
}

// ─── POST /api/login ─────────────────────────────────────────
// Client signs in via Firebase Auth SDK, then calls this to get role/profile
app.post('/login', verifyToken, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (!userDoc.exists)
            return res.status(404).json({ error: 'User profile not found' });
        const data = userDoc.data();
        res.json({ user: { id: req.user.uid, username: data.username, role: data.role } });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// ─── GET /api/users (admin only) ─────────────────────────────
app.get('/users', verifyToken, adminOnly, async (req, res) => {
    try {
        const snapshot = await db.collection('users').orderBy('createdAt', 'asc').get();
        const users = snapshot.docs.map((doc, i) => ({
            id: i + 1,
            _id: doc.id,
            username: doc.data().username,
            role: doc.data().role,
            joined: doc.data().createdAt?.toDate?.() || null
        }));
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// ─── POST /api/users (admin creates user) ────────────────────
app.post('/users', verifyToken, adminOnly, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required' });

    const email   = `${username.toLowerCase()}@brainskooltools.app`;
    const isAdmin = role === 'admin';

    try {
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: username.toLowerCase(),
        });
        await auth.setCustomUserClaims(userRecord.uid, { admin: isAdmin });
        await db.collection('users').doc(userRecord.uid).set({
            username: username.toLowerCase(),
            role: isAdmin ? 'admin' : 'user',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(201).json({
            message: 'User created',
            id: userRecord.uid,
            username: username.toLowerCase(),
            role: isAdmin ? 'admin' : 'user'
        });
    } catch (err) {
        if (err.code === 'auth/email-already-exists')
            return res.status(400).json({ error: 'Username already exists' });
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// ─── DELETE /api/users/:id (admin only) ──────────────────────
app.delete('/users/:id', verifyToken, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user.uid)
            return res.status(400).json({ error: "You can't delete yourself" });
        await auth.deleteUser(req.params.id);
        await db.collection('users').doc(req.params.id).delete();
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// ─── PATCH /api/users/:id/role (admin only) ──────────────────
app.patch('/users/:id/role', verifyToken, adminOnly, async (req, res) => {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role))
        return res.status(400).json({ error: 'Invalid role' });
    try {
        await auth.setCustomUserClaims(req.params.id, { admin: role === 'admin' });
        await db.collection('users').doc(req.params.id).update({ role });
        const userDoc = await db.collection('users').doc(req.params.id).get();
        res.json({ message: 'Role updated', username: userDoc.data().username, role });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// ─── POST /api/admin-reset ────────────────────────────────────
app.post('/admin-reset', async (req, res) => {
    const { resetSecret, newPassword } = req.body;
    if (!resetSecret || !newPassword)
        return res.status(400).json({ error: 'Reset secret and new password are required' });
    if (resetSecret !== process.env.ADMIN_RESET_SECRET)
        return res.status(403).json({ error: 'Invalid reset secret' });
    if (newPassword.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });

    try {
        const snapshot = await db.collection('users').where('role', '==', 'admin').get();

        if (snapshot.empty) {
            // Create initial admin
            const email = 'admin@brainskooltools.app';
            const userRecord = await auth.createUser({ email, password: newPassword, displayName: 'admin' });
            await auth.setCustomUserClaims(userRecord.uid, { admin: true });
            await db.collection('users').doc(userRecord.uid).set({
                username: 'admin', role: 'admin',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.json({ message: 'Initial admin account created (username: admin)' });
        }

        await Promise.all(snapshot.docs.map(doc => auth.updateUser(doc.id, { password: newPassword })));
        res.json({ message: `Password updated for ${snapshot.size} admin account(s)` });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// ─── GET /api/test-db ────────────────────────────────────────
app.get('/test-db', async (req, res) => {
    try {
        await db.collection('_health').limit(1).get();
        res.json({ status: 'connected', database: 'Firestore', project: 'brainskool-tools-app' });
    } catch (err) {
        res.status(500).json({ status: 'error', details: err.message });
    }
});

// ─── Serverless Handler ───────────────────────────────────────
const handler = serverless(app);

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.isBase64Encoded && event.body) {
        event.body = Buffer.from(event.body, 'base64').toString('utf8');
        event.isBase64Encoded = false;
    }
    if (event.body && !event.headers['content-type'] && !event.headers['Content-Type']) {
        event.headers['content-type'] = 'application/json';
    }

    try {
        return await handler(event, context);
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: err.message }),
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        };
    }
};
