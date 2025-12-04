import { redisClient } from './client';
import { RedisUserSession, RedisOperationResult } from '@/types/redis.types';
import { TOKEN_CONFIG } from '@/config/constants';

export interface SessionRepository {
  createOrUpdateSession(walletAddress: string, session: RedisUserSession): Promise<RedisOperationResult>;
  getSession(walletAddress: string): Promise<RedisOperationResult<RedisUserSession | null>>;
  addTokenToSession(walletAddress: string, jti: string, type: 'access' | 'refresh'): Promise<RedisOperationResult>;
  removeTokenFromSession(walletAddress: string, jti: string, type: 'access' | 'refresh'): Promise<RedisOperationResult>;
  clearUserSession(walletAddress: string): Promise<RedisOperationResult>;
}

export const createOrUpdateSession = async (walletAddress: string, session: RedisUserSession): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.USER_SESSION}:${walletAddress}:session`;
  return redisClient.set(key, session);
};

export const getSession = async (walletAddress: string): Promise<RedisOperationResult<RedisUserSession | null>> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.USER_SESSION}:${walletAddress}:session`;
  return redisClient.get(key);
};

export const addTokenToSession = async (walletAddress: string, jti: string, type: 'access' | 'refresh'): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.USER_SESSION}:${walletAddress}:session`;
  const sessionResult = await getSession(walletAddress);
  if (sessionResult.success && sessionResult.data) {
    const session = sessionResult.data;
    if (type === 'access') {
      session.active_access_tokens.push(jti);
    } else {
      session.active_refresh_tokens.push(jti);
    }
    session.last_login = Date.now();
    return createOrUpdateSession(walletAddress, session);
  }
  return { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } };
};

export const removeTokenFromSession = async (walletAddress: string, jti: string, type: 'access' | 'refresh'): Promise<RedisOperationResult> => {
    const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.USER_SESSION}:${walletAddress}:session`;
    const sessionResult = await getSession(walletAddress);
    if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data;
        if (type === 'access') {
            session.active_access_tokens = session.active_access_tokens.filter(t => t !== jti);
        } else {
            session.active_refresh_tokens = session.active_refresh_tokens.filter(t => t !== jti);
        }
        return createOrUpdateSession(walletAddress, session);
    }
    return { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } };
};

export const clearUserSession = async (walletAddress: string): Promise<RedisOperationResult> => {
  const key = `${TOKEN_CONFIG.REDIS_KEY_PREFIX.USER_SESSION}:${walletAddress}:session`;
  const result = await redisClient.delete(key);
  return { success: result.success, error: result.error };
};
