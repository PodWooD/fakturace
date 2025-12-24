import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { start as startTelemetry } from './telemetry';

dotenv.config();
startTelemetry();

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

// Import routes
import authRoutes from './routes/auth';
import importRoutes from './routes/import';
import organizationsRoutes from './routes/organizations';
import workRecordsRoutes from './routes/workRecords';
import invoicesRoutes from './routes/invoices';
import servicesRoutes from './routes/services';
import hardwareRoutes from './routes/hardware';
import receivedInvoicesRoutes from './routes/receivedInvoices';
import billingRoutes from './routes/billing';
import accountingRoutes from './routes/accounting';
import systemRoutes from './routes/system';
import auditRoutes from './routes/audit';
import notificationsRoutes from './routes/notifications';
import metricsRoutes from './routes/metrics';
import usersRoutes from './routes/users';

// Test route
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/import', importRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/work-records', workRecordsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/received-invoices', receivedInvoicesRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/metrics', metricsRoutes);
app.use('/api/users', usersRoutes);

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Backend server běží na portu ${PORT}`);
    });
}

export default app;
