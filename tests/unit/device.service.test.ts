import {
  generateDeviceId,
  checkDeviceLimit,
  registerDevice,
} from '@/services/device.service';
import { DeviceRegistrationRequest } from '@/types/device.types';
import Device from '@/models/Device';
import User from '@/models/User';

describe('Device Service', () => {
  afterEach(async () => {
    await Device.deleteMany({});
    await User.deleteMany({});
  });

  test('should generate unique device IDs', () => {
    const id1 = generateDeviceId('0x123', 'station1');
    const id2 = generateDeviceId('0x123', 'station1');
    expect(id1).not.toBe(id2);
  });

  test('should check device limit', async () => {
    const owner_id = '0x1234567890abcdef1234567890abcdef12345678';

    await User.create({
      walletAddress: owner_id,
      devices: ['device1', 'device2'],
    });

    await Device.create([
      { device_id: 'device1', owner_id, sensor_meta: { city: 'test', city_id: 'test', station: 'test', station_id: 'test', coordinates: { latitude: 0, longitude: 0 }, sensor_types: ['test'] }, status: 'active' },
      { device_id: 'device2', owner_id, sensor_meta: { city: 'test', city_id: 'test', station: 'test', station_id: 'test', coordinates: { latitude: 0, longitude: 0 }, sensor_types: ['test'] }, status: 'active' },
    ]);

    const canAdd = await checkDeviceLimit(owner_id);
    expect(canAdd).toBe(true);
  });

  test('should register device successfully', async () => {
    const owner_id = '0x1234567890abcdef1234567890abcdef12345678';
    await User.create({ walletAddress: owner_id, devices: [] });

    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_chandni_chowk_iitm',
      sensor_types: ['CO', 'PM2.5'],
    };

    const device = await registerDevice(owner_id, request);

    expect(device.device_id).toBeTruthy();
    expect(device.owner_id).toBe(owner_id);
    expect(device.sensor_meta.sensor_types).toEqual(['CO', 'PM2.5']);
  });

  test('should enforce 3-device limit', async () => {
    const owner_id = '0x1234567890abcdef1234567890abcdef12345678';
    await User.create({ walletAddress: owner_id, devices: [] });

    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_chandni_chowk_iitm',
      sensor_types: ['CO'],
    };

    // Register 3 devices
    await registerDevice(owner_id, request);
    await registerDevice(owner_id, request);
    await registerDevice(owner_id, request);

    // 4th should fail
    await expect(registerDevice(owner_id, request)).rejects.toThrow(
      'DEVICE_LIMIT_REACHED'
    );
  });
});
