import request from 'supertest';
import app from '@/app';
import User from '@/models/User';

describe('POST /api/v1/auth/login', () => {
  afterEach(async () => {
    await User.deleteMany({});
  });

  test('should create new user if wallet address does not exist', async () => {
    const wallet_address = '0x1234567890abcdef1234567890abcdef12345678';

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ wallet_address })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.walletAddress).toBe(wallet_address.toLowerCase());
    expect(response.body.data.devices).toEqual([]);

    const user = await User.findOne({ walletAddress: wallet_address.toLowerCase() });
    expect(user).not.toBeNull();
  });

  test('should return existing user if wallet address already exists', async () => {
    const wallet_address = '0x1234567890abcdef1234567890abcdef12345678';
    const devices = ['device_1', 'device_2'];

    await User.create({
      walletAddress: wallet_address.toLowerCase(),
      devices,
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ wallet_address })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.walletAddress).toBe(wallet_address.toLowerCase());
    expect(response.body.data.devices).toEqual(devices);
  });

  test('should return 400 if wallet_address is missing', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toBe('wallet_address is required');
  });

  test('should handle concurrent requests (race condition)', async () => {
    const wallet_address = '0x1234567890abcdef1234567890abcdef12345678';

    const requests = Array(5).fill(null).map(() =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ wallet_address })
    );

    const responses = await Promise.all(requests);

    responses.forEach(res => {
      expect(res.status).toBe(200);
      expect(res.body.data.walletAddress).toBe(wallet_address.toLowerCase());
    });

    const userCount = await User.countDocuments({ walletAddress: wallet_address.toLowerCase() });
    expect(userCount).toBe(1);
  });

  test('should convert wallet address to lowercase', async () => {
    const wallet_address = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ wallet_address })
      .expect(200);

    expect(response.body.data.walletAddress).toBe(wallet_address.toLowerCase());
  });
});
