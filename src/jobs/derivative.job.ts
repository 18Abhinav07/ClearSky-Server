import cron from 'node-cron';
import AQIReading from '../models/AQIReading';
import { generateDerivatives } from '../services/derivative.service';
import { logger } from '../utils/logger';
import { CRON_CONFIG } from '@/config/constants';

const MAX_BATCHES_PER_RUN = 50; // Process up to 50 readings per run

/**
 * Finds 'VERIFIED' AQI readings and generates AI-ready markdown derivatives.
 */
export async function processDerivativeGeneration(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting derivative generation job.');

  let processedCount = 0;
  let derivedCount = 0;

  try {
    // 1. Find VERIFIED readings
    const verifiedReadings = await AQIReading.find({
      status: 'VERIFIED',
    })
    .limit(MAX_BATCHES_PER_RUN)
    .sort({ 'batch_window.end': 1 });

    if (verifiedReadings.length === 0) {
      logger.info('No verified readings to process for derivative generation.');
      return;
    }

    processedCount = verifiedReadings.length;
    logger.info(`Found ${processedCount} verified readings to process.`);

    logger.debug(`[DERIVATIVE_INDIVIDUAL] Query executed`, {
      service: 'derivative-individual',
      query: { status: 'VERIFIED' },
      found_count: processedCount,
      reading_ids: verifiedReadings.map(r => r.reading_id),
      readings_detail: verifiedReadings.map(r => ({
        reading_id: r.reading_id,
        device_id: r.device_id,
        batch_window: r.batch_window,
        verified_at: r.processing?.verified_at,
        merkle_root: r.processing?.merkle_root?.substring(0, 16) + '...',
        ipfs_hash: r.processing?.ipfs_hash
      }))
    });

    // 2. Update status to 'PROCESSING_AI' to lock the records
    const readingIds = verifiedReadings.map(r => (r as any)._id);
    await AQIReading.updateMany(
      { _id: { $in: readingIds } },
      { $set: { status: 'PROCESSING_AI', 'processing.ai_prep_started_at': new Date() } }
    );

    logger.debug(`[DERIVATIVE_INDIVIDUAL] Status updated to PROCESSING_AI`, {
      service: 'derivative-individual',
      status_transition: 'VERIFIED → PROCESSING_AI',
      count: readingIds.length,
      ai_prep_started_at: new Date().toISOString()
    });

    // 3. Generate the derivatives
    // The service will handle grouping by day, month, etc.
    logger.debug(`[DERIVATIVE_INDIVIDUAL] Calling generateDerivatives service`, {
      service: 'derivative-individual',
      readings_count: verifiedReadings.length
    });

    await generateDerivatives(verifiedReadings);

    logger.debug(`[DERIVATIVE_INDIVIDUAL] generateDerivatives completed`, {
      service: 'derivative-individual',
      success: true
    });

    // 4. Update status to 'DERIVED_INDIVIDUAL' after successful processing
    await AQIReading.updateMany(
      { _id: { $in: readingIds } },
      { $set: { status: 'DERIVED_INDIVIDUAL' } }
    );

    logger.debug(`[DERIVATIVE_INDIVIDUAL] Status updated to DERIVED_INDIVIDUAL`, {
      service: 'derivative-individual',
      status_transition: 'PROCESSING_AI → DERIVED_INDIVIDUAL',
      count: readingIds.length
    });

    derivedCount = processedCount;
    logger.info(`Successfully generated derivatives for ${derivedCount} readings.`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error during derivative generation';
    logger.error('Derivative generation job failed.', { error: errorMsg });
    // Note: In a real-world scenario, you might want to add logic here
    // to revert the status of 'PROCESSING_AI' records back to 'VERIFIED' on failure.
  } finally {
    const duration = Date.now() - startTime;
    logger.info('Derivative generation job finished.', {
        processed: processedCount,
        derived: derivedCount,
        duration_ms: duration,
    });
  }
}

/**
 * Starts the derivative generation cron job.
 * Schedule is configurable via CRON_DERIVATIVE_INDIVIDUAL env variable
 */
export function startDerivativeJob(): void {
  const schedule = CRON_CONFIG.DERIVATIVE_INDIVIDUAL;

  cron.schedule(schedule, async () => {
    logger.info('Derivative generation cron job triggered.');
    logger.debug(`[DERIVATIVE_INDIVIDUAL] Cron triggered`, {
      service: 'derivative-individual',
      schedule,
      triggered_at: new Date().toISOString()
    });

    try {
      await processDerivativeGeneration();
    } catch (error) {
      logger.error('Derivative generation cron job failed unexpectedly.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info(`Derivative generation cron job scheduled: ${schedule}`);
}
