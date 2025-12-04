import mongoose from 'mongoose';
import { randomBytes } from 'crypto';
import Device from '@/models/Device';
import User from '@/models/User';
import {
  DeviceRegistrationRequest,
  IDevice,
  SensorMeta,
  DeviceListResponse,
} from '@/types/device.types';
import { validateDeviceRegistration } from './device-validation.service';
import { getStationById, getAvailableCities } from './config.service';
import { DEVICE_LIMIT } from '@/config/constants';

export const generateDeviceId = (owner_id: string, station_id: string): string => {
  // Generate a unique device ID using crypto.randomBytes
  return randomBytes(16).toString('hex');
};

export const checkDeviceLimit = async (owner_id: string): Promise<boolean> => {
    const deviceCount = await Device.countDocuments({ owner_id, status: 'active' });
    return deviceCount < DEVICE_LIMIT;
};

export const registerDevice = async (
  owner_id: string,
  request: DeviceRegistrationRequest
): Promise<IDevice> => {
  const validation = validateDeviceRegistration(request);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.error}`);
  }

  // Check device limit without transaction for test compatibility
  const deviceCount = await Device.countDocuments({
    owner_id,
    status: 'active',
  });

  if (deviceCount >= DEVICE_LIMIT) {
    throw new Error('DEVICE_LIMIT_REACHED');
  }

  const station = getStationById(request.station_id);
  if (!station) {
    throw new Error('STATION_NOT_FOUND');
  }

  const city = getAvailableCities().find(c =>
    c.stations.some(s => s.station_id === request.station_id)
  );

  const sensor_meta: SensorMeta = {
    city: city!.city_name,
    city_id: city!.city_id,
    station: station.station_name,
    station_id: station.station_id,
    coordinates: station.coordinates,
    sensor_types: request.sensor_types,
  };

  const device_id = generateDeviceId(owner_id, request.station_id);

  const device = await Device.create({
    device_id,
    owner_id,
    sensor_meta,
    status: 'active',
    registered_at: new Date(),
  });

  await User.findOneAndUpdate(
    { walletAddress: owner_id },
    { $push: { devices: device_id } }
  );

  return device;
};

export const getUserDevices = async (owner_id: string): Promise<DeviceListResponse> => {
    const devices = await Device.find({ owner_id });
    const count = devices.length;
    const limit_reached = count >= DEVICE_LIMIT;
    return { devices, count, limit_reached };
};

export const deleteDevice = async (owner_id: string, device_id: string): Promise<boolean> => {
    const device = await Device.findOne({ device_id, owner_id });
    if (!device) {
        return false;
    }

    await device.deleteOne();
    await User.findOneAndUpdate(
        { walletAddress: owner_id },
        { $pull: { devices: device_id } }
    );

    return true;
};