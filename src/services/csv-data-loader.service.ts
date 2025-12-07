import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import AQIReading from '@/models/AQIReading';
import Device from '@/models/Device';
import { getCurrentBatchWindow, generateReadingId } from '@/utils/time-window.utils';
import { BatchWindow } from '@/types/aqi-reading.types';
import { logger } from '@/utils/logger';
import { getStationById } from '@/services/config.service';

interface CSVRow {
  location_id: string;
  sensors_id: string;
  location: string;
  datetime: string;
  lat: string;
  lon: string;
  parameter: string;
  units: string;
  value: string;
}

interface HourlyBatch {
  window: BatchWindow;
  sensor_data: Map<string, number[]>;
  sensor_counts: Record<string, number>;
  timestamps: string[];
}

interface LoaderResult {
  success: boolean;
  station_id: string;
  total_rows: number;
  batches_created: number;
  batches_updated: number;
  errors: string[];
  processing_time_ms: number;
}

/**
 * Normalize parameter names to match sensor_preset.json format
 * CSV uses lowercase, preset uses mixed case
 */
function normalizeParameterName(csvParam: string): string {
  const mapping: Record<string, string> = {
    'pm10': 'PM10',
    'pm2.5': 'PM2.5',
    'pm25': 'PM2.5',
    'no2': 'NO2',
    'no': 'NO',
    'nox': 'NOX',
    'o3': 'O3',
    'co': 'CO',
    'co_ppb': 'CO_ppb',
    'so2': 'SO2',
    'so2_mass': 'SO2_mass',
    'no2_mass': 'NO2_mass',
    'temperature': 'Temperature',
    'rh': 'RH',
    'wind_speed': 'Wind_Speed',
    'wind_direction': 'Wind_Direction'
  };

  const lower = csvParam.toLowerCase();
  return mapping[lower] || csvParam;
}

/**
 * Load CSV data for a station and create/update AQI reading batches
 */
