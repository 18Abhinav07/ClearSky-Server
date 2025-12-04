import mongoose from 'mongoose';
import app from './app';
import { connectDB } from '@/database/connection';
import { connectRedis, disconnectRedis } from '@/database/redis.connection';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✓ MongoDB connected');

    // Connect to Redis
    await connectRedis();
    console.log('✓ Redis connected');

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down gracefully...');
      server.close(async () => {
        await disconnectRedis();
        await mongoose.disconnect();
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();