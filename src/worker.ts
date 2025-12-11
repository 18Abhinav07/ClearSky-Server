/**
 * Cloudflare Workers Entry Point
 * 
 * WARNING: This is a stub file. Your application CANNOT run on Cloudflare Workers because:
 * 
 * 1. MongoDB requires persistent TCP connections (Workers don't support this)
 * 2. Redis (ioredis) requires persistent connections
 * 3. Cron jobs with node-cron need long-running processes
 * 4. CSV file parsing requires filesystem access
 * 5. Many dependencies (bcrypt, mongoose, etc.) are Node.js specific
 * 
 * To make this work on Cloudflare Workers, you would need to:
 * - Replace MongoDB with Cloudflare D1 (SQLite)
 * - Replace Redis with Cloudflare KV or Durable Objects
 * - Replace cron jobs with Cloudflare Workers Cron Triggers
 * - Replace CSV parsing with R2 bucket storage
 * - Rewrite all incompatible dependencies
 * 
 * RECOMMENDED: Deploy to Railway, Render, or Fly.io instead
 */

import app from './app';

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    return new Response('This application is not compatible with Cloudflare Workers. Please deploy to Railway, Render, or Fly.io.', {
      status: 501,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