export async function loadStationCSVData(
  stationId: string,
  csvFilePath: string,
  dryRun: boolean = false
): Promise<LoaderResult> {
  const startTime = Date.now();
  const result: LoaderResult = {
    success: false,
    station_id: stationId,
    total_rows: 0,
    batches_created: 0,
    batches_updated: 0,
    errors: [],
    processing_time_ms: 0
  };

  try {
    // Validate station exists in config
    const stationConfig = getStationById(stationId);
    if (!stationConfig) {
      throw new Error(`Station ${stationId} not found in configuration`);
    }

    // Find the device registered for this station
    const device = await Device.findOne({ 'sensor_meta.station_id': stationId, status: 'active' });
    if (!device) {
      throw new Error(`No active device found for station ${stationId}`);
    }

    // Validate file exists
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }

    logger.info(`Loading CSV data for station ${stationId}`, {
      file: csvFilePath,
      device_id: device.device_id,
      owner_id: device.owner_id
    });

    // Group data by hourly batches
    const hourlyBatches = new Map<string, HourlyBatch>();

    // Parse CSV file
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row: CSVRow) => {
          try {
            result.total_rows++;

            // Parse timestamp
            const timestamp = new Date(row.datetime);
            if (isNaN(timestamp.getTime())) {
              result.errors.push(`Invalid timestamp: ${row.datetime}`);
              return;
            }

            // Get batch window for this timestamp
            const window = getCurrentBatchWindow(timestamp);
            const batchKey = `${window.start.toISOString().split('T')[0]}_H${String(window.hour_index).padStart(2, '0')}`;

            // Get or create batch
            let batch = hourlyBatches.get(batchKey);
            if (!batch) {
              batch = {
                window,
                sensor_data: new Map(),
                sensor_counts: {},
                timestamps: []
              };
              hourlyBatches.set(batchKey, batch);
            }

            // Normalize parameter name
            const sensorType = normalizeParameterName(row.parameter);

            // Parse value
            const value = parseFloat(row.value);
            if (isNaN(value)) {
              result.errors.push(`Invalid value for ${sensorType}: ${row.value}`);
              return;
            }

            // Add to batch
            if (!batch.sensor_data.has(sensorType)) {
              batch.sensor_data.set(sensorType, []);
              batch.sensor_counts[sensorType] = 0;
            }

            batch.sensor_data.get(sensorType)!.push(value);
            batch.sensor_counts[sensorType]++;
            batch.timestamps.push(row.datetime);

          } catch (error) {
            result.errors.push(`Error processing row: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error));
    });

    logger.info(`Parsed ${result.total_rows} rows into ${hourlyBatches.size} hourly batches`);

    // If dry run, just return statistics
    if (dryRun) {
      result.success = true;
      result.batches_created = hourlyBatches.size;
      result.processing_time_ms = Date.now() - startTime;
      return result;
    }

    // Create or update AQI reading documents
    for (const [batchKey, batch] of hourlyBatches) {
      try {
        const readingId = generateReadingId(stationId, batch.window);

        // Check if reading exists
        const existingReading = await AQIReading.findOne({ reading_id: readingId });

        if (existingReading) {
          // Update existing reading - merge sensor data
          for (const [sensorType, values] of batch.sensor_data) {
            // Access the Map properly
            const sensorDataMap = existingReading.sensor_data as any as Map<string, number[]>;
            const dataPointsMap = existingReading.meta.data_points_count as any as Map<string, number>;
            
            const existingValues = sensorDataMap.get(sensorType) || [];
            sensorDataMap.set(sensorType, [...existingValues, ...values]);
            
            const existingCount = dataPointsMap.get(sensorType) || 0;
            dataPointsMap.set(sensorType, existingCount + values.length);
          }

          existingReading.meta.ingestion_count += batch.timestamps.length;
          existingReading.meta.last_ingestion = new Date();
          await existingReading.save();
          result.batches_updated++;

        } else {
          // Create new reading - Convert Map to object for Mongoose
          const sensorDataObj: Record<string, number[]> = {};
          batch.sensor_data.forEach((values, key) => {
            sensorDataObj[key] = values;
          });

          const dataPointsCountObj: Record<string, number> = batch.sensor_counts;

          const newReading = new AQIReading({
            reading_id: readingId,
            device_id: device.device_id, // Use actual device_id
            owner_id: device.owner_id,   // Use actual owner_id
            batch_window: batch.window,
            sensor_data: sensorDataObj,
            meta: {
              location: {
                city: device.sensor_meta.city,
                city_id: device.sensor_meta.city_id,
                station: device.sensor_meta.station,
                station_id: device.sensor_meta.station_id,
                coordinates: device.sensor_meta.coordinates
              },
              ingestion_count: batch.timestamps.length,
              last_ingestion: new Date(),
              data_points_count: dataPointsCountObj
            },
            status: 'PENDING'
          });

          await newReading.save();
          result.batches_created++;
        }

      } catch (error) {
        result.errors.push(`Error saving batch ${batchKey}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    result.success = true;
    result.processing_time_ms = Date.now() - startTime;

    logger.info(`CSV data loading completed`, {
      station_id: stationId,
      batches_created: result.batches_created,
      batches_updated: result.batches_updated,
      errors: result.errors.length,
      time_ms: result.processing_time_ms
    });

    return result;

  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    result.processing_time_ms = Date.now() - startTime;
    logger.error('CSV data loading failed', { error: result.errors });
    return result;
  }
}

/**
 * Load all CSV files for a station from a directory
 */
export async function loadStationDirectory(
  stationId: string,
  directoryPath: string,
  dryRun: boolean = false
): Promise<LoaderResult[]> {
  const results: LoaderResult[] = [];

  try {
    // Get all CSV files in directory
    const files = fs.readdirSync(directoryPath)
      .filter(file => file.endsWith('.csv') && !file.endsWith('.csv.gz'))
      .sort(); // Process in chronological order

    logger.info(`Found ${files.length} CSV files for station ${stationId}`);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      logger.info(`Processing ${file}...`);
      
      const result = await loadStationCSVData(stationId, filePath, dryRun);
      results.push(result);

      // Log progress
      logger.info(`Completed ${file}`, {
        batches_created: result.batches_created,
        batches_updated: result.batches_updated,
        errors: result.errors.length
      });
    }

    return results;

  } catch (error) {
    logger.error('Directory loading failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

/**
 * Get summary statistics from loader results
 */
export function summarizeLoaderResults(results: LoaderResult[]): {
  total_files: number;
  successful_files: number;
  total_rows: number;
  total_batches_created: number;
  total_batches_updated: number;
  total_errors: number;
  total_time_ms: number;
} {
  return {
    total_files: results.length,
    successful_files: results.filter(r => r.success).length,
    total_rows: results.reduce((sum, r) => sum + r.total_rows, 0),
    total_batches_created: results.reduce((sum, r) => sum + r.batches_created, 0),
    total_batches_updated: results.reduce((sum, r) => sum + r.batches_updated, 0),
    total_errors: results.reduce((sum, r) => sum + r.errors.length, 0),
    total_time_ms: results.reduce((sum, r) => sum + r.processing_time_ms, 0)
  };
}
