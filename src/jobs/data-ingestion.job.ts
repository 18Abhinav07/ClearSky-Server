import cron from 'node-cron';
import Device from '@/models/Device';
import AQIReading from '@/models/AQIReading';
import ProcessedFile from '@/models/ProcessedFile';
import { loadStationCSVData } from '@/services/csv-data-loader.service';
import { logger } from '@/utils/logger';
import { CRON_CONFIG } from '@/config/constants';
import fs from 'fs';
import path from 'path';

// Maximum files to process per cron run (to avoid overwhelming the system)
const MAX_FILES_PER_RUN = 3;

interface IngestionResult {
  total_devices: number;
  total_files_processed: number;
  total_batches_created: number;
  total_batches_updated: number;
  total_errors: number;
  processing_time_ms: number;
  device_results: {
    device_id: string;
    files_processed: number;
    batches_created: number;
    batches_updated: number;
  }[];
}

/**
 * Extract location_id from station_id
 * E.g., "delhi_chandni_chowk_iitm_11603" -> "11603"
 */
function extractLocationId(stationId: string): string | null {
  const parts = stationId.split('_');
  const lastPart = parts[parts.length - 1];

  // Check if last part is numeric (location_id)
  if (/^\d+$/.test(lastPart)) {
    return lastPart;
  }

  return null;
}

/**
 * Get data folder path for a station
 * E.g., "delhi_chandni_chowk_iitm_11603" -> "data/delhi_chandani_chowk_11603"
 */
function getDataFolderPath(stationId: string): string | null {
  const locationId = extractLocationId(stationId);
  if (!locationId) {
    return null;
  }

  // Remove location_id from station_id to get folder name
  const folderName = stationId.replace(`_${locationId}`, `_${locationId}`);

  // Try multiple naming patterns
  const possibleFolders = [
    path.join(process.cwd(), 'data', `${folderName}`),
    path.join(process.cwd(), 'data', stationId.replace('_iitm', '')),
    path.join(process.cwd(), 'data', stationId)
  ];

  for (const folder of possibleFolders) {
    if (fs.existsSync(folder)) {
      return folder;
    }
  }

  return null;
}

/**
 * Get unprocessed CSV files for a station
 * Returns files that haven't been processed yet, limited to MAX_FILES_PER_RUN
 */
