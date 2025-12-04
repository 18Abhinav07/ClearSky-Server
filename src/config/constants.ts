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