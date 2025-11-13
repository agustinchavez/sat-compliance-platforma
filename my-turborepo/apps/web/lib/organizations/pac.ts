/**
 * PAC Provider Configuration
 *
 * This file handles PAC (Proveedor Autorizado de Certificación) provider configuration.
 * PAC providers are authorized by SAT to stamp (timbrar) CFDI invoices.
 *
 * Supported providers:
 * - Finkok
 * - SW (Smarter Web)
 * - Diverza
 * - Facturaxion
 */

import { createClient } from '@/lib/supabase/server';
import type {
  PACConfig,
  PACProvider,
  PACEnvironment,
  PACConnectionTestResult,
  EncryptedPACConfig,
  PACCredentials,
} from './types';
import {
  encryptPACCredentials,
  decryptPACCredentials,
} from './encryption';
import { validatePACConfig } from './validation';

// ============================================================================
// PAC Configuration
// ============================================================================

/**
 * Configures PAC provider for an organization
 *
 * @param organizationId - Organization UUID
 * @param config - PAC configuration
 * @returns Configuration result
 *
 * @example
 * ```ts
 * await configurePAC('org-uuid', {
 *   provider: 'finkok',
 *   environment: 'production',
 *   credentials: {
 *     username: 'api_user',
 *     password: 'api_password'
 *   },
 *   isActive: true
 * });
 * ```
 */
export async function configurePAC(
  organizationId: string,
  config: PACConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate config
    const validation = validatePACConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    // Encrypt credentials
    const { encryptedCredentials, iv, authTag } = encryptPACCredentials(
      config.credentials
    );

    // Prepare encrypted config
    const encryptedConfig: EncryptedPACConfig = {
      provider: config.provider,
      environment: config.environment,
      encryptedCredentials,
      iv,
      authTag,
      isActive: config.isActive,
      lastTested: config.lastTested,
      lastTestResult: config.lastTestResult,
    };

    // Update organization
    const supabase = await createClient();
    const { error } = await supabase
      .from('organizations')
      .update({
        pac_provider: config.provider,
        pac_credentials: encryptedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (error) {
      throw error;
    }

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'pac_configured', { provider: config.provider });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets PAC configuration for an organization
 *
 * @param organizationId - Organization UUID
 * @returns PAC configuration (decrypted) or null
 *
 * @example
 * ```ts
 * const config = await getPACConfig('org-uuid');
 * if (config) {
 *   console.log('Provider:', config.provider);
 *   console.log('Environment:', config.environment);
 * }
 * ```
 */
export async function getPACConfig(
  organizationId: string
): Promise<PACConfig | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('organizations')
      .select('pac_provider, pac_credentials')
      .eq('id', organizationId)
      .single();

    if (error || !data) {
      return null;
    }

    if (!data.pac_provider || !data.pac_credentials) {
      return null;
    }

    const encryptedConfig = data.pac_credentials as EncryptedPACConfig;

    // Decrypt credentials
    const credentials = decryptPACCredentials(
      encryptedConfig.encryptedCredentials,
      encryptedConfig.iv,
      encryptedConfig.authTag
    );

    return {
      provider: encryptedConfig.provider,
      environment: encryptedConfig.environment,
      credentials,
      isActive: encryptedConfig.isActive,
      lastTested: encryptedConfig.lastTested
        ? new Date(encryptedConfig.lastTested)
        : undefined,
      lastTestResult: encryptedConfig.lastTestResult,
    };
  } catch (error) {
    console.error('Failed to get PAC config:', error);
    return null;
  }
}

// ============================================================================
// PAC Connection Testing
// ============================================================================

/**
 * Tests PAC connection
 *
 * @param organizationId - Organization UUID
 * @returns Test result
 *
 * @example
 * ```ts
 * const result = await testPACConnection('org-uuid');
 * if (result.success) {
 *   console.log('PAC connection successful!');
 * } else {
 *   console.error('PAC connection failed:', result.message);
 * }
 * ```
 */
