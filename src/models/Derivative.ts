import { Schema, model, Document } from 'mongoose';
import { IDerivative, LLMMetadata, DerivativeType } from '../types/derivative.types';
import { ProcessingMetadata } from '../types/aqi-reading.types';
import { v4 as uuidv4 } from 'uuid';

// Define the ProcessingMetadata schema
const processingMetadataSchema = new Schema<ProcessingMetadata>({
  picked_at: { type: Date },
  picked_by: { type: String },
  processed_at: { type: Date },
  merkle_root: { type: String },
  content_hash: { type: String },
  ipfs_uri: { type: String },
  ipfs_hash: { type: String },
  verified_at: { type: Date },
  ai_prep_started_at: { type: Date },
  derivative_id: { type: String },
  ip_asset_id: { type: String },
  license_terms_id: { type: String },
  child_ip_asset_id: { type: String },
  error: { type: String },
  retry_count: { type: Number },
  failed_at: { type: Date },
}, { _id: false });

// Define the LLMMetadata schema
const llmMetadataSchema = new Schema<LLMMetadata>({
  provider: { type: String, required: true },
  model: { type: String, required: true },
  tokens_used: {
    input: { type: Number, required: true },
    output: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  cost_usd: { type: Number, required: true },
  processing_time_ms: { type: Number, required: true },
}, { _id: false });


const derivativeSchema = new Schema<IDerivative & Document>({
  derivative_id: {
    type: String,
    default: () => `deriv_${uuidv4()}`,
    unique: true,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['DAILY', 'MONTHLY'] as DerivativeType[],
    required: true,
  },
  parent_data_ids: {
    type: [String],
    required: true,
    index: true,
  },
  child_derivative_ids: {
    type: [String],
    index: true,
  },
  meta_parent_id: {
    type: String,
    default: null,
    index: true,
  },
  content: {
    type: String,
    required: true,
  },
  processing: {
    type: processingMetadataSchema,
    required: true,
    default: {},
  },
  llm_metadata: {
    type: llmMetadataSchema,
  },
  ip_id: {
    type: String,
    index: true,
  },
  token_id: {
    type: String,
    index: true,
  },
  is_minted: {
    type: Boolean,
    default: false,
    index: true,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    transform: (doc, ret: any) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

export const Derivative = model<IDerivative & Document>('Derivative', derivativeSchema);
