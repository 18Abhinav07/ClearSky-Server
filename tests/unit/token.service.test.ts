import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  generateTokenPair,
} from '@/services/token.service';
import { AccessTokenPayload, RefreshTokenPayload } from '@/types/token.types';
import { redisClient } from '@/redis/client';
import * as tokenRepository from '@/redis/token.repository';

jest.mock('@/redis/client', () => ({
  redisClient: {
    exists: jest.fn().mockResolvedValue({ success: true, data: false }),
  },
}));

jest.mock('@/redis/token.repository', () => ({
  getRefreshToken: jest.fn().mockResolvedValue({ success: true, data: { revoked: false } }),
}));

describe('Token Service', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';

  test('should generate valid access token', async () => {
    const token = await generateAccessToken(walletAddress);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const decoded = jwt.decode(token) as AccessTokenPayload;
    expect(decoded.walletAddress).toBe(walletAddress);
    expect(decoded.token_type).toBe('access');
    expect(decoded.jti).toBeTruthy();
  });

  test('should generate valid refresh token', async () => {
    const token = await generateRefreshToken(walletAddress);
    expect(token).toBeTruthy();
    const decoded = jwt.decode(token) as RefreshTokenPayload;
    expect(decoded.walletAddress).toBe(walletAddress);
    expect(decoded.token_type).toBe('refresh');
    expect(decoded.token_family).toBeTruthy();
  });

  test('should verify valid access token', async () => {
    const token = await generateAccessToken(walletAddress);
    const result = await verifyAccessToken(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.walletAddress).toBe(walletAddress);
  });

  test('should reject expired token', async () => {
    const expiredToken = jwt.sign(
      { walletAddress: '0x123', exp: Math.floor(Date.now() / 1000) - 100 },
      process.env.JWT_SECRET!
    );

    const result = await verifyAccessToken(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('jwt expired');
  });

  test('should generate token pair with different tokens', async () => {
    const pair = await generateTokenPair(walletAddress);
    expect(pair.access_token).toBeTruthy();
    expect(pair.refresh_token).toBeTruthy();
    expect(pair.access_token).not.toBe(pair.refresh_token);
  });
});
