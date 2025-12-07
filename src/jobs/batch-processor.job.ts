import cron from 'node-cron';
import AQIReading from '@/models/AQIReading';
import { BatchProcessingResult } from '@/types/aqi-reading.types';
import { logger } from '@/utils/logger';
import { CRON_CONFIG } from '@/config/constants';

/**
 * Process pending batches that are past their batch window end time
 * This function is called by the cron job every hour
 */
export async function processPendingBatches(): Promise<BatchProcessingResult> {
  const startTime = Date.now();
  const result: BatchProcessingResult = {
    processed_count: 0,
    failed_count: 0,
    skipped_count: 0,
    errors: [],
    processing_time_ms: 0
  };

  try {
    const now = new Date();
    
    // Find all PENDING readings where the batch window has ended
    const pendingReadings = await AQIReading.find({
      status: 'PENDING',
      'batch_window.end': { $lt: now }
    }).sort({ 'batch_window.end': 1 });

    logger.info(`Found ${pendingReadings.length} pending readings to process`);
    logger.debug(`[BATCH_PROCESSOR] Query executed`, {
      service: 'batch-processor',
      query: { status: 'PENDING', batch_window_end_before: now },
      found_count: pendingReadings.length,
      reading_ids: pendingReadings.map(r => r.reading_id)
    });

    for (const reading of pendingReadings) {
      try {
        // Update status to PROCESSING and set metadata
        reading.status = 'PROCESSING';
        reading.processing = {
          picked_at: now,
          picked_by: 'batch-processor-cron'
        };

        await reading.save();
        result.processed_count++;

        logger.info(`Picked reading ${reading.reading_id} for processing`, {
          device_id: reading.device_id,
          window: reading.batch_window,
          ingestion_count: reading.meta.ingestion_count
        });

        logger.debug(`[BATCH_PROCESSOR] Reading status updated`, {
          service: 'batch-processor',
          reading_id: reading.reading_id,
          device_id: reading.device_id,
          owner_id: reading.owner_id,
          status_transition: 'PENDING → PROCESSING',
          picked_at: now.toISOString(),
          picked_by: 'batch-processor-cron',
          batch_window: reading.batch_window,
          sensor_data_summary: Object.keys(reading.sensor_data),
          ingestion_count: reading.meta.ingestion_count,
          total_data_points: reading.meta.data_points_count
        });

      } catch (error) {
        result.failed_count++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          reading_id: reading.reading_id,
          error: errorMsg
        });
        
        logger.error(`Failed to process reading ${reading.reading_id}`, {
          error: errorMsg,
          device_id: reading.device_id
        });
      }
    }

    result.processing_time_ms = Date.now() - startTime;
    
    logger.info('Batch processing completed', {
      processed: result.processed_count,
      failed: result.failed_count,
      time_ms: result.processing_time_ms
    });

    return result;

  } catch (error) {
    result.processing_time_ms = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Batch processing failed', { error: errorMsg });
    throw error;
  }
}

/**
 * Start the batch processor cron job
 * Schedule is configurable via CRON_BATCH_PROCESSOR env variable
 */
export function startBatchProcessor(): void {
  const schedule = CRON_CONFIG.BATCH_PROCESSOR;

  cron.schedule(schedule, async () => {
    logger.info('Batch processor cron job started');
    logger.debug(`[BATCH_PROCESSOR] Cron triggered`, {
      service: 'batch-processor',
      schedule,
      triggered_at: new Date().toISOString()
    });

    try {
      await processPendingBatches();
    } catch (error) {
      logger.error('Batch processor cron job failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info(`Batch processor cron job scheduled: ${schedule}`);
}
