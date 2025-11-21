/**
 * SAT Authentication Test Endpoint
 *
 * This endpoint validates Phase 1 of the SAT integration:
 * - FIEL certificate loading
 * - Certificate validation
 * - SAT SOAP authentication
 * - Token caching
 * - Rate limiting
 *
 * Usage:
 * POST /api/sat/test-auth
 * Body: { organizationId: "uuid", password: "cert-password" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  authenticateWithSAT,
  checkAuthenticationStatus,
  getTokenTTL,
} from '@/lib/sat/authentication';
import {
  getFIELInfo,
  validateFIELReady,
  checkCertificateRenewal,
} from '@/lib/sat/fiel';
import {
  getCacheStats,
  getRateLimitStatus,
  checkCacheHealth,
} from '@/lib/sat/cache';

export const dynamic = 'force-dynamic';

interface TestAuthRequest {
  organizationId: string;
  password: string;
}

interface TestResult {
  step: string;
  status: 'success' | 'failed' | 'warning';
  message: string;
  data?: any;
  error?: string;
  duration?: number;
}

/**
 * POST /api/sat/test-auth
 * Tests SAT authentication and returns detailed results
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const results: TestResult[] = [];

  try {
    // Parse request body
    const body: TestAuthRequest = await request.json();
    const { organizationId, password } = body;

    if (!organizationId || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing organizationId or password',
        },
        { status: 400 }
      );
    }

    // Step 1: Verify user has access to organization
    results.push(await testUserAccess(organizationId));

    // Step 2: Check cache health
    results.push(await testCacheHealth());

    // Step 3: Verify FIEL certificates exist
    results.push(await testFIELExists(organizationId));

    // Step 4: Load and validate FIEL
    results.push(await testFIELValidation(organizationId));

    // Step 5: Check certificate expiry
    results.push(await testCertificateExpiry(organizationId));

    // Step 6: Check rate limit status
    results.push(await testRateLimit(organizationId));

    // Step 7: Authenticate with SAT
    results.push(await testSATAuthentication(organizationId, password));

    // Step 8: Verify token caching
    results.push(await testTokenCaching(organizationId));

    // Calculate total duration
    const totalDuration = Date.now() - startTime;

    // Determine overall success
    const hasErrors = results.some((r) => r.status === 'failed');
    const hasWarnings = results.some((r) => r.status === 'warning');

    return NextResponse.json({
      success: !hasErrors,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
        warnings: results.filter((r) => r.status === 'warning').length,
        duration: totalDuration,
      },
      results,
      message: hasErrors
        ? 'SAT authentication test failed'
        : hasWarnings
          ? 'SAT authentication test passed with warnings'
          : 'SAT authentication test passed successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sat/test-auth?organizationId=xxx
 * Gets authentication status without testing
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing organizationId parameter' },
        { status: 400 }
      );
    }

    const status = await checkAuthenticationStatus(organizationId);
    const cacheStats = await getCacheStats(organizationId);
    const rateLimitStatus = await getRateLimitStatus(organizationId);

    return NextResponse.json({
      success: true,
      organizationId,
      status,
      cache: cacheStats,
      rateLimit: rateLimitStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Test Functions
// ============================================================================

async function testUserAccess(organizationId: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        step: 'User Access',
        status: 'failed',
        message: 'No authenticated user',
        duration: Date.now() - start,
      };
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return {
        step: 'User Access',
        status: 'failed',
        message: 'User does not have access to this organization',
        duration: Date.now() - start,
      };
    }

    return {
      step: 'User Access',
      status: 'success',
      message: `User has access (role: ${member.role})`,
      data: { userId: user.id, role: member.role },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'User Access',
      status: 'failed',
      message: 'Failed to verify user access',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testCacheHealth(): Promise<TestResult> {
  const start = Date.now();
  try {
    const healthy = await checkCacheHealth();

    if (!healthy) {
      return {
        step: 'Cache Health',
        status: 'failed',
        message: 'Redis cache is not working',
        duration: Date.now() - start,
      };
    }

    return {
      step: 'Cache Health',
      status: 'success',
      message: 'Redis cache is healthy',
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'Cache Health',
      status: 'failed',
      message: 'Cache health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testFIELExists(organizationId: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('rfc, cfdi_cert, cfdi_key, cfdi_password_hash')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return {
        step: 'FIEL Exists',
        status: 'failed',
        message: 'Organization not found',
        duration: Date.now() - start,
      };
    }

    const hasFiles = !!(org.cfdi_cert && org.cfdi_key && org.cfdi_password_hash);

    if (!hasFiles) {
      return {
        step: 'FIEL Exists',
        status: 'failed',
        message: 'FIEL certificates not uploaded',
        data: {
          hasCert: !!org.cfdi_cert,
          hasKey: !!org.cfdi_key,
          hasPasswordHash: !!org.cfdi_password_hash,
        },
        duration: Date.now() - start,
      };
    }

    return {
      step: 'FIEL Exists',
      status: 'success',
      message: 'FIEL certificates found',
      data: { rfc: org.rfc },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'FIEL Exists',
      status: 'failed',
      message: 'Failed to check FIEL existence',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testFIELValidation(organizationId: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const { valid, errors } = await validateFIELReady(organizationId);

    if (!valid) {
      return {
        step: 'FIEL Validation',
        status: 'failed',
        message: 'FIEL validation failed',
        data: { errors },
        duration: Date.now() - start,
      };
    }

    const fielInfo = await getFIELInfo(organizationId);

    return {
      step: 'FIEL Validation',
      status: 'success',
      message: 'FIEL is valid',
      data: fielInfo,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'FIEL Validation',
      status: 'failed',
      message: 'FIEL validation error',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testCertificateExpiry(
  organizationId: string
): Promise<TestResult> {
  const start = Date.now();
  try {
    const renewal = await checkCertificateRenewal(organizationId);

    if (renewal.isExpired) {
      return {
        step: 'Certificate Expiry',
        status: 'failed',
        message: 'Certificate has expired',
        data: renewal,
        duration: Date.now() - start,
      };
    }

    if (renewal.needsRenewal) {
      return {
        step: 'Certificate Expiry',
        status: 'warning',
        message: `Certificate expires in ${renewal.daysUntilExpiry} days`,
        data: renewal,
        duration: Date.now() - start,
      };
    }

    return {
      step: 'Certificate Expiry',
      status: 'success',
      message: `Certificate valid for ${renewal.daysUntilExpiry} days`,
      data: renewal,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'Certificate Expiry',
      status: 'failed',
      message: 'Failed to check certificate expiry',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testRateLimit(organizationId: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const status = await getRateLimitStatus(organizationId);

    if (status.exceeded) {
      return {
        step: 'Rate Limit',
        status: 'failed',
        message: `Rate limit exceeded (${status.used}/${status.limit})`,
        data: status,
        duration: Date.now() - start,
      };
    }

    const percentUsed = (status.used / status.limit) * 100;
    const isWarning = percentUsed > 80;

    return {
      step: 'Rate Limit',
      status: isWarning ? 'warning' : 'success',
      message: `${status.remaining} requests remaining (${percentUsed.toFixed(1)}% used)`,
      data: status,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'Rate Limit',
      status: 'failed',
      message: 'Failed to check rate limit',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testSATAuthentication(
  organizationId: string,
  password: string
): Promise<TestResult> {
  const start = Date.now();
  try {
    const authToken = await authenticateWithSAT(organizationId, password);

    return {
      step: 'SAT Authentication',
      status: 'success',
      message: 'Successfully authenticated with SAT',
      data: {
        tokenLength: authToken.token.length,
        expiresAt: authToken.expiresAt,
        ttl: getTokenTTL(authToken),
        rfc: authToken.rfc,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'SAT Authentication',
      status: 'failed',
      message: 'SAT authentication failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}

async function testTokenCaching(organizationId: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const cacheStats = await getCacheStats(organizationId);

    if (!cacheStats.authTokenCached) {
      return {
        step: 'Token Caching',
        status: 'warning',
        message: 'Token not found in cache (may have been cached after test)',
        data: cacheStats,
        duration: Date.now() - start,
      };
    }

    return {
      step: 'Token Caching',
      status: 'success',
      message: `Token cached (TTL: ${cacheStats.authTokenTTL}s)`,
      data: cacheStats,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      step: 'Token Caching',
      status: 'failed',
      message: 'Failed to check token caching',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start,
    };
  }
}
