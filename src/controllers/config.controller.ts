import { Request, Response } from 'express';
import { getAvailableCities, getStationsByCity, getStationById } from '@/services/config.service';
import { logger } from '@/utils/logger';

/**
 * Get all device configuration presets (cities, stations, sensors) in one response
 * This is the recommended endpoint for frontend to get complete configuration
 */
export const getPresets = async (req: Request, res: Response): Promise<void> => {
  try {
    const cities = getAvailableCities();
    res.status(200).json({ cities });
  } catch (error) {
    logger.error('Get presets error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getCities = async (req: Request, res: Response): Promise<void> => {
  try {
    const cities = getAvailableCities();
    res.status(200).json({
      success: true,
      data: cities
    });
  } catch (error) {
    logger.error('Get cities error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getStations = async (req: Request, res: Response): Promise<void> => {
  const { city_id } = req.params;
  try {
    const stations = getStationsByCity(city_id);
    res.status(200).json({
      success: true,
      data: stations
    });
  } catch (error) {
    logger.error('Get stations error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};

export const getSensors = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { station_id } = req.params;
  try {
    const station = getStationById(station_id);
    if (!station) {
      res.status(404).json({
        success: false,
        error: { message: 'Station not found' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: station.available_sensors
    });
  } catch (error) {
    logger.error('Get sensors error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' }
    });
  }
};
