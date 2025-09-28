const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3030'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statické soubory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Test route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/import', require('./routes/import'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/work-records', require('./routes/workRecords'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/services', require('./routes/services'));
app.use('/api/hardware', require('./routes/hardware'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Backend server běží na portu ${PORT}`);
});
