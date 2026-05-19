require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const connectDB  = require('./db');
const authRoutes = require('./routes/auth');

// Connect to MongoDB
connectDB();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', authRoutes);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Catch-all – serve index.html for any unmatched route
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
