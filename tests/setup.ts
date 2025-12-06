import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectRedis, disconnectRedis } from '@/database/redis.connection';
import RedisMock from 'ioredis-mock';

// Mock uuid to avoid ESM import issues in Jest
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234-5678-90ab-cdef'),
}));

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
