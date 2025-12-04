import User from '@/models/User';
import {
  findUserByWalletId,
  createUser,
  findOrCreateUser,
} from '@/database/user.repository';

describe('User Repository', () => {
  afterEach(async () => {
    await User.deleteMany({});
  });

  test('findUserByWalletId should return null if user does not exist', async () => {
    const result = await findUserByWalletId('0x0000000000000000000000000000000000000000');
    expect(result).toBeNull();
  });

  test('findUserByWalletId should return user if exists', async () => {
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    await User.create({ walletAddress, devices: [] });

    const result = await findUserByWalletId(walletAddress);
    expect(result).not.toBeNull();
    expect(result?.walletAddress).toBe(walletAddress);
  });

  test('createUser should create new user with empty devices', async () => {
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';

    const user = await createUser(walletAddress);
    expect(user.walletAddress).toBe(walletAddress);
    expect(user.devices).toEqual([]);
  });

  test('findOrCreateUser should create user if not exists', async () => {
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';

    const user = await findOrCreateUser(walletAddress);
    expect(user.walletAddress).toBe(walletAddress);
    expect(user.devices).toEqual([]);
  });

  test('findOrCreateUser should return existing user', async () => {
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const devices = ['device_1'];
    await User.create({ walletAddress, devices });

    const user = await findOrCreateUser(walletAddress);
    expect(user.walletAddress).toBe(walletAddress);
    expect(user.devices).toEqual(devices);
  });
});
