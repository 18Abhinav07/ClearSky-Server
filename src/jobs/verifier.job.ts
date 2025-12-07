import cron from 'node-cron';
import AQIReading from '@/models/AQIReading';
import { verifyAQIReading } from '@/services/verification.service';
import { logger } from '@/utils/logger';
import { CRON_CONFIG } from '@/config/constants';

export interface VerificationJobResult {
  processed_count: number;
  verified_count: number;
  failed_count: number;
  skipped_count: number;
  errors: Array<{ reading_id: string; error: string }>;
  processing_time_ms: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const MAX_BATCHES_PER_RUN = 10;

/**
 * Process PROCESSING batches and verify them
 * Generates Merkle roots, content hashes, and pins to IPFS
 */
export async function processVerificationQueue(): Promise<VerificationJobResult> {
  const startTime = Date.now();
  const result: VerificationJobResult = {
    processed_count: 0,
    verified_count: 0,
    failed_count: 0,
    skipped_count: 0,
    errors: [],
    processing_time_ms: 0
  };

  try {
    logger.info('Starting verification queue processing');

    // Find PROCESSING readings that haven't been verified yet
    const processingReadings = await AQIReading.find({
      status: 'PROCESSING',
      $and: [
        {
          $or: [
            { 'processing.merkle_root': { $exists: false } },
            { 'processing.merkle_root': null }
          ]
        },
        {
          $or: [
            { 'processing.retry_count': { $lt: MAX_RETRY_ATTEMPTS } },
            { 'processing.retry_count': { $exists: false } }
          ]
        }
      ]
    })
    .limit(MAX_BATCHES_PER_RUN)
    .sort({ 'batch_window.end': 1 });

    logger.info(`Found ${processingReadings.length} readings to verify`);
    logger.debug(`[VERIFIER] Query executed`, {
      service: 'verifier',
      query: { status: 'PROCESSING', no_merkle_root: true },
      found_count: processingReadings.length,
      reading_ids: processingReadings.map(r => r.reading_id)
    });

    for (const reading of processingReadings) {
      try {
        result.processed_count++;

        logger.debug(`[VERIFIER] Starting verification`, {
          service: 'verifier',
          reading_id: reading.reading_id,
          device_id: reading.device_id,
          owner_id: reading.owner_id,
          current_status: reading.status,
          picked_at: reading.processing?.picked_at,
          sensor_types: Object.keys(reading.sensor_data),
          batch_window: reading.batch_window
        });

        // Verify the reading (generate merkle root, content hash, pin to IPFS)
        const verificationResult = await verifyAQIReading(reading);

        if (verificationResult.success) {
          // Update reading with verification data
          reading.processing = {
            ...reading.processing,
            merkle_root: verificationResult.merkle_root!,
            content_hash: verificationResult.content_hash!,
            ipfs_uri: verificationResult.ipfs_uri!,
            ipfs_hash: verificationResult.ipfs_hash!,
            verified_at: new Date()
          };

          reading.status = 'VERIFIED';
          await reading.save();

          result.verified_count++;

          logger.info(`Successfully verified reading ${reading.reading_id}`, {
            merkle_root: verificationResult.merkle_root?.substring(0, 16) + '...',
            ipfs_hash: verificationResult.ipfs_hash
          });

          logger.debug(`[VERIFIER] Verification successful`, {
            service: 'verifier',
            reading_id: reading.reading_id,
            device_id: reading.device_id,
            status_transition: 'PROCESSING → VERIFIED',
            merkle_root: verificationResult.merkle_root,
            content_hash: verificationResult.content_hash,
            ipfs_uri: verificationResult.ipfs_uri,
            ipfs_hash: verificationResult.ipfs_hash,
            ipfs_gateway_url: `https://gateway.pinata.cloud/ipfs/${verificationResult.ipfs_hash}`,
            verified_at: reading.processing.verified_at?.toISOString(),
            mongodb_updated: true
          });

        } else {
          // Verification failed - increment retry count
          const retryCount = (reading.processing?.retry_count || 0) + 1;

          if (retryCount >= MAX_RETRY_ATTEMPTS) {
            // Max retries reached - mark as FAILED
            reading.status = 'FAILED';
            reading.processing = {
              ...reading.processing,
              error: verificationResult.error || 'Verification failed after max retries',
              retry_count: retryCount,
              failed_at: new Date()
            };
            await reading.save();

            result.failed_count++;
            result.errors.push({
              reading_id: reading.reading_id,
              error: verificationResult.error || 'Unknown error'
            });

            logger.error(`Reading ${reading.reading_id} failed after ${MAX_RETRY_ATTEMPTS} attempts`, {
              error: verificationResult.error
            });
          } else {
            // Still have retries left - increment count and keep PROCESSING
            reading.processing = {
              ...reading.processing,
              error: verificationResult.error,
              retry_count: retryCount
            };
            await reading.save();

            result.skipped_count++;
            logger.warn(`Verification attempt ${retryCount}/${MAX_RETRY_ATTEMPTS} failed for ${reading.reading_id}`, {
              error: verificationResult.error
            });
          }
        }

        // Small delay between verifications to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        result.failed_count++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          reading_id: reading.reading_id,
          error: errorMsg
        });

        logger.error(`Failed to process reading ${reading.reading_id}`, {
          error: errorMsg
        });
      }
    }

    result.processing_time_ms = Date.now() - startTime;

    logger.info('Verification queue processing completed', {
      processed: result.processed_count,
      verified: result.verified_count,
      failed: result.failed_count,
      skipped: result.skipped_count,
      time_ms: result.processing_time_ms
    });

    return result;

  } catch (error) {
    result.processing_time_ms = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Verification queue processing failed', { error: errorMsg });
    throw error;
  }
}

/**
 * Start the verification cron job
 * Schedule is configurable via CRON_VERIFIER env variable
 */
export function startVerificationJob(): void {
  const schedule = CRON_CONFIG.VERIFIER;

  cron.schedule(schedule, async () => {
    logger.info('Verification cron job triggered');
    logger.debug(`[VERIFIER] Cron triggered`, {
      service: 'verifier',
      schedule,
      triggered_at: new Date().toISOString()
    });

    try {
      await processVerificationQueue();
    } catch (error) {
      logger.error('Verification cron job failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info(`Verification cron job scheduled: ${schedule}`);
}
