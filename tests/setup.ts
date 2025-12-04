import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectRedis, disconnectRedis } from '@/database/redis.connection';
import RedisMock from 'ioredis-mock';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  // Initialize MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Initialize Redis Mock for testing
  const redisMock = new RedisMock();
  await connectRedis(redisMock as any);
});

afterAll(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  await mongoServer.stop();
});
