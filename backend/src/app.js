const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('./telemetry').start();

const app = express();
const PORT = process.env.PORT || 3029;

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3030,http://127.0.0.1:3030')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/received-invoices', require('./routes/receivedInvoices'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/accounting', require('./routes/accounting'));
app.use('/api/system', require('./routes/system'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/metrics', require('./routes/metrics'));
app.use('/api/users', require('./routes/users'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend server běží na portu ${PORT}`);
  });
}

module.exports = app;
