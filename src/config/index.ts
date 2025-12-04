// ToDo :change to the requirements of this project


import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { hostname } from 'os';

config();

function generateDeviceId(): string {
  const hostName = hostname();
  const uuid = randomUUID();
  return `payzoll-${hostName}-${uuid}`;
}

interface AppConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_SSL: boolean | object;
  DB_SSL_CA_PATH?: string;
  DB_SSL_SERVER_NAME?: string;
  HORIZON_URL: string;
  SDP_API: {
    BASE_URL: string;
    DASHBOARD_BASE_URL: string;
    ADMIN_API_KEY: string;
    TIMEOUT: number;
    RETRY_ATTEMPTS: number;
    RETRY_DELAY: number;
  };
  SDP_ADMIN: {
    BASE_URL: string;
    API_KEY: string;
    SYNC_ON_STARTUP: boolean;
  };
  DOCKER: {
    LOG_COLLECTION_ENABLED: boolean;
    LOG_POLL_INTERVAL: number;
    SOCKET_PATH: string;
    COMPOSE_PROJECT?: string;
  };
  REDIS: {
    URL: string;
    PASSWORD?: string;
    SESSION_TTL: number;
    TOKEN_REFRESH_THRESHOLD: number;
    MAX_REFRESH_ATTEMPTS: number;
    ENABLE_SESSION_LOGGING: boolean;
  };
  USER_LIMIT :{
    DISBURSEMENT_LIMIT: number;
    RECIPIENT_LIMIT: number;
  }
  LOG_LEVEL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: number;
  REFRESH_TOKEN_EXPIRES_IN: number;
  MAX_LOGIN_ATTEMPTS: number;
  LOCKOUT_DURATION: number;
  BCRYPT_ROUNDS: number;
  API_VERSION: string;
  REQUEST_TIMEOUT: number;
  RATE_LIMIT_WINDOW: number;
  RATE_LIMIT_MAX: number;
  FRONTEND_URL: string;
  DASHBOARD_URL: string;
  DEVICE_ID: string;
  NOTIFICATIONS: {
    ENABLED: boolean;
    EMAIL: {
      PROVIDER: string;
      AWS_SES?: {
        ACCESS_KEY_ID: string;
        SECRET_ACCESS_KEY: string;
        REGION: string;
        FROM_EMAIL: string;
        FROM_NAME?: string;
      };
      BREVO?: {
        API_KEY: string;
        FROM_EMAIL: string;
        FROM_NAME: string;
      };
    };
    SMS: {
      PROVIDER: string;
      TWILIO?: {
        ACCOUNT_SID: string;
        AUTH_TOKEN: string;
        FROM_PHONE: string;
      };
    };
  };
  TOGETHER_AI: {
    ENABLED: boolean;
    API_KEY: string;
    MODEL_NAME: string;
  };
  DISCORD_WEBHOOK_URL?: string;
  ENABLE_DISCORD_LOGGING: boolean;
  GOOGLE_API_KEY_FILE?: string;
}

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const requiredEnvVars = [
  'PORT',
  'NODE_ENV',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'SDP_API_BASE_URL',
  'SDP_ADMIN_API_KEY',
  'SDP_ADMIN_BASE_URL',
  'REDIS_URL',
  'LOG_LEVEL',
  'JWT_SECRET'
];


function validateEnvironmentVariable(name: string, value: string | undefined, required: boolean = true): string {
  if (!value && required) {
    throw new ConfigurationError(`Required environment variable ${name} is not set`);
  }
  
  if (!value && !required) {
    return '';
  }
  
  if (value && value.trim() === '') {
    throw new ConfigurationError(`Environment variable ${name} cannot be empty`);
  }
  
  return value || '';
}

function validateNumericEnvironmentVariable(name: string, value: string | undefined, required: boolean = true, defaultValue?: number): number {
  const stringValue = validateEnvironmentVariable(name, value, required);
  
  if (!stringValue && !required && defaultValue !== undefined) {
    return defaultValue;
  }
  
  const numericValue = parseInt(stringValue);
  
  if (isNaN(numericValue)) {
    throw new ConfigurationError(`Environment variable ${name} must be a valid number, got: ${stringValue}`);
  }
  
  if (numericValue < 0) {
    throw new ConfigurationError(`Environment variable ${name} must be a positive number, got: ${numericValue}`);
  }
  
  return numericValue;
}