async function getUnprocessedFiles(stationId: string, dataFolder: string): Promise<string[]> {
  try {
    // Get all CSV files in the folder
    const allFiles = fs.readdirSync(dataFolder)
      .filter(file => file.endsWith('.csv') && !file.endsWith('.csv.gz'))
      .sort(); // Process in chronological order

    if (allFiles.length === 0) {
      return [];
    }

    // Get list of already processed files for this station
    const processedFiles = await ProcessedFile.find({ station_id: stationId });
    const processedFileNames = new Set(
      processedFiles.map(pf => path.basename(pf.file_path))
    );

    // Filter out already processed files
    const unprocessedFiles = allFiles.filter(file => !processedFileNames.has(file));

    if (unprocessedFiles.length === 0) {
      logger.info(`All ${allFiles.length} files already processed for station ${stationId}`);
      return [];
    }

    // Limit to MAX_FILES_PER_RUN to process sequentially
    const filesToProcess = unprocessedFiles.slice(0, MAX_FILES_PER_RUN);

    logger.info(`Found ${unprocessedFiles.length} unprocessed files for ${stationId}, processing ${filesToProcess.length} this run`, {
      total_files: allFiles.length,
      already_processed: processedFileNames.size,
      unprocessed: unprocessedFiles.length,
      processing_now: filesToProcess.length
    });

    return filesToProcess;

  } catch (error) {
    logger.error(`Failed to read data folder for ${stationId}`, {
      folder: dataFolder,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return [];
  }
}

/**
 * Ingest data from local CSV files for all registered devices
 */
export async function ingestDeviceData(): Promise<IngestionResult> {
  const startTime = Date.now();
  const result: IngestionResult = {
    total_devices: 0,
    total_files_processed: 0,
    total_batches_created: 0,
    total_batches_updated: 0,
    total_errors: 0,
    processing_time_ms: 0,
    device_results: []
  };

  try {
    // Find all active devices
    const devices = await Device.find({ status: 'active' });
    result.total_devices = devices.length;

    logger.info(`Starting data ingestion for ${devices.length} active devices`);

    for (const device of devices) {
      const deviceResult = {
        device_id: device.device_id,
        files_processed: 0,
        batches_created: 0,
        batches_updated: 0
      };

      try {
        const stationId = device.sensor_meta.station_id;

        // Get data folder path
        const dataFolder = getDataFolderPath(stationId);
        if (!dataFolder) {
          logger.warn(`No data folder found for device ${device.device_id} (${stationId})`);
          continue;
        }

        logger.info(`Processing device ${device.device_id}`, {
          station_id: stationId,
          data_folder: dataFolder
        });

        // Get unprocessed files
        const files = await getUnprocessedFiles(stationId, dataFolder);
        if (files.length === 0) {
          logger.info(`No files to process for device ${device.device_id}`);
          continue;
        }

        logger.info(`Found ${files.length} CSV files for ${device.device_id}`);

        // Process each file SEQUENTIALLY
        for (const file of files) {
          const filePath = path.join(dataFolder, file);

          try {
            logger.info(`Processing file ${file} for ${device.device_id}...`);

            // Use existing CSV loader service
            const loaderResult = await loadStationCSVData(stationId, filePath, false);

            if (loaderResult.success) {
              deviceResult.files_processed++;
              deviceResult.batches_created += loaderResult.batches_created;
              deviceResult.batches_updated += loaderResult.batches_updated;

              // Mark file as processed in database
              await ProcessedFile.create({
                file_path: filePath,
                station_id: stationId,
                device_id: device.device_id,
                processed_at: new Date(),
                batches_created: loaderResult.batches_created,
                batches_updated: loaderResult.batches_updated,
                total_rows: loaderResult.total_rows
              });

              logger.info(`✓ Successfully processed and marked ${file}`, {
                device_id: device.device_id,
                batches_created: loaderResult.batches_created,
                batches_updated: loaderResult.batches_updated,
                total_rows: loaderResult.total_rows,
                errors: loaderResult.errors.length
              });
            } else {
              result.total_errors++;
              logger.error(`✗ Failed to process ${file} for ${device.device_id}`, {
                errors: loaderResult.errors
              });
            }

          } catch (error) {
            result.total_errors++;
            logger.error(`✗ Error processing file ${file} for ${device.device_id}`, {
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Add device result
        result.device_results.push(deviceResult);
        result.total_files_processed += deviceResult.files_processed;
        result.total_batches_created += deviceResult.batches_created;
        result.total_batches_updated += deviceResult.batches_updated;

      } catch (error) {
        result.total_errors++;
        logger.error(`Failed to process device ${device.device_id}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    result.processing_time_ms = Date.now() - startTime;

    logger.info('Data ingestion completed', {
      devices: result.total_devices,
      files: result.total_files_processed,
      batches_created: result.total_batches_created,
      batches_updated: result.total_batches_updated,
      errors: result.total_errors,
      time_ms: result.processing_time_ms
    });

    return result;

  } catch (error) {
    result.processing_time_ms = Date.now() - startTime;
    logger.error('Data ingestion failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Start the data ingestion cron job
 * This runs periodically to ingest data from local CSV files
 */
export function startDataIngestionJob(): void {
  const schedule = CRON_CONFIG.DATA_INGESTION || '*/10 * * * *'; // Default: every 10 minutes

  cron.schedule(schedule, async () => {
    logger.info('Data ingestion cron job triggered');
    logger.debug(`[DATA_INGESTION] Cron triggered`, {
      service: 'data-ingestion',
      schedule,
      triggered_at: new Date().toISOString()
    });

    try {
      await ingestDeviceData();
    } catch (error) {
      logger.error('Data ingestion cron job failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info(`Data ingestion cron job scheduled: ${schedule}`);
}
