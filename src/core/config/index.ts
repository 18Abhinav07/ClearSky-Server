import dotenv from 'dotenv';

dotenv.config();

const Config = {
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
  ENABLE_DISCORD_LOGGING: process.env.ENABLE_DISCORD_LOGGING === 'true',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

export default Config;
