import { Request, Response } from 'express';
import * as deviceService from '@/services/device.service';
import { DeviceRegistrationRequest } from '@/types/device.types';
import { logger } from '@/utils/logger';

export const registerDevice = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;
  const registrationRequest: DeviceRegistrationRequest = req.body;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  // Validate request body
  const { city_id, station_id, sensor_types } = registrationRequest;
  if (!city_id || !station_id || !sensor_types || !Array.isArray(sensor_types)) {
    res.status(400).json({
      success: false,
      error: { message: 'Invalid request format' }
    });
    return;
  }

  try {
    const device = await deviceService.registerDevice(owner_id, registrationRequest);

    res.status(201).json({
      success: true,
      data: {
        device_id: device.device_id,
        sensor_meta: device.sensor_meta,
        status: device.status,
        registered_at: device.registered_at
      }
    });
  } catch (error: any) {
    if (error.message === 'DEVICE_LIMIT_REACHED') {
      res.status(403).json({
        success: false,
        error: {
          code: 'DEVICE_LIMIT_REACHED',
          message: 'Maximum device limit (3) reached'
        }
      });
      return;
    }

    if (error.message.startsWith('VALIDATION_ERROR')) {
      res.status(400).json({
        success: false,
        error: { message: error.message.replace('VALIDATION_ERROR: ', '') }
      });
      return;
    }

    logger.error('Device registration error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getDevices = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  try {
    const result = await deviceService.getUserDevices(owner_id);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get devices error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const deleteDevice = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;
  const { device_id } = req.params;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  try {
    const deleted = await deviceService.deleteDevice(owner_id, device_id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { message: 'Device not found or unauthorized' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (error) {
    logger.error('Delete device error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};