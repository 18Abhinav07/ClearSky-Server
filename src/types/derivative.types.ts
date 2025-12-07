import { Types } from 'mongoose';
import { ProcessingMetadata } from './aqi-reading.types';

export type DerivativeType = 'DAILY' | 'MONTHLY';

export interface LLMMetadata {
  provider: string;
  model: string;
  tokens_used: {
    input: number;
    output: number;
    total: number;
  };
  cost_usd: number;
  processing_time_ms: number;
}

export interface IDerivative {
  derivative_id: string;
  type: DerivativeType;
  
  // Relationship Fields
  parent_data_ids: string[]; // Links to aqi_device_raw reading_id
  child_derivative_ids?: string[]; // For META: links to derivative_id of children
  meta_parent_id?: string | null; // For DAILY: links to derivative_id of parent

  content: string; // The markdown content
  processing: ProcessingMetadata;
  llm_metadata?: LLMMetadata;

  // Story Protocol Fields
  ip_id?: string;
  token_id?: string;
  is_minted: boolean;

  created_at: Date;
  updated_at: Date;
}