function loadConfig(): AppConfig {
  const missingVars: string[] = [];
  
  // Check database configuration: either DATABASE_URL OR individual DB params
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const dbVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const hasIndividualDbParams = dbVars.every(v => !!process.env[v]);
  
  // Validate database configuration - must have one or the other
  if (!hasDatabaseUrl && !hasIndividualDbParams) {
    throw new ConfigurationError(
      `DATABASE CONFIGURATION ERROR: You must provide either:\n` +
      `  Option 1: DATABASE_URL (e.g., postgresql://user:password@host:port/database)\n` +
      `  Option 2: All individual parameters (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)\n\n` +
      `Currently missing: ${!hasDatabaseUrl ? 'DATABASE_URL' : ''} ${!hasIndividualDbParams ? `and individual params: ${dbVars.filter(v => !process.env[v]).join(', ')}` : ''}`
    );
  }
  
  // Check non-database required variables
  const nonDbRequiredVars = requiredEnvVars.filter(v => !dbVars.includes(v));
  for (const varName of nonDbRequiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    const sdpAdminVars = ['SDP_ADMIN_BASE_URL', 'SDP_ADMIN_API_KEY'];
    const missingSdpAdmin = missingVars.filter(v => sdpAdminVars.includes(v));
    
    let errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`;
    
    if (missingSdpAdmin.length > 0) {
      errorMessage += `\n\nIMPORTANT: SDP Admin credentials are required for tenant creation operations.`;
      errorMessage += `\nPlease set the following environment variables:`;
      errorMessage += `\n- SDP_ADMIN_BASE_URL: The SDP admin API base URL (e.g., http://localhost:8003)`;
      errorMessage += `\n- SDP_ADMIN_API_KEY: The base64 encoded admin credentials (e.g., "U0RQLWFkbWluOmFwaV9rZXlfMTIzNDU2Nzg5MA==")`;
    }
    
    throw new ConfigurationError(errorMessage);
  }
  
  try {
    
    const config: AppConfig = {
      PORT: validateNumericEnvironmentVariable('PORT', process.env.PORT),
      NODE_ENV: validateEnvironmentVariable('NODE_ENV', process.env.NODE_ENV),
      DATABASE_URL: validateEnvironmentVariable('DATABASE_URL', process.env.DATABASE_URL, false) || '',
      DB_HOST: validateEnvironmentVariable('DB_HOST', process.env.DB_HOST, false) || '',
      DB_PORT: validateNumericEnvironmentVariable('DB_PORT', process.env.DB_PORT, false, 5432),
      DB_NAME: validateEnvironmentVariable('DB_NAME', process.env.DB_NAME, false) || '',
      DB_USER: validateEnvironmentVariable('DB_USER', process.env.DB_USER, false) || '',
      DB_PASSWORD: validateEnvironmentVariable('DB_PASSWORD', process.env.DB_PASSWORD, false) || '',
      DB_SSL: process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : (process.env.DB_SSL || 'false').toLowerCase() === 'true',
      DB_SSL_CA_PATH: validateEnvironmentVariable('DB_SSL_CA_PATH', process.env.DB_SSL_CA_PATH, false),
      DB_SSL_SERVER_NAME: validateEnvironmentVariable('DB_SSL_SERVER_NAME', process.env.DB_SSL_SERVER_NAME, false),
      HORIZON_URL: validateEnvironmentVariable('HORIZON_URL', process.env.HORIZON_URL, false),
      SDP_API: {
        BASE_URL: validateEnvironmentVariable('SDP_API_BASE_URL', process.env.SDP_API_BASE_URL),
        DASHBOARD_BASE_URL: validateEnvironmentVariable('SDP_API_DASHBOARD_BASE_URL', process.env.SDP_API_DASHBOARD_BASE_URL),
        ADMIN_API_KEY: validateEnvironmentVariable('SDP_ADMIN_API_KEY', process.env.SDP_ADMIN_API_KEY),
        TIMEOUT: validateNumericEnvironmentVariable('SDP_API_TIMEOUT', process.env.SDP_API_TIMEOUT, false, 30000),
        RETRY_ATTEMPTS: validateNumericEnvironmentVariable('SDP_API_RETRY_ATTEMPTS', process.env.SDP_API_RETRY_ATTEMPTS, false, 3),
        RETRY_DELAY: validateNumericEnvironmentVariable('SDP_API_RETRY_DELAY', process.env.SDP_API_RETRY_DELAY, false, 1000),
      },
      SDP_ADMIN: {
        BASE_URL: validateEnvironmentVariable('SDP_ADMIN_BASE_URL', process.env.SDP_ADMIN_BASE_URL),
        API_KEY: validateEnvironmentVariable('SDP_ADMIN_API_KEY', process.env.SDP_ADMIN_API_KEY),
        SYNC_ON_STARTUP: (process.env.SDP_ADMIN_SYNC_ON_STARTUP || 'true').toLowerCase() === 'true',
      },
      USER_LIMIT : {
        DISBURSEMENT_LIMIT: validateNumericEnvironmentVariable('USER_LIMIT_DISBURSEMENT_LIMIT', process.env.USER_LIMIT_DISBURSEMENT_LIMIT, false, 10000),
        RECIPIENT_LIMIT: validateNumericEnvironmentVariable('USER_LIMIT_RECIPIENT_LIMIT', process.env.USER_LIMIT_RECIPIENT_LIMIT, false, 100),
      },
      DOCKER: {
        LOG_COLLECTION_ENABLED: (process.env.DOCKER_LOG_COLLECTION_ENABLED || 'true').toLowerCase() === 'true',
        LOG_POLL_INTERVAL: validateNumericEnvironmentVariable('DOCKER_LOG_POLL_INTERVAL', process.env.DOCKER_LOG_POLL_INTERVAL, false, 30000), // 30 seconds
        SOCKET_PATH: validateEnvironmentVariable('DOCKER_SOCKET_PATH', process.env.DOCKER_SOCKET_PATH, false) || '/var/run/docker.sock',
        COMPOSE_PROJECT: validateEnvironmentVariable('DOCKER_COMPOSE_PROJECT', process.env.DOCKER_COMPOSE_PROJECT, false),
      },
      REDIS: {
        URL: validateEnvironmentVariable('REDIS_URL', process.env.REDIS_URL),
        PASSWORD: validateEnvironmentVariable('REDIS_PASSWORD', process.env.REDIS_PASSWORD, false),
        SESSION_TTL: validateNumericEnvironmentVariable('SESSION_TTL', process.env.SESSION_TTL, false, 3600), // 1 hour
        TOKEN_REFRESH_THRESHOLD: validateNumericEnvironmentVariable('TOKEN_REFRESH_THRESHOLD', process.env.TOKEN_REFRESH_THRESHOLD, false, 300), // 5 minutes
        MAX_REFRESH_ATTEMPTS: validateNumericEnvironmentVariable('MAX_REFRESH_ATTEMPTS', process.env.MAX_REFRESH_ATTEMPTS, false, 3),
        ENABLE_SESSION_LOGGING: (process.env.ENABLE_SESSION_LOGGING || 'true').toLowerCase() === 'true',
      },
      LOG_LEVEL: validateEnvironmentVariable('LOG_LEVEL', process.env.LOG_LEVEL),
      JWT_SECRET: validateEnvironmentVariable('JWT_SECRET', process.env.JWT_SECRET),
      JWT_EXPIRES_IN: validateNumericEnvironmentVariable('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN, false, 900), // 15 minutes (matches SDP session expiration)
      REFRESH_TOKEN_EXPIRES_IN: validateNumericEnvironmentVariable('REFRESH_TOKEN_EXPIRES_IN', process.env.REFRESH_TOKEN_EXPIRES_IN, false, 604800), // 7 days
      MAX_LOGIN_ATTEMPTS: validateNumericEnvironmentVariable('MAX_LOGIN_ATTEMPTS', process.env.MAX_LOGIN_ATTEMPTS, false, 5),
      LOCKOUT_DURATION: validateNumericEnvironmentVariable('LOCKOUT_DURATION', process.env.LOCKOUT_DURATION, false, 900), // 15 minutes
      BCRYPT_ROUNDS: validateNumericEnvironmentVariable('BCRYPT_ROUNDS', process.env.BCRYPT_ROUNDS, false, 12),
      API_VERSION: validateEnvironmentVariable('API_VERSION', process.env.API_VERSION, false) || 'v1',
      REQUEST_TIMEOUT: validateNumericEnvironmentVariable('REQUEST_TIMEOUT', process.env.REQUEST_TIMEOUT, false, 30000),
      RATE_LIMIT_WINDOW: validateNumericEnvironmentVariable('RATE_LIMIT_WINDOW', process.env.RATE_LIMIT_WINDOW, false, 900000),
      RATE_LIMIT_MAX: validateNumericEnvironmentVariable('RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX, false, 100),
      FRONTEND_URL: validateEnvironmentVariable('FRONTEND_URL', process.env.FRONTEND_URL, false) || 'http://localhost:3000',
      DASHBOARD_URL: validateEnvironmentVariable('DASHBOARD_URL', process.env.DASHBOARD_URL, false) || 'http://localhost:3000/dashboard',
      DEVICE_ID: validateEnvironmentVariable('DEVICE_ID', process.env.DEVICE_ID, false) || generateDeviceId(),
      NOTIFICATIONS: {
        ENABLED: (process.env.NOTIFICATIONS_ENABLED || 'true').toLowerCase() === 'true',
        EMAIL: {
          PROVIDER: validateEnvironmentVariable('NOTIFICATION_EMAIL_PROVIDER', process.env.NOTIFICATION_EMAIL_PROVIDER, false) || 'MOCK',
          AWS_SES: process.env.NOTIFICATION_EMAIL_PROVIDER === 'AWS_SES' ? {
            ACCESS_KEY_ID: validateEnvironmentVariable('AWS_SES_ACCESS_KEY_ID', process.env.AWS_SES_ACCESS_KEY_ID, false) || '',
            SECRET_ACCESS_KEY: validateEnvironmentVariable('AWS_SES_SECRET_ACCESS_KEY', process.env.AWS_SES_SECRET_ACCESS_KEY, false) || '',
            REGION: validateEnvironmentVariable('AWS_SES_REGION', process.env.AWS_SES_REGION, false) || 'us-east-1',
            FROM_EMAIL: validateEnvironmentVariable('AWS_SES_FROM_EMAIL', process.env.AWS_SES_FROM_EMAIL, false) || '',
            FROM_NAME: validateEnvironmentVariable('AWS_SES_FROM_NAME', process.env.AWS_SES_FROM_NAME, false),
          } : undefined,
          BREVO: process.env.NOTIFICATION_EMAIL_PROVIDER === 'BREVO' ? {
            API_KEY: validateEnvironmentVariable('BREVO_API_KEY', process.env.BREVO_API_KEY, false) || '',
            FROM_EMAIL: validateEnvironmentVariable('BREVO_FROM_EMAIL', process.env.BREVO_FROM_EMAIL, false) || '',
            FROM_NAME: validateEnvironmentVariable('BREVO_FROM_NAME', process.env.BREVO_FROM_NAME, false) || '',
          } : undefined,
        },
        SMS: {
          PROVIDER: validateEnvironmentVariable('NOTIFICATION_SMS_PROVIDER', process.env.NOTIFICATION_SMS_PROVIDER, false) || 'MOCK',
          TWILIO: process.env.NOTIFICATION_SMS_PROVIDER === 'TWILIO' ? {
            ACCOUNT_SID: validateEnvironmentVariable('TWILIO_ACCOUNT_SID', process.env.TWILIO_ACCOUNT_SID, false) || '',
            AUTH_TOKEN: validateEnvironmentVariable('TWILIO_AUTH_TOKEN', process.env.TWILIO_AUTH_TOKEN, false) || '',
            FROM_PHONE: validateEnvironmentVariable('TWILIO_FROM_PHONE', process.env.TWILIO_FROM_PHONE, false) || '',
          } : undefined,
        },
      },
      TOGETHER_AI: {
        ENABLED: (process.env.TOGETHER_AI_ENABLED || 'false').toLowerCase() === 'true',
        API_KEY: validateEnvironmentVariable('TOGETHER_AI_API_KEY', process.env.TOGETHER_AI_API_KEY, false) || '',
        MODEL_NAME: validateEnvironmentVariable('TOGETHER_AI_MODEL_NAME', process.env.TOGETHER_AI_MODEL_NAME, false) || 'meta-llama/Llama-Vision-Free',
      },
      DISCORD_WEBHOOK_URL: validateEnvironmentVariable('DISCORD_WEBHOOK_URL', process.env.DISCORD_WEBHOOK_URL, false),
      ENABLE_DISCORD_LOGGING: process.env.ENABLE_DISCORD_LOGGING === 'true',
      GOOGLE_API_KEY_FILE: validateEnvironmentVariable('GOOGLE_API_KEY_FILE', process.env.GOOGLE_API_KEY_FILE, false),
    };
    
    // Validate specific values
    if (!['development', 'production', 'test'].includes(config.NODE_ENV)) {
      throw new ConfigurationError(`NODE_ENV must be one of: development, production, test. Got: ${config.NODE_ENV}`);
    }
    
    if (!['error', 'warn', 'info', 'debug'].includes(config.LOG_LEVEL)) {
      throw new ConfigurationError(`LOG_LEVEL must be one of: error, warn, info, debug. Got: ${config.LOG_LEVEL}`);
    }
    
    if (config.PORT < 1024 || config.PORT > 65535) {
      throw new ConfigurationError(`PORT must be between 1024 and 65535. Got: ${config.PORT}`);
    }
    
    // Only validate DB_PORT if using individual params
    if (!hasDatabaseUrl && (config.DB_PORT < 1024 || config.DB_PORT > 65535)) {
      throw new ConfigurationError(`DB_PORT must be between 1024 and 65535. Got: ${config.DB_PORT}`);
    }
    
    if (!config.SDP_API.BASE_URL.startsWith('http')) {
      throw new ConfigurationError(`SDP_API_BASE_URL must be a valid URL starting with http/https. Got: ${config.SDP_API.BASE_URL}`);
    }
    
    if (config.JWT_SECRET.length < 32) {
      throw new ConfigurationError(`JWT_SECRET must be at least 32 characters long for security. Got: ${config.JWT_SECRET.length} characters`);
    }
    
    if (config.JWT_EXPIRES_IN < 300 || config.JWT_EXPIRES_IN > 86400) {
      throw new ConfigurationError(`JWT_EXPIRES_IN must be between 300 (5 minutes) and 86400 (24 hours). Got: ${config.JWT_EXPIRES_IN}`);
    }
    
    if (config.REFRESH_TOKEN_EXPIRES_IN < 3600 || config.REFRESH_TOKEN_EXPIRES_IN > 2592000) {
      throw new ConfigurationError(`REFRESH_TOKEN_EXPIRES_IN must be between 3600 (1 hour) and 2592000 (30 days). Got: ${config.REFRESH_TOKEN_EXPIRES_IN}`);
    }
    
    if (config.MAX_LOGIN_ATTEMPTS < 3 || config.MAX_LOGIN_ATTEMPTS > 10) {
      throw new ConfigurationError(`MAX_LOGIN_ATTEMPTS must be between 3 and 10. Got: ${config.MAX_LOGIN_ATTEMPTS}`);
    }
    
    if (config.LOCKOUT_DURATION < 300 || config.LOCKOUT_DURATION > 3600) {
      throw new ConfigurationError(`LOCKOUT_DURATION must be between 300 (5 minutes) and 3600 (1 hour). Got: ${config.LOCKOUT_DURATION}`);
    }
    
    if (config.BCRYPT_ROUNDS < 10 || config.BCRYPT_ROUNDS > 15) {
      throw new ConfigurationError(`BCRYPT_ROUNDS must be between 10 and 15. Got: ${config.BCRYPT_ROUNDS}`);
    }
    
    return config;
    
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let Config: AppConfig;

try {
  Config = loadConfig();
} catch (error) {
  console.error('Configuration Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export { Config, ConfigurationError, loadConfig };
export { CoinGeckoConfig } from './coingecko-config';
export default Config;