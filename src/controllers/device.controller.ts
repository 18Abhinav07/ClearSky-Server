import { Request, Response } from 'express';
import { registerDevice } from '@/services/device.service';
import Device from '@/models/Device';
import { logger } from '@/utils/logger';

export const createDevice = async (req: Request, res: Response) => {
  const { deviceId, location, sensor } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ success: false, error: { message: 'Not authorized' } });
  }

  if (!deviceId || !location || !sensor) {
    return res.status(400).json({ success: false, error: { message: 'Missing required fields' } });
  }

  if (!/^[a-fA-F0-9]{64}$/.test(deviceId)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid deviceId format' } });
  }

  try {
    const device = await registerDevice(user.walletAddress, deviceId, location, sensor);
    res.status(201).json({ success: true, device });
  } catch (error: any) {
    if (error.message === 'DEVICE_LIMIT_REACHED') {
      return res.status(403).json({ success: false, error: { code: 'DEVICE_LIMIT_REACHED', message: 'Maximum device limit reached' } });
    }
    logger.error('Create device error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error' } });
  }
};

export const getDevices = async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ success: false, error: { message: 'Not authorized' } });
  }

  try {
    const devices = await Device.find({ owner: user.walletAddress });
    res.json({ success: true, devices });
  } catch (error) {
    logger.error('Get devices error:', error);
    res.status(500).json({ success: false, error: { message: 'Server error' } });
  }
};
