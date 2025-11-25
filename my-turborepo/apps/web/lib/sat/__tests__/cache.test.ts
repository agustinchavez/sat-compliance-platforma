import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cacheAuthToken,
  getCachedAuthToken,
  invalidateAuthToken,
  incrementRateLimit,
  getRateLimitCount,
  isRateLimitExceeded,
  getRateLimitStatus,
  cacheDownloadStatus,
  getCachedDownloadStatus,
  clearOrganizationCache,
  getCacheStats,
  checkCacheHealth,
} from '../cache';
import type { SATAuthToken } from '../types';

// Mock Upstash Redis
const mockRedisInstance = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  exists: vi.fn(),
  ttl: vi.fn(),
  keys: vi.fn(),
};

vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      constructor() {
        return mockRedisInstance;
      }
    },
  };
});

describe('SAT Cache', () => {
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = mockRedisInstance;
  });

  describe('Authentication Token Caching', () => {
    it('should cache auth token with correct TTL', async () => {
      const token: SATAuthToken = {
        token: 'test-token',
        expiresAt: new Date(Date.now() + 300000), // 5 minutes
        issuedAt: new Date(),
        organizationId: 'org-123',
        rfc: 'ABC120101ABC',
      };

      await cacheAuthToken('org-123', token);

      expect(mockRedis.setex).toHaveBeenCalled();
      const [key, ttl, value] = mockRedis.setex.mock.calls[0];

      expect(key).toContain('sat:v1:auth:org-123');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
      expect(JSON.parse(value)).toEqual(
        expect.objectContaining({ token: 'test-token' })
      );
    });

    it('should not cache expired token', async () => {
      const token: SATAuthToken = {
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000), // Already expired
        issuedAt: new Date(),
        organizationId: 'org-123',
        rfc: 'ABC120101ABC',
      };

      await cacheAuthToken('org-123', token);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should retrieve cached auth token', async () => {
      const token: SATAuthToken = {
        token: 'cached-token',
        expiresAt: new Date(Date.now() + 300000),
        issuedAt: new Date(),
        organizationId: 'org-123',
        rfc: 'ABC120101ABC',
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(token));

      const result = await getCachedAuthToken('org-123');

      expect(result).toEqual(expect.objectContaining({ token: 'cached-token' }));
    });

    it('should return null for missing token', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getCachedAuthToken('org-123');

      expect(result).toBeNull();
    });

    it('should return null for expired cached token', async () => {
      const expiredToken: SATAuthToken = {
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
        issuedAt: new Date(),
        organizationId: 'org-123',
        rfc: 'ABC120101ABC',
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(expiredToken));

      const result = await getCachedAuthToken('org-123');

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalled(); // Should invalidate
    });

    it('should invalidate auth token', async () => {
      await invalidateAuthToken('org-123');

      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRedis.del.mock.calls[0][0]).toContain('auth:org-123');
    });
  });

  describe('Rate Limiting', () => {
    it('should increment rate limit counter', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const count = await incrementRateLimit('org-123');

      expect(count).toBe(1);
      expect(mockRedis.incr).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled(); // Should set TTL
    });

    it('should not reset TTL on subsequent increments', async () => {
      mockRedis.incr.mockResolvedValue(2);

      await incrementRateLimit('org-123');

      expect(mockRedis.expire).not.toHaveBeenCalled(); // Not first increment
    });

    it('should get rate limit count', async () => {
      mockRedis.get.mockResolvedValue(42);

      const count = await getRateLimitCount('org-123');

      expect(count).toBe(42);
    });

    it('should return 0 for missing rate limit', async () => {
      mockRedis.get.mockResolvedValue(null);

      const count = await getRateLimitCount('org-123');

      expect(count).toBe(0);
    });

    it('should check if rate limit exceeded', async () => {
      mockRedis.get.mockResolvedValueOnce(499);
      const notExceeded = await isRateLimitExceeded('org-123', 500);
      expect(notExceeded).toBe(false);

      mockRedis.get.mockResolvedValueOnce(500);
      const exceeded = await isRateLimitExceeded('org-123', 500);
      expect(exceeded).toBe(true);

      mockRedis.get.mockResolvedValueOnce(501);
      const overExceeded = await isRateLimitExceeded('org-123', 500);
      expect(overExceeded).toBe(true);
    });

    it('should get rate limit status', async () => {
      mockRedis.get.mockResolvedValue(250);

      const status = await getRateLimitStatus('org-123', 500);

      expect(status.limit).toBe(500);
      expect(status.used).toBe(250);
      expect(status.remaining).toBe(250);
      expect(status.exceeded).toBe(false);
      expect(status.resetAt).toBeInstanceOf(Date);
    });

    it('should handle exceeded rate limit status', async () => {
      mockRedis.get.mockResolvedValue(600);

      const status = await getRateLimitStatus('org-123', 500);

      expect(status.used).toBe(600);
      expect(status.remaining).toBe(0);
      expect(status.exceeded).toBe(true);
    });
  });

  describe('Download Status Caching', () => {
    it('should cache download status', async () => {
      const status = {
        requestId: 'req-123',
        status: 'processing',
        statusCode: 5001,
      };

      await cacheDownloadStatus('req-123', status);

      expect(mockRedis.setex).toHaveBeenCalled();
      const [key, ttl, value] = mockRedis.setex.mock.calls[0];

      expect(key).toContain('download:req-123');
      expect(ttl).toBe(3600); // 1 hour
      expect(JSON.parse(value)).toEqual(status);
    });

    it('should retrieve cached download status', async () => {
      const status = { requestId: 'req-123', status: 'completed' };
      mockRedis.get.mockResolvedValue(JSON.stringify(status));

      const result = await getCachedDownloadStatus('req-123');

      expect(result).toEqual(status);
    });

    it('should return null for missing download status', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getCachedDownloadStatus('req-123');

      expect(result).toBeNull();
    });
  });

  describe('Cache Management', () => {
    it('should clear organization cache', async () => {
      mockRedis.keys.mockResolvedValue([
        'sat:v1:auth:org-123',
        'sat:v1:download:org-123:req-1',
      ]);

      await clearOrganizationCache('org-123');

      expect(mockRedis.keys).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle empty cache on clear', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await clearOrganizationCache('org-123');

      expect(mockRedis.keys).toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should get cache statistics', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValueOnce(298).mockResolvedValueOnce(86399);
      mockRedis.get.mockResolvedValue(42);

      const stats = await getCacheStats('org-123');

      expect(stats.authTokenCached).toBe(true);
      expect(stats.authTokenTTL).toBe(298);
      expect(stats.rateLimitCount).toBe(42);
      expect(stats.rateLimitTTL).toBe(86399);
    });

    it('should check cache health', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const healthy = await checkCacheHealth();

      expect(healthy).toBe(true);
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should detect unhealthy cache', async () => {
      mockRedis.get.mockResolvedValue('wrong-value');

      const healthy = await checkCacheHealth();

      expect(healthy).toBe(false);
    });

    it('should handle cache errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const healthy = await checkCacheHealth();

      expect(healthy).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle cache errors gracefully on set', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      const token: SATAuthToken = {
        token: 'test',
        expiresAt: new Date(Date.now() + 300000),
        issuedAt: new Date(),
        organizationId: 'org-123',
        rfc: 'ABC120101ABC',
      };

      // Should not throw
      await expect(cacheAuthToken('org-123', token)).resolves.not.toThrow();
    });

    it('should handle cache errors gracefully on get', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await getCachedAuthToken('org-123');

      expect(result).toBeNull();
    });

    it('should handle rate limit errors gracefully', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis error'));

      const count = await incrementRateLimit('org-123');

      expect(count).toBe(0);
    });
  });
});
