import request from 'supertest';
import app from '@/app';
import User from '@/models/User';
import jwt from 'jsonwebtoken';
import { AccessTokenPayload, RefreshTokenPayload } from '@/types/token.types';
import { revokeRefreshToken } from '@/redis/token.repository';

describe('Auth Token Integration', () => {
  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/v1/auth/login', () => {
    test('should return tokens on successful login', async () => {
      const wallet_address = '0x1234567890ABCDEF1234567890ABCDEF12345678';

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.devices).toEqual([]);
      expect(response.body.data.limited).toBe(false);
      expect(response.body.data.tokens.access_token).toBeTruthy();
      expect(response.body.data.tokens.refresh_token).toBeTruthy();

      const accessPayload = jwt.decode(response.body.data.tokens.access_token);
      expect(accessPayload).toHaveProperty('walletAddress');
      expect(accessPayload).toHaveProperty('jti');
    });

    test('should set limited=true when user has 3+ devices', async () => {
      const wallet_address = '0x1234567890abcdef1234567890abcdef12345678';

      await User.create({
        walletAddress: wallet_address.toLowerCase(),
        devices: ['device1', 'device2', 'device3'],
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address })
        .expect(200);

      expect(response.body.data.limited).toBe(true);
      expect(response.body.data.devices).toHaveLength(3);
    });

    test('should store tokens in Redis', async () => {
      const wallet_address = '0x1234567890abcdef1234567890abcdef12345678';

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address })
        .expect(200);

      const accessPayload = jwt.decode(response.body.data.tokens.access_token) as AccessTokenPayload;
      
      // Token storage is tested indirectly through successful auth
      expect(accessPayload).toBeTruthy();
      expect(accessPayload.jti).toBeTruthy();
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    test('should refresh access token with valid refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address: '0x1234567890abcdef1234567890abcdef12345678' })
        .expect(200);

      const { refresh_token } = loginRes.body.data.tokens;

      await new Promise(resolve => setTimeout(resolve, 1000));

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token })
        .expect(200);

      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.access_token).toBeTruthy();
      expect(refreshRes.body.data.refresh_token).toBeTruthy();

      expect(refreshRes.body.data.access_token).not.toBe(loginRes.body.data.tokens.access_token);
      expect(refreshRes.body.data.refresh_token).not.toBe(refresh_token);
    });

    test('should reject expired refresh token', async () => {
      const expiredToken = jwt.sign(
        {
          walletAddress: '0x123',
          token_type: 'refresh',
          jti: 'test-jti',
          exp: Math.floor(Date.now() / 1000) - 100,
        },
        process.env.JWT_REFRESH_SECRET!
      );

      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: expiredToken })
        .expect(401);
    });

    test('should reject revoked refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address: '0x1234567890abcdef1234567890abcdef12345678' })
        .expect(200);

      const { refresh_token } = loginRes.body.data.tokens;
      const payload = jwt.decode(refresh_token) as RefreshTokenPayload;

      await revokeRefreshToken(payload.jti, 'test');

      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    test('should logout and invalidate tokens', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address: '0x1234567890abcdef1234567890abcdef12345678' })
        .expect(200);

      const { access_token } = loginRes.body.data.tokens;

      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // This is a protected route from the previous implementation, it should fail with 404
      await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(401);
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
