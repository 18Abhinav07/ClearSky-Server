import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler } from '@/middleware/errorHandler';
import authRoutes from '@/routes/auth.routes';
import deviceRoutes from '@/routes/device.routes';

dotenv.config();

const app = express();

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
  
    // ToDo : Check the connection to the database
    database: 'not_checked', // In a real app, you would check the DB connection
    timestamp: new Date().toISOString(),
  });
});

// Error Handler
app.use(errorHandler);

export default app;
