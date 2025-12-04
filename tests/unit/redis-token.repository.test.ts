import {
  storeAccessToken,
  getAccessToken,
  deleteAccessToken,
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
} from '@/redis/token.repository';
import { RedisAccessTokenData, RedisRefreshTokenData } from '@/types/redis.types';
import { redisClient } from '@/redis/client';

jest.mock('@/redis/client', () => ({
  redisClient: {
    set: jest.fn().mockResolvedValue({ success: true }),
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue({ success: true, data: true }),
  },
}));

describe('Redis Token Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should store and retrieve access token', async () => {
    const jti = 'test-jti-123';
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const data: RedisAccessTokenData = {
      walletAddress,
      jti,
      issued_at: Date.now(),
      expires_at: Date.now() + 900000,
      device_count: 2,
    };

    (redisClient.get as jest.Mock).mockResolvedValue({ success: true, data });

    await storeAccessToken(jti, data);
    const result = await getAccessToken(jti, walletAddress);

    expect(redisClient.set).toHaveBeenCalled();
    expect(redisClient.get).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data?.jti).toBe(jti);
  });

  test('should store refresh token with TTL', async () => {
    const jti = 'refresh-jti-456';
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const data: RedisRefreshTokenData = {
      walletAddress,
      jti,
      token_family: 'family-123',
      issued_at: Date.now(),
      expires_at: Date.now() + 604800000,
      revoked: false,
    };
    (redisClient.get as jest.Mock).mockResolvedValue({ success: true, data });

    await storeRefreshToken(jti, data);
    const result = await getRefreshToken(jti);

    expect(redisClient.set).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data?.revoked).toBe(false);
  });

  test('should revoke refresh token', async () => {
    const jti = 'refresh-jti-789';
    const data: RedisRefreshTokenData = {
      walletAddress: '0x123',
      jti,
      token_family: 'family-456',
      issued_at: Date.now(),
      expires_at: Date.now() + 604800000,
      revoked: false,
    };
    (redisClient.get as jest.Mock).mockResolvedValue({ success: true, data });

    await revokeRefreshToken(jti, 'logout');

    expect(redisClient.set).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ revoked: true }));
  });

  test('should delete access token', async () => {
    const jti = 'test-jti-delete';
    const walletAddress = '0x123';

    await deleteAccessToken(jti, walletAddress);

    expect(redisClient.delete).toHaveBeenCalled();
  });
});
