import { Redis } from 'ioredis';
import { getRedisClient } from '@/database/redis.connection';
import { RedisOperationResult, RedisError } from '@/types/redis.types';

export class RedisClient {
  private static instance: RedisClient;
  private client: Redis | null = null;

  private constructor() {
    // Lazy initialization - client will be set on first use
  }

  private getClient(): Redis {
    if (!this.client) {
      this.client = getRedisClient();
    }
    return this.client;
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<RedisOperationResult<void>> {
    try {
      const client = this.getClient();
      const stringValue = JSON.stringify(value);
      if (ttl) {
        await client.set(key, stringValue, 'EX', ttl);
      } else {
        await client.set(key, stringValue);
      }
      return { success: true };
    } catch (e: any) {
      const error: RedisError = { code: 'SET_FAILED', message: e.message };
      return { success: false, error };
    }
  }

  async get<T>(key: string): Promise<RedisOperationResult<T | null>> {
    try {
      const client = this.getClient();
      const value = await client.get(key);
      if (value === null) {
        return { success: true, data: null };
      }
      const parsedValue = JSON.parse(value) as T;
      return { success: true, data: parsedValue };
    } catch (e: any) {
      const error: RedisError = { code: 'GET_FAILED', message: e.message };
      return { success: false, error };
    }
  }

  async delete(key: string): Promise<RedisOperationResult<boolean>> {
    try {
      const client = this.getClient();
      const result = await client.del(key);
      return { success: true, data: result > 0 };
    } catch (e: any) {
      const error: RedisError = { code: 'DELETE_FAILED', message: e.message };
      return { success: false, error };
    }
  }

  async exists(key: string): Promise<RedisOperationResult<boolean>> {
    try {
      const client = this.getClient();
      const result = await client.exists(key);
      return { success: true, data: result > 0 };
    } catch (e: any) {
      const error: RedisError = { code: 'EXISTS_FAILED', message: e.message };
      return { success: false, error };
    }
  }

  async setWithExpiry<T>(key: string, value: T, ttl: number): Promise<RedisOperationResult<void>> {
    return this.set(key, value, ttl);
  }

  async getMultiple<T>(keys: string[]): Promise<RedisOperationResult<(T | null)[]>> {
    try {
      const client = this.getClient();
      const values = await client.mget(keys);
      const parsedValues = values.map(v => v ? JSON.parse(v) as T : null);
      return { success: true, data: parsedValues };
    } catch (e: any) {
      const error: RedisError = { code: 'MGET_FAILED', message: e.message };
      return { success: false, error };
    }
  }

  async deletePattern(pattern: string): Promise<RedisOperationResult<number>> {
    try {
      const client = this.getClient();
      const stream = client.scanStream({ match: pattern });
      let keys: string[] = [];
      stream.on('data', (resultKeys) => {
        keys = keys.concat(resultKeys);
      });
      
      return new Promise((resolve) => {
        stream.on('end', async () => {
          if (keys.length > 0) {
            const count = await client.del(keys);
            resolve({ success: true, data: count });
          } else {
            resolve({ success: true, data: 0 });
          }
        });
        stream.on('error', (e) => {
          const error: RedisError = { code: 'SCAN_DELETE_FAILED', message: e.message };
          resolve({ success: false, error });
        });
      });
    } catch (e: any) {
      const error: RedisError = { code: 'DELETE_PATTERN_FAILED', message: e.message };
      return { success: false, error };
    }
  }

  async getKeysByPattern(pattern: string): Promise<RedisOperationResult<string[]>> {
    try {
      const client = this.getClient();
      const stream = client.scanStream({ match: pattern });
      let keys: string[] = [];
      stream.on('data', (resultKeys) => {
        keys = keys.concat(resultKeys);
      });
      
      return new Promise((resolve) => {
        stream.on('end', async () => {
          resolve({ success: true, data: keys });
        });
        stream.on('error', (e) => {
          const error: RedisError = { code: 'SCAN_FAILED', message: e.message };
          resolve({ success: false, error });
        });
      });
    } catch (e: any) {
      const error: RedisError = { code: 'GET_KEYS_BY_PATTERN_FAILED', message: e.message };
      return { success: false, error };
    }
  }
}

export const redisClient = RedisClient.getInstance();
