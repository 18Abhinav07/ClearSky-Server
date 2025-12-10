import dotenv from 'dotenv';

dotenv.config();

export const MAX_DEVICES_PER_PROVIDER = parseInt(process.env.MAX_DEVICES_PER_PROVIDER || '3', 10);

export const TOKEN_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '1d',           // 1 day
  ACCESS_TOKEN_EXPIRY_SECONDS: 86400,  // For Redis TTL

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

// Story Protocol Configuration (Aeneid Testnet)
export const STORY_CONFIG = {
  PRIVATE_KEY: process.env.STORY_PRIVATE_KEY || '',
  PLATFORM_WALLET_PRIVATE_KEY: process.env.PLATFORM_WALLET_PRIVATE_KEY || '',
  SPG_NFT_CONTRACT: process.env.STORY_SPG_NFT_CONTRACT || '',
  LICENSE_TERMS_ID: process.env.LICENSE_TERMS_ID || '',
  // Whitelisted revenue token for Aeneid testnet
  WIP_TOKEN_ADDRESS: '0x1514000000000000000000000000000000000000',
  // Liquid Absolute Percentage royalty policy
  LAP_ROYALTY_POLICY_ADDRESS: '0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E',
  // Programmable IP License (PIL) template for commercial use
  COMMERCIAL_USE_PIL_TEMPLATE: '0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316',
} as const;

// Cron Job Configuration
export const CRON_CONFIG = {
  DATA_INGESTION: process.env.CRON_DATA_INGESTION || '*/10 * * * *',
  BATCH_PROCESSOR: process.env.CRON_BATCH_PROCESSOR || '*/20 * * * *',
  VERIFIER: process.env.CRON_VERIFIER || '*/30 * * * *',
  DERIVATIVE_INDIVIDUAL: process.env.CRON_DERIVATIVE_INDIVIDUAL || '*/15 * * * *',
  DERIVATIVE_META: process.env.CRON_DERIVATIVE_META || '*/1 * * * *',
} as const;

// Data Ingestion Configuration
export const INGESTION_CONFIG = {
  MAX_FILES_PER_RUN: parseInt(process.env.MAX_FILES_PER_RUN || '10', 10),
} as const;