import mongoose from 'mongoose';
import app from './app';
import { connectDB } from '@/database/connection';
import { connectRedis, disconnectRedis } from '@/database/redis.connection';
import { startBatchProcessor } from '@/jobs/batch-processor.job';
import { startVerificationJob } from '@/jobs/verifier.job';
import { initializePinata } from '@/services/ipfs.service';
import dotenv from 'dotenv';
import { logger } from '@/utils/logger';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('✓ MongoDB connected');

    // Connect to Redis
    await connectRedis();
    // Initialize Pinata for IPFS
    if (process.env.PINATA_JWT) {
      initializePinata();
      logger.info('✓ Pinata IPFS client initialized');
    } else {
      logger.warn('⚠ PINATA_JWT not configured - verification will fail');
    }

    // Start batch processor cron job
    startBatchProcessor();
    logger.info('✓ Batch processor cron job started');

    // Start verification cron job
    startVerificationJob();
    logger.info('✓ Verification cron job started');

    // Start Express serverocessor cron job started');

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info(`✓ Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\nShutting down gracefully...');
      server.close(async () => {
        await disconnectRedis();
        await mongoose.disconnect();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();