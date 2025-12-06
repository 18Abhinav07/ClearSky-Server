import cron from 'node-cron';
import AQIReading from '../models/AQIReading';
import { generateDerivatives } from '../services/derivative.service';
import { logger } from '../utils/logger';

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

    // 2. Update status to 'PROCESSING_AI' to lock the records
    const readingIds = verifiedReadings.map(r => (r as any)._id);
    await AQIReading.updateMany(
      { _id: { $in: readingIds } },
      { $set: { status: 'PROCESSING_AI', 'processing.ai_prep_started_at': new Date() } }
    );

    // 3. Generate the derivatives
    // The service will handle grouping by day, month, etc.
    await generateDerivatives(verifiedReadings);

    // 4. Update status to 'DERIVED_INDIVIDUAL' after successful processing
    await AQIReading.updateMany(
      { _id: { $in: readingIds } },
      { $set: { status: 'DERIVED_INDIVIDUAL' } }
    );

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
 * Runs every 15 minutes.
 */
export function startDerivativeJob(): void {
  cron.schedule('*/15 * * * *', async () => {
    logger.info('Derivative generation cron job triggered.');
    try {
      await processDerivativeGeneration();
    } catch (error) {
      logger.error('Derivative generation cron job failed unexpectedly.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info('Derivative generation cron job scheduled (every 15 minutes).');
}
