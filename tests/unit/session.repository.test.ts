import {
  createOrUpdateSession,
  getSession,
  addTokenToSession,
  clearUserSession,
} from '@/redis/session.repository';
import { RedisUserSession } from '@/types/redis.types';
import { redisClient } from '@/redis/client';

jest.mock('@/redis/client', () => ({
  redisClient: {
    set: jest.fn().mockResolvedValue({ success: true }),
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue({ success: true }),
  },
}));

describe('Session Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create user session', async () => {
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const session: RedisUserSession = {
      walletAddress,
      active_access_tokens: [],
      active_refresh_tokens: [],
      device_count: 1,
      last_login: Date.now(),
      total_logins: 1,
    };
    
    (redisClient.get as jest.Mock).mockResolvedValue({ success: true, data: session });

    await createOrUpdateSession(walletAddress, session);
    const result = await getSession(walletAddress);

    expect(redisClient.set).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data?.walletAddress).toBe(walletAddress);
    expect(result.data?.total_logins).toBe(1);
  });

  test('should add token to session', async () => {
    const walletAddress = '0x123';
    const session: RedisUserSession = {
      walletAddress,
      active_access_tokens: [],
      active_refresh_tokens: [],
      device_count: 0,
      last_login: Date.now(),
      total_logins: 1,
    };
    (redisClient.get as jest.Mock).mockResolvedValue({ success: true, data: session });

    await addTokenToSession(walletAddress, 'jti-123', 'access');

    expect(redisClient.set).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        active_access_tokens: ['jti-123']
    }));
  });

  test('should clear user session', async () => {
    const walletAddress = '0x123';
    await clearUserSession(walletAddress);
    expect(redisClient.delete).toHaveBeenCalled();
  });
});
