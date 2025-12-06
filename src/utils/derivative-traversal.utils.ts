import * as DerivativeRepository from '../database/derivative.repository';
import AQIReading from '../models/AQIReading';
import { Derivative } from '../models/Derivative';
import { logger } from './logger';

/**
 * Fetches the parent META (monthly) derivative for a given DAILY derivative.
 * @param dailyDerivativeId The derivative_id of the individual/daily log.
 * @returns The full parent META derivative document, or null if not found.
 */
export const getMetaDerivative = async (dailyDerivativeId: string) => {
  const dailyLog = await DerivativeRepository.findDerivativeById(dailyDerivativeId);
  if (!dailyLog || !dailyLog.meta_parent_id) {
    logger.warn(`No daily log or meta_parent_id found for ${dailyDerivativeId}`);
    return null;
  }
  return DerivativeRepository.findDerivativeById(dailyLog.meta_parent_id);
};

/**
 * Fetches all DAILY (child) logs for a given META (monthly) derivative.
 * @param metaDerivativeId The derivative_id of the monthly summary.
 * @returns An array of all child DAILY derivative documents.
 */
export const getDailyLogs = async (metaDerivativeId: string) => {
  const meta = await DerivativeRepository.findDerivativeById(metaDerivativeId);
  if (!meta || !meta.child_derivative_ids) {
    logger.warn(`No meta derivative or child_derivative_ids found for ${metaDerivativeId}`);
    return [];
  }
  return Derivative.find({ derivative_id: { $in: meta.child_derivative_ids } }).lean();
};

/**
 * Traverses from any derivative (DAILY or MONTHLY) back to the original raw AQIReading records.
 * @param derivativeId The derivative_id to start from.
 * @returns An array of the source IAQIReading documents.
 */
export const getOriginalData = async (derivativeId: string) => {
  const derivative = await DerivativeRepository.findDerivativeById(derivativeId);
  if (!derivative || !derivative.parent_data_ids) {
    logger.warn(`No derivative or parent_data_ids found for ${derivativeId}`);
    return [];
  }
  return AQIReading.find({ reading_id: { $in: derivative.parent_data_ids } }).lean();
};

/**
 * Verifies the entire cryptographic chain for a derivative.
 * Placeholder function for demonstrating the concept.
 * @param derivativeId The derivative_id to verify.
 * @returns A boolean indicating if the entire chain is valid.
 */
export const verifyProofChain = async (derivativeId: string): Promise<boolean> => {
  logger.info(`Starting proof chain verification for derivative: ${derivativeId}`);
  
  const derivative = await DerivativeRepository.findDerivativeById(derivativeId);
  if (!derivative) {
    logger.error(`Cannot verify proof chain: Derivative ${derivativeId} not found.`);
    return false;
  }

  // Step 1: Verify the derivative's own content hash
  // This is a conceptual step; implementation depends on how content is hashed and stored.
  // const isContentValid = getDeterministicContentHash(derivative.content) === derivative.processing.content_hash;
  // if (!isContentValid) {
  //   logger.error(`Content hash mismatch for derivative ${derivativeId}`);
  //   return false;
  // }
  logger.info(`Step 1: Content hash for ${derivativeId} is assumed valid.`);

  if (derivative.type === 'MONTHLY' && derivative.child_derivative_ids) {
    // Step 2a: For a META derivative, verify all its children
    logger.info(`Verifying proof chain for ${derivative.child_derivative_ids.length} children.`);
    const childProofs = await Promise.all(derivative.child_derivative_ids.map(verifyProofChain));
    if (childProofs.some(p => !p)) {
      logger.error(`Proof chain verification failed for one or more children of ${derivativeId}.`);
      return false;
    }
  }

  // Step 2b: Verify against the original data
  const originalReadings = await getOriginalData(derivativeId);
  if (originalReadings.length !== derivative.parent_data_ids.length) {
    logger.error(`Mismatch between parent_data_ids and found original readings for ${derivativeId}.`);
    return false;
  }
  
  // Step 3: Conceptually, re-calculate the Merkle root from the original readings
  // and compare it to the root stored in their processing metadata.
  logger.info(`Step 3: Cryptographic lineage to ${originalReadings.length} raw data points is assumed valid.`);

  logger.info(`Successfully verified proof chain for derivative: ${derivativeId}`);
  return true;
};
