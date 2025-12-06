import { Derivative } from '../models/Derivative';
import { IDerivative, DerivativeType } from '../types/derivative.types';
import { Document } from 'mongoose';

export type DerivativeDocument = IDerivative & Document;

/**
 * Creates and saves a new derivative document.
 */
export const createDerivative = async (
  derivativeData: Partial<IDerivative>
): Promise<DerivativeDocument> => {
  const newDerivative = new Derivative(derivativeData);
  return newDerivative.save();
};

/**
 * Finds a single derivative by its unique derivative_id.
 */
export const findDerivativeById = async (
  derivative_id: string
): Promise<DerivativeDocument | null> => {
  return Derivative.findOne({ derivative_id }).lean();
};

/**
 * Finds all derivatives that were sourced from a given set of raw data IDs.
 */
export const findDerivativesByParentIDs = async (
  parent_data_ids: string[]
): Promise<DerivativeDocument[]> => {
  return Derivative.find({ parent_data_ids: { $in: parent_data_ids } }).lean();
};

/**
 * Finds all DAILY derivatives within a specific month and year.
 * @param year The year (e.g., 2025)
 * @param month The month (1-12)
 */
export const findDailyDerivativesByMonth = async (
  year: number,
  month: number
): Promise<DerivativeDocument[]> => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  return Derivative.find({
    type: 'DAILY',
    created_at: {
      $gte: startDate,
      $lte: endDate,
    },
  }).lean();
};


/**
 * Updates a batch of DAILY derivatives to link them to their META parent.
 * @param child_derivative_ids - An array of derivative_ids for the child (DAILY) documents.
 * @param meta_parent_id - The derivative_id of the parent (MONTHLY) document.
 */
export const linkChildrenToMeta = async (
    child_derivative_ids: string[],
    meta_parent_id: string
): Promise<void> => {
    await Derivative.updateMany(
        { derivative_id: { $in: child_derivative_ids } },
        { $set: { meta_parent_id: meta_parent_id } }
    );
}

/**
 * Updates the processing block of a single derivative.
 */
export const updateDerivativeProcessing = async (
  derivative_id: string,
  processingData: Partial<IDerivative['processing']>
): Promise<DerivativeDocument | null> => {
  return Derivative.findOneAndUpdate(
    { derivative_id },
    { $set: { processing: processingData } },
    { new: true }
  ).lean();
};
