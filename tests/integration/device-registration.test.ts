import request from 'supertest';
import app from '@/app';
import User from '@/models/User';
import Device from '@/models/Device';
import { getRedisClient } from '@/database/redis.connection';

describe('Device Registration Integration', () => {
  let accessToken: string;
  let walletAddress: string;

  beforeEach(async () => {
    await Device.deleteMany({});
    await User.deleteMany({});
    await getRedisClient().flushdb();

    walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ wallet_address: walletAddress });

    accessToken = loginRes.body.data.tokens.access_token;
  });

  describe('GET /api/v1/config/cities', () => {
    test('should return list of cities', async () => {
      const res = await request(app)
        .get('/api/v1/config/cities')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty('city_id');
      expect(res.body.data[0]).toHaveProperty('stations');
    });
  });

  describe('POST /api/v1/devices/register', () => {
    test('should register device with valid config', async () => {
      const res = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_chandni_chowk_iitm',
          sensor_types: ['CO', 'PM2.5']
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.device_id).toBeTruthy();
      expect(res.body.data.sensor_meta.sensor_types).toEqual(['CO', 'PM2.5']);
    });

    test('should reject invalid sensor types', async () => {
      const res = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_new_delhi', // Only has PM2.5
          sensor_types: ['CO', 'NO2'] // Not available at this station
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid sensor types');
    });

    test('should allow sensor degradation', async () => {
      const res = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_chandni_chowk_iitm', // Has multiple sensors
          sensor_types: ['CO'] // Only selecting one
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.sensor_meta.sensor_types).toEqual(['CO']);
    });

    test('should enforce 3-device limit', async () => {
      // Register 3 devices
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/devices/register')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            city_id: 'delhi',
            station_id: 'delhi_chandni_chowk_iitm',
            sensor_types: ['CO']
          })
          .expect(201);
      }

      // 4th should fail
      const res = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_chandni_chowk_iitm',
          sensor_types: ['PM2.5']
        })
        .expect(403);

      expect(res.body.error.code).toBe('DEVICE_LIMIT_REACHED');
    });

    test('should handle race conditions', async () => {
      // Attempt to register 5 devices concurrently
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/v1/devices/register')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            city_id: 'delhi',
            station_id: 'delhi_chandni_chowk_iitm',
            sensor_types: ['CO']
          })
      );

      const responses = await Promise.all(requests);

      // Count successes
      const successes = responses.filter(r => r.status === 201);
      expect(successes.length).toBe(3);

      // Count failures
      const failures = responses.filter(r => r.status === 403);
      expect(failures.length).toBe(2);
    }, 10000); // Increased timeout for race condition test
  });

  describe('GET /api/v1/devices', () => {
    test('should return user devices', async () => {
      // Register 2 devices
      await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_chandni_chowk_iitm',
          sensor_types: ['CO']
        });

      await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_new_delhi',
          sensor_types: ['PM2.5']
        });

      // Get devices
      const res = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.devices.length).toBe(2);
      expect(res.body.data.count).toBe(2);
      expect(res.body.data.limit_reached).toBe(false);
    });
  });

  describe('DELETE /api/v1/devices/:device_id', () => {
    test('should delete device', async () => {
      // Register device
      const registerRes = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          city_id: 'delhi',
          station_id: 'delhi_chandni_chowk_iitm',
          sensor_types: ['CO']
        });

      const device_id = registerRes.body.data.device_id;

      // Delete device
      await request(app)
        .delete(`/api/v1/devices/${device_id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify deleted
      const devices = await Device.find({ owner_id: walletAddress });
      expect(devices.length).toBe(0);
    });

    test('should not delete other user\'s device', async () => {
      // Create another user's device
      await Device.create({
        device_id: 'other_device',
        owner_id: '0xother00000000000000000000000000000000000',
        sensor_meta: { city: 'other', city_id: 'other', station: 'other', station_id: 'other', coordinates: { latitude: 0, longitude: 0 }, sensor_types: ['other'] },
        status: 'active'
      });

      // Try to delete
      await request(app)
        .delete('/api/v1/devices/other_device')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
