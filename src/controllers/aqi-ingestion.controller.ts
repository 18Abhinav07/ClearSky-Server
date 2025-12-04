import { Request, Response } from 'express';
import {
  ingestReading,
  getDeviceReadings,
  getReadingsByStatus,
  getReadingById
} from '@/services/aqi-ingestion.service';
import { DataIngestionRequest } from '@/types/aqi-reading.types';
import { logger } from '@/utils/logger';

export const ingestData = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;
  const ingestionRequest: DataIngestionRequest = req.body;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  // Validate request body
  const { device_id, sensor_data, timestamp } = ingestionRequest;
  if (!device_id || !sensor_data || !timestamp) {
    res.status(400).json({
      success: false,
      error: { message: 'Missing required fields: device_id, sensor_data, timestamp' }
    });
    return;
  }

  try {
    const reading = await ingestReading(owner_id, ingestionRequest);

    res.status(201).json({
      success: true,
      data: {
        reading_id: reading.reading_id,
        device_id: reading.device_id,
        status: reading.status,
        batch_window: reading.batch_window,
        ingestion_count: reading.meta.ingestion_count,
        message: reading.meta.ingestion_count === 1
          ? 'New batch created'
          : `Data appended (${reading.meta.ingestion_count} ingestions)`
      }
    });
  } catch (error: any) {
    if (error.message.startsWith('VALIDATION_ERROR')) {
      res.status(400).json({
        success: false,
        error: { message: error.message.replace('VALIDATION_ERROR: ', '') }
      });
      return;
    }

    if (error.message === 'DEVICE_NOT_FOUND' || error.message === 'UNAUTHORIZED_DEVICE') {
      res.status(404).json({
        success: false,
        error: { message: error.message }
      });
      return;
    }

    logger.error('Data ingestion error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getDeviceReadingsController = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;
  const { device_id } = req.params;
  const { status, limit } = req.query;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  try {
    const options: any = {};
    if (status) options.status = status as string;
    if (limit) options.limit = Number(limit);

    const readings = await getDeviceReadings(owner_id, device_id, options);

    res.status(200).json({
      success: true,
      data: {
        readings,
        count: readings.length
      }
    });
  } catch (error) {
    logger.error('Get readings error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getReadingsByStatusController = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;
  const { status } = req.params;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  try {
    const readings = await getReadingsByStatus(owner_id, status);

    res.status(200).json({
      success: true,
      data: {
        readings,
        count: readings.length,
        status
      }
    });
  } catch (error) {
    logger.error('Get readings by status error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getReadingByIdController = async (req: Request, res: Response): Promise<void> => {
  const owner_id = req.user?.walletAddress;
  const { reading_id } = req.params;

  if (!owner_id) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized' }
    });
    return;
  }

  try {
    const reading = await getReadingById(owner_id, reading_id);

    if (!reading) {
      res.status(404).json({
        success: false,
        error: { message: 'Reading not found' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: reading
    });
  } catch (error) {
    logger.error('Get reading by ID error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};