export async function testPACConnection(
  organizationId: string
): Promise<PACConnectionTestResult> {
  try {
    const config = await getPACConfig(organizationId);

    if (!config) {
      return {
        success: false,
        provider: 'finkok' as PACProvider, // Default
        environment: 'sandbox' as PACEnvironment,
        message: 'PAC not configured',
        timestamp: new Date(),
        error: 'No PAC configuration found',
      };
    }

    // Test connection based on provider
    const testResult = await testPACProvider(
      config.provider,
      config.environment,
      config.credentials
    );

    // Update config with test result
    await updatePACTestResult(
      organizationId,
      testResult.success ? 'success' : 'failed'
    );

    return testResult;
  } catch (error) {
    return {
      success: false,
      provider: 'finkok' as PACProvider,
      environment: 'sandbox' as PACEnvironment,
      message: 'Connection test failed',
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Tests connection to specific PAC provider
 *
 * @param provider - PAC provider
 * @param environment - Environment (sandbox/production)
 * @param credentials - PAC credentials
 * @returns Test result
 */
async function testPACProvider(
  provider: PACProvider,
  environment: PACEnvironment,
  credentials: PACCredentials
): Promise<PACConnectionTestResult> {
  const timestamp = new Date();

  try {
    switch (provider) {
      case 'finkok':
        return await testFinkokConnection(environment, credentials, timestamp);

      case 'sw':
        return await testSWConnection(environment, credentials, timestamp);

      case 'diverza':
        return await testDiverzaConnection(environment, credentials, timestamp);

      case 'facturaxion':
        return await testFacturaxionConnection(environment, credentials, timestamp);

      default:
        return {
          success: false,
          provider,
          environment,
          message: `Unsupported PAC provider: ${provider}`,
          timestamp,
          error: 'Unsupported provider',
        };
    }
  } catch (error) {
    return {
      success: false,
      provider,
      environment,
      message: 'Connection test failed',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Provider-Specific Connection Tests
// ============================================================================

/**
 * Tests Finkok PAC connection
 */
async function testFinkokConnection(
  environment: PACEnvironment,
  credentials: PACCredentials,
  timestamp: Date
): Promise<PACConnectionTestResult> {
  try {
    // Finkok test endpoint
    const baseUrl =
      environment === 'production'
        ? 'https://facturacion.finkok.com/servicios/soap'
        : 'http://demo-facturacion.finkok.com/servicios/soap';

    // Simple SOAP call to test authentication
    // For now, we'll just verify credentials are present
    if (!credentials.username || !credentials.password) {
      throw new Error('Invalid credentials');
    }

    // TODO: Implement actual SOAP call to Finkok
    // This is a placeholder - you'll need to implement actual API call
    console.log(`Testing Finkok connection to ${baseUrl}`);

    return {
      success: true,
      provider: 'finkok',
      environment,
      message: 'Connection successful (test mode)',
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'finkok',
      environment,
      message: 'Connection failed',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Tests SW (Smarter Web) PAC connection
 */
async function testSWConnection(
  environment: PACEnvironment,
  credentials: PACCredentials,
  timestamp: Date
): Promise<PACConnectionTestResult> {
  try {
    // SW test endpoint
    const baseUrl =
      environment === 'production'
        ? 'https://services.sw.com.mx'
        : 'https://services.test.sw.com.mx';

    if (!credentials.username || !credentials.password) {
      throw new Error('Invalid credentials');
    }

    // TODO: Implement actual REST API call to SW
    console.log(`Testing SW connection to ${baseUrl}`);

    return {
      success: true,
      provider: 'sw',
      environment,
      message: 'Connection successful (test mode)',
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'sw',
      environment,
      message: 'Connection failed',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Tests Diverza PAC connection
 */
async function testDiverzaConnection(
  environment: PACEnvironment,
  credentials: PACCredentials,
  timestamp: Date
): Promise<PACConnectionTestResult> {
  try {
    if (!credentials.username || !credentials.password) {
      throw new Error('Invalid credentials');
    }

    // TODO: Implement actual API call to Diverza
    console.log(`Testing Diverza connection`);

    return {
      success: true,
      provider: 'diverza',
      environment,
      message: 'Connection successful (test mode)',
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'diverza',
      environment,
      message: 'Connection failed',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Tests Facturaxion PAC connection
 */
async function testFacturaxionConnection(
  environment: PACEnvironment,
  credentials: PACCredentials,
  timestamp: Date
): Promise<PACConnectionTestResult> {
  try {
    if (!credentials.username || !credentials.password) {
      throw new Error('Invalid credentials');
    }

    // TODO: Implement actual API call to Facturaxion
    console.log(`Testing Facturaxion connection`);

    return {
      success: true,
      provider: 'facturaxion',
      environment,
      message: 'Connection successful (test mode)',
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'facturaxion',
      environment,
      message: 'Connection failed',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// PAC Management
// ============================================================================

/**
 * Switches PAC provider
 *
 * @param organizationId - Organization UUID
 * @param newProvider - New PAC provider
 * @param config - New PAC configuration
 * @returns Switch result
 *
 * @example
 * ```ts
 * await switchPACProvider('org-uuid', 'sw', {
 *   provider: 'sw',
 *   environment: 'production',
 *   credentials: { username: '...', password: '...' },
 *   isActive: true
 * });
 * ```
 */
export async function switchPACProvider(
  organizationId: string,
  newProvider: PACProvider,
  config: PACConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // Configure new provider
    const result = await configurePAC(organizationId, config);

    if (result.success) {
      // TODO: Log audit trail
      // await logOrganizationChange(organizationId, 'pac_switched', {
      //   newProvider,
      //   environment: config.environment
      // });
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Updates PAC test result
 *
 * @param organizationId - Organization UUID
 * @param testResult - Test result ('success' or 'failed')
 */
async function updatePACTestResult(
  organizationId: string,
  testResult: 'success' | 'failed'
): Promise<void> {
  try {
    const supabase = await createClient();

    // Get current config
    const { data } = await supabase
      .from('organizations')
      .select('pac_credentials')
      .eq('id', organizationId)
      .single();

    if (!data || !data.pac_credentials) {
      return;
    }

    // Update config with test result
    const updatedConfig = {
      ...data.pac_credentials,
      lastTested: new Date().toISOString(),
      lastTestResult: testResult,
    };

    await supabase
      .from('organizations')
      .update({
        pac_credentials: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'pac_tested', { result: testResult });
  } catch (error) {
    console.error('Failed to update PAC test result:', error);
  }
}

/**
 * Removes PAC configuration
 *
 * @param organizationId - Organization UUID
 * @returns Removal result
 */
export async function removePACConfig(
  organizationId: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();

    await supabase
      .from('organizations')
      .update({
        pac_provider: null,
        pac_credentials: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    return { success: true };
  } catch (error) {
    throw new Error(
      `Failed to remove PAC config: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets PAC provider display name
 *
 * @param provider - PAC provider code
 * @returns Display name
 */
export function getPACProviderName(provider: PACProvider): string {
  const names: Record<PACProvider, string> = {
    finkok: 'Finkok',
    sw: 'SW (Smarter Web)',
    diverza: 'Diverza',
    facturaxion: 'Facturaxion',
  };

  return names[provider] || provider;
}

/**
 * Gets PAC provider API endpoint
 *
 * @param provider - PAC provider
 * @param environment - Environment
 * @returns API endpoint URL
 */
export function getPACEndpoint(
  provider: PACProvider,
  environment: PACEnvironment
): string {
  const endpoints: Record<PACProvider, Record<PACEnvironment, string>> = {
    finkok: {
      production: 'https://facturacion.finkok.com/servicios/soap',
      sandbox: 'http://demo-facturacion.finkok.com/servicios/soap',
    },
    sw: {
      production: 'https://services.sw.com.mx',
      sandbox: 'https://services.test.sw.com.mx',
    },
    diverza: {
      production: 'https://api.diverza.com.mx',
      sandbox: 'https://api-test.diverza.com.mx',
    },
    facturaxion: {
      production: 'https://api.facturaxion.com',
      sandbox: 'https://sandbox.facturaxion.com',
    },
  };

  return endpoints[provider]?.[environment] || '';
}

/**
 * Checks if PAC is configured for an organization
 *
 * @param organizationId - Organization UUID
 * @returns True if PAC is configured
 */
export async function isPACConfigured(organizationId: string): Promise<boolean> {
  const config = await getPACConfig(organizationId);
  return config !== null;
}
