import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls?: boolean;
  maxRetriesPerRequest: number;
  retryStrategy?: (times: number) => number | void;
}

const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  tls: process.env.REDIS_TLS_ENABLED === 'true',
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
    console.log('Redis connected');
  });

  client.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  client.on('close', () => {
    console.log('Redis connection closed');
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
