/**
 * Redis Connection for BullMQ (Component 17)
 *
 * Dedicated IORedis connection configured for BullMQ requirements.
 * The existing Upstash REST client is used for caching elsewhere in the app.
 * BullMQ requires persistent connections with maxRetriesPerRequest: null.
 *
 * Environment variable: REDIS_URL (standard Redis connection string)
 * Falls back to localhost:6379 for local development.
 */

import Redis, { type RedisOptions } from 'ioredis';

/**
 * Parse Redis URL to extract connection options.
 * Supports: redis://user:pass@host:port or rediss:// for TLS
 */
function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);

  const options: RedisOptions = {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Faster startup
  };

  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }

  if (parsed.username && parsed.username !== 'default') {
    options.username = parsed.username;
  }

  // TLS for rediss:// protocol
  if (parsed.protocol === 'rediss:') {
    options.tls = {
      rejectUnauthorized: false, // Allow self-signed certs in some environments
    };
  }

  return options;
}

/**
 * Get Redis connection options from environment.
 */
function getConnectionOptions(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    return parseRedisUrl(redisUrl);
  }

  // Default for local development
  return {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/**
 * BullMQ-compatible IORedis connection.
 *
 * This connection is separate from the Upstash REST client used elsewhere.
 * BullMQ requires:
 * - Persistent TCP connection (not HTTP/REST)
 * - maxRetriesPerRequest: null (for blocking operations)
 *
 * Usage:
 * ```typescript
 * import { bullMQConnection } from '@/lib/queue/redis-connection';
 *
 * const queue = new Queue('my-queue', { connection: bullMQConnection });
 * const worker = new Worker('my-queue', handler, { connection: bullMQConnection });
 * ```
 */
export const bullMQConnection = new Redis(getConnectionOptions());

// Log connection events in non-test environments
if (process.env.NODE_ENV !== 'test') {
  bullMQConnection.on('connect', () => {
    console.log('[queue] Redis connected for BullMQ');
  });

  bullMQConnection.on('error', (err) => {
    console.error('[queue] Redis connection error:', err.message);
  });

  bullMQConnection.on('close', () => {
    console.log('[queue] Redis connection closed');
  });
}

/**
 * Create a new BullMQ-compatible connection.
 * Use this when you need a separate connection (e.g., for workers).
 *
 * @returns New Redis instance configured for BullMQ
 */
export function createBullMQConnection(): Redis {
  return new Redis(getConnectionOptions());
}

/**
 * Check if Redis is connected and ready.
 *
 * @returns true if connected
 */
export async function isRedisConnected(): Promise<boolean> {
  try {
    const result = await bullMQConnection.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully close the Redis connection.
 * Call this during application shutdown.
 */
export async function closeRedisConnection(): Promise<void> {
  await bullMQConnection.quit();
}
