import AQIReading from '@/models/AQIReading';
import Device from '@/models/Device';
import { DataIngestionRequest, IAQIReading, ValidationResult } from '@/types/aqi-reading.types';
import { getCurrentBatchWindow, generateReadingId } from '@/utils/time-window.utils';
import { logger } from '@/utils/logger';

export const validateIngestionRequest = async (
  request: DataIngestionRequest,
  owner_id: string
): Promise<ValidationResult> => {
  // Check if device exists
  const device = await Device.findOne({ device_id: request.device_id });
  
  if (!device) {
    return { valid: false, error: 'Device not found' };
  }

  // Check if device is owned by authenticated user
  if (device.owner_id !== owner_id) {
    return { valid: false, error: 'Unauthorized: Device not owned by user' };
  }

  // Check if device status is 'active'
  if (device.status !== 'active') {
    return { valid: false, error: 'Device is not active' };
  }

  // Validate sensor types match device configuration
  const deviceSensorTypes = device.sensor_meta.sensor_types;
  const requestSensorTypes = Object.keys(request.sensor_data);

  for (const sensorType of requestSensorTypes) {
    if (!deviceSensorTypes.includes(sensorType)) {
      return {
        valid: false,
        error: `Invalid sensor type: ${sensorType}. Device does not support this sensor.`
      };
    }
  }

  // Validate timestamp is within acceptable range (not too old, not in future)
  const timestamp = new Date(request.timestamp);
  const now = new Date();
  const maxPastHours = 24; // Allow data from last 24 hours
  const maxFutureMinutes = 15; // Allow small clock skew

  const minAllowedTime = new Date(now.getTime() - maxPastHours * 60 * 60 * 1000);
  const maxAllowedTime = new Date(now.getTime() + maxFutureMinutes * 60 * 1000);

  if (timestamp < minAllowedTime) {
    return { valid: false, error: 'Timestamp too old (>24 hours)' };
  }

  if (timestamp > maxAllowedTime) {
    return { valid: false, error: 'Timestamp in future' };
  }

  // Validate sensor data values are numbers
  for (const [sensorType, value] of Object.entries(request.sensor_data)) {
    if (typeof value !== 'number' || isNaN(value)) {
      return { valid: false, error: `Invalid value for sensor ${sensorType}: must be a number` };
    }

    // Optionally validate sensor values are positive
    if (value < 0) {
      return { valid: false, error: `Invalid value for sensor ${sensorType}: must be non-negative` };
    }
  }

  return { valid: true };
};

export const ingestReading = async (
  owner_id: string,
  request: DataIngestionRequest
): Promise<IAQIReading> => {
  // 1. Validate
  const validation = await validateIngestionRequest(request, owner_id);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.error}`);
  }

  // 2. Get device details
  const device = await Device.findOne({ device_id: request.device_id });
  if (!device) {
    throw new Error('DEVICE_NOT_FOUND');
  }

  if (device.owner_id !== owner_id) {
    throw new Error('UNAUTHORIZED_DEVICE');
  }

  // 3. Get batch window
  const timestamp = new Date(request.timestamp);
  const batch_window = getCurrentBatchWindow(timestamp);
  const reading_id = generateReadingId(request.device_id, batch_window);

  // 4. Find or create reading
  let reading = await AQIReading.findOne({ reading_id });

  if (reading) {
    // === APPEND LOGIC ===
    // Reading exists, append new data to arrays
    logger.info(`Appending data to existing reading: ${reading_id}`);

    // sensor_data and data_points_count are now Mixed (plain objects)
    const sensorData = reading.sensor_data as any;
    const dataPointsCount = reading.meta.data_points_count as any;

    for (const [sensorType, value] of Object.entries(request.sensor_data)) {
      if (sensorData[sensorType]) {
        // Append to existing array
        sensorData[sensorType].push(value);
      } else {
        // New sensor type, create array
        sensorData[sensorType] = [value];
      }

      // Update count
      dataPointsCount[sensorType] = (dataPointsCount[sensorType] || 0) + 1;
    }

    // Update metadata
    reading.meta.ingestion_count += 1;
    reading.meta.last_ingestion = new Date();
    reading.markModified('sensor_data');
    reading.markModified('meta.data_points_count');

    await reading.save();
    logger.info(`Data appended successfully. Ingestion count: ${reading.meta.ingestion_count}`);

  } else {
    // === CREATE LOGIC ===
    // No reading exists, create new one
    logger.info(`Creating new reading: ${reading_id}`);

    // Create plain objects (Mixed schema type)
    const sensor_data: any = {};
    const data_points_count: any = {};

    for (const [sensorType, value] of Object.entries(request.sensor_data)) {
      sensor_data[sensorType] = [value];
      data_points_count[sensorType] = 1;
    }

    reading = await AQIReading.create({
      reading_id,
      device_id: request.device_id,
      owner_id,
      batch_window,
      sensor_data,
      meta: {
        location: {
          city: device.sensor_meta.city,
          city_id: device.sensor_meta.city_id,
          station: device.sensor_meta.station,
          station_id: device.sensor_meta.station_id,
          coordinates: device.sensor_meta.coordinates
        },
        ingestion_count: 1,
        last_ingestion: new Date(),
        data_points_count
      },
      status: 'PENDING',
      processing: {}
    });

    logger.info(`New reading created successfully`);
  }

  return reading;
};

export const getDeviceReadings = async (
  owner_id: string,
  device_id: string,
  options: { status?: string; limit?: number } = {}
): Promise<IAQIReading[]> => {
  const query: any = { device_id, owner_id };

  if (options.status) {
    query.status = options.status.toUpperCase();
  }

  const limit = options.limit || 10;

  const readings = await AQIReading.find(query)
    .sort({ 'batch_window.start': -1 })
    .limit(limit);

  return readings;
};

export const getReadingsByStatus = async (
  owner_id: string,
  status: string
): Promise<IAQIReading[]> => {
  const readings = await AQIReading.find({
    owner_id,
    status: status.toUpperCase()
  }).sort({ 'batch_window.start': -1 });

  return readings;
};

export const getReadingById = async (
  owner_id: string,
  reading_id: string
): Promise<IAQIReading | null> => {
  const reading = await AQIReading.findOne({ reading_id, owner_id });
  return reading;
};
