import cron from 'node-cron';
import { AQIReading } from '@/models/AQIReading';
import { BatchProcessingResult } from '@/types/aqi-reading.types';
import logger from '@/utils/logger';

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
 * Runs every hour at minute 0 (e.g., 1:00, 2:00, 3:00...)
 */
export function startBatchProcessor(): void {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    logger.info('Batch processor cron job started');
    try {
      await processPendingBatches();
    } catch (error) {
      logger.error('Batch processor cron job failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info('Batch processor cron job scheduled (every hour at minute 0)');
}
