import dotenv from 'dotenv';

dotenv.config();

export const MAX_DEVICES_PER_PROVIDER = parseInt(process.env.MAX_DEVICES_PER_PROVIDER || '3', 10);

export const TOKEN_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',          // 15 minutes
  ACCESS_TOKEN_EXPIRY_SECONDS: 900,    // For Redis TTL

  REFRESH_TOKEN_EXPIRY: '7d',          // 7 days
  REFRESH_TOKEN_EXPIRY_SECONDS: 604800,

  TOKEN_FAMILY_LENGTH: 16,             // Random string length for family ID
  JTI_LENGTH: 32,                      // JWT ID length

  REDIS_KEY_PREFIX: {
    ACCESS_TOKEN: 'access',
    REFRESH_TOKEN: 'refresh',
    USER_SESSION: 'user',
    BLACKLIST: 'blacklist',
  },
} as const;

export const DEVICE_LIMIT = 3;

// IPFS / Pinata Configuration
export const IPFS_CONFIG = {
  PINATA_JWT: process.env.PINATA_JWT || '',
  GATEWAY_URL: process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud',
  MAX_RETRY_ATTEMPTS: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
} as const;

// Verification Configuration
export const VERIFICATION_CONFIG = {
  MERKLE_HASH_ALGORITHM: process.env.MERKLE_HASH_ALGORITHM || 'sha256',
  CONTENT_HASH_ALGORITHM: process.env.CONTENT_HASH_ALGORITHM || 'sha256',
  MAX_BATCHES_PER_RUN: parseInt(process.env.MAX_BATCHES_PER_RUN || '10', 10),
} as const;

// LLM Configuration
export const LLM_CONFIG = {
  PROVIDER: 'together-ai',
  API_KEY: process.env.TOGETHER_API_KEY,
  DAILY_MODEL: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  MONTHLY_MODEL: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  TEMPERATURE_DAILY: 0.3,
  TEMPERATURE_MONTHLY: 0.5,
  MAX_TOKENS_DAILY: 1000,
  MAX_TOKENS_MONTHLY: 2000,
} as const;

// Data Ingestion Configuration
export const INGESTION_CONFIG = {
  // Maximum files to process per cron run (to avoid overwhelming the system)
  MAX_FILES_PER_RUN: parseInt(process.env.MAX_FILES_PER_RUN || '3', 10),
} as const;

// Cron Job Schedules Configuration
export const CRON_CONFIG = {
  // Data Ingestion: Reads CSV files from data/ folder and creates PENDING readings
  // Default: Every 10 minutes
  DATA_INGESTION: process.env.CRON_DATA_INGESTION || '*/10 * * * *',

  // Batch Processor: Marks PENDING → PROCESSING at top of hour
  // Default: Every 2 minutes (for testing, change to '5 * * * *' for hourly)
  BATCH_PROCESSOR: process.env.CRON_BATCH_PROCESSOR || '*/2 * * * *',

  // Verifier: Processes PROCESSING → VERIFIED (Merkle + IPFS)
  // Default: Every 4 minutes
  VERIFIER: process.env.CRON_VERIFIER || '*/4 * * * *',

  // Individual Derivative Generator: VERIFIED → DERIVED_INDIVIDUAL
  // Default: Every 6 minutes (aligned with ingestion interval)
  DERIVATIVE_INDIVIDUAL: process.env.CRON_DERIVATIVE_INDIVIDUAL || '*/6 * * * *',

  // Meta Derivative Generator: Monthly aggregation
  // Default: Every 8 minutes (for testing, change to '0 1 1 * *' for monthly)
  DERIVATIVE_META: process.env.CRON_DERIVATIVE_META || '*/8 * * * *',
} as const;