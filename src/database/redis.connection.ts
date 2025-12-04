import Redis, { RedisOptions } from 'ioredis';
import dotenv from 'dotenv';
import { logger } from '@/utils/logger';

dotenv.config();

export interface RedisConfig extends RedisOptions {}

const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

let client: Redis;

export const connectRedis = async (config: RedisConfig = defaultConfig): Promise<Redis> => {
  if (client) {
    return client;
  }

  client = new Redis(config);

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('error', (err) => {
    logger.error('Redis connection error:', err);
  });

  client.on('close', () => {
    logger.info('Redis connection closed');
  });

  return client;
};

export const getRedisClient = (): Redis => {
  if (!client) {
    throw new Error('Redis client not initialized. Please call connectRedis() first.');
  }
  return client;
};

export const disconnectRedis = async (): Promise<void> => {
  if (client) {
    await client.quit();
  }
};
