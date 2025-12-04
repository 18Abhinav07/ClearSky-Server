import { redisClient } from './client';
import { RedisBlacklistedToken, RedisOperationResult } from '@/types/redis.types';
import { TOKEN_CONFIG } from '@/config/constants';

export interface BlacklistRepository {
  addToBlacklist(jti: string, data: RedisBlacklistedToken): Promise<RedisOperationResult>;
  isBlacklisted(jti: string): Promise<RedisOperationResult<boolean>>;
  removeFromBlacklist(jti: string): Promise<RedisOperationResult>;
}

export const addToBlacklist = async (jti: string, data: RedisBlacklistedToken): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.BLACKLIST}:${jti}:revoked`;
  const ttl = Math.floor((data.revoked_at - Date.now()) / 1000);
  return redisClient.set(key, data, ttl > 0 ? ttl : 1);
};

export const isBlacklisted = async (jti: string): Promise<RedisOperationResult<boolean>> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.BLACKLIST}:${jti}:revoked`;
  return redisClient.exists(key);
};

export const removeFromBlacklist = async (jti: string): Promise<RedisOperationResult> => {
    const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.BLACKLIST}:${jti}:revoked`;
    const result = await redisClient.delete(key);
    return { success: result.success, error: result.error };
};
