import { redisClient } from './client';
import { RedisAccessTokenData, RedisRefreshTokenData, RedisOperationResult } from '@/types/redis.types';
import { TOKEN_CONFIG } from '@/config/constants';

export interface TokenRepository {
  storeAccessToken(jti: string, data: RedisAccessTokenData): Promise<RedisOperationResult>;
  getAccessToken(jti: string, walletAddress: string): Promise<RedisOperationResult<RedisAccessTokenData | null>>;
  deleteAccessToken(jti: string, walletAddress: string): Promise<RedisOperationResult<boolean>>;

  storeRefreshToken(jti: string, data: RedisRefreshTokenData): Promise<RedisOperationResult>;
  getRefreshToken(jti: string): Promise<RedisOperationResult<RedisRefreshTokenData | null>>;
  revokeRefreshToken(jti: string, reason: string): Promise<RedisOperationResult>;

  getAllUserTokens(walletAddress: string): Promise<RedisOperationResult<string[]>>;
}

export const storeAccessToken = async (jti: string, data: RedisAccessTokenData): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.ACCESS_TOKEN}:${data.walletAddress}:${jti}`;
  return redisClient.set(key, data, TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS);
};

export const getAccessToken = async (jti: string, walletAddress: string): Promise<RedisOperationResult<RedisAccessTokenData | null>> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.ACCESS_TOKEN}:${walletAddress}:${jti}`;
  return redisClient.get(key);
};

export const deleteAccessToken = async (jti: string, walletAddress: string): Promise<RedisOperationResult<boolean>> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.ACCESS_TOKEN}:${walletAddress}:${jti}`;
  return redisClient.delete(key);
};

export const storeRefreshToken = async (jti: string, data: RedisRefreshTokenData): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.REFRESH_TOKEN}:${jti}:token`;
  return redisClient.set(key, data, TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY_SECONDS);
};

export const getRefreshToken = async (jti: string): Promise<RedisOperationResult<RedisRefreshTokenData | null>> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.REFRESH_TOKEN}:${jti}:token`;
  const result = await redisClient.get<RedisRefreshTokenData>(key);
  if (result.data?.revoked) {
    return { success: false, error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' } };
  }
  return result;
};

export const revokeRefreshToken = async (jti: string, reason: string): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.REFRESH_TOKEN}:${jti}:token`;
  const result = await redisClient.get<RedisRefreshTokenData>(key);
  if (result.success && result.data) {
    const updatedData: RedisRefreshTokenData = { ...result.data, revoked: true };
    return redisClient.set(key, updatedData);
  }
  return { success: false, error: { code: 'NOT_FOUND', message: 'Token not found' } };
};

export const getAllUserTokens = async (walletAddress: string): Promise<RedisOperationResult<string[]>> => {
  const pattern = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.ACCESS_TOKEN}:${walletAddress}:*`;
  const result = await redisClient.getKeysByPattern(pattern);
  if (result.success && result.data) {
    return { success: true, data: result.data.map(key => key.split(':')[2]) };
  }
  return { success: false, error: result.error };
};
