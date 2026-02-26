/**
 * Organization Settings Management
 *
 * This file handles organization-specific settings including:
 * - Invoice defaults (series, folio, payment terms)
 * - Notification preferences
 * - UI preferences (language, theme, timezone)
 * - Advanced settings (backup, audit log)
 */

import { createClient } from '@/lib/supabase/server';
import type { OrganizationSettings } from './types';
import { DEFAULT_ORGANIZATION_SETTINGS } from './types';
import { getOrganization } from './service';

// ============================================================================
// Settings Retrieval
// ============================================================================

/**
 * Gets organization settings
 *
 * @param organizationId - Organization UUID
 * @returns Organization settings (with defaults if not set)
 *
 * @example
 * ```ts
 * const settings = await getSettings('org-uuid');
 * console.log('Default series:', settings.invoice.default_series);
 * console.log('Language:', settings.ui.language);
 * ```
 */
export async function getSettings(
  organizationId: string
): Promise<OrganizationSettings> {
  try {
    const org = await getOrganization(organizationId);

    if (!org) {
      throw new Error('Organization not found');
    }

    // Merge with defaults to ensure all fields exist
    const settings = mergeWithDefaults(org.settings || {});

    return settings;
  } catch (error) {
    throw new Error(
      `Failed to get settings: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets default settings
 *
 * @returns Default organization settings
 */
export function getDefaultSettings(): OrganizationSettings {
  return { ...DEFAULT_ORGANIZATION_SETTINGS };
}

// ============================================================================
// Settings Update
// ============================================================================

/**
 * Updates organization settings
 *
 * @param organizationId - Organization UUID
 * @param settings - New settings (partial update supported)
 * @returns Updated settings
 *
 * @example
 * ```ts
 * await updateSettings('org-uuid', {
 *   invoice: {
 *     default_series: 'B',
 *     default_payment_terms: 15
 *   },
 *   notifications: {
 *     email_on_invoice_created: false
 *   }
 * });
 * ```
 */
export async function updateSettings(
  organizationId: string,
  settings: Partial<OrganizationSettings>
): Promise<OrganizationSettings> {
  try {
    // Get current settings
    const currentSettings = await getSettings(organizationId);

    // Deep merge with current settings
    const updatedSettings = deepMerge(currentSettings, settings);

    // Validate settings
    const validation = validateSettings(updatedSettings);
    if (!validation.valid) {
      throw new Error(`Settings validation failed: ${validation.errors.join(', ')}`);
    }

    // Update in database
    const supabase = await createClient();
    const { error } = await supabase
      .from('organizations')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (error) {
      throw error;
    }

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'settings_updated', settings);

    return updatedSettings;
  } catch (error) {
    throw new Error(
      `Failed to update settings: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Resets organization settings to defaults
 *
 * @param organizationId - Organization UUID
 * @returns Default settings
 *
 * @example
 * ```ts
 * await resetSettings('org-uuid');
 * ```
 */
export async function resetSettings(
  organizationId: string
): Promise<OrganizationSettings> {
  try {
    const defaultSettings = getDefaultSettings();

    const supabase = await createClient();
    const { error } = await supabase
      .from('organizations')
      .update({
        settings: defaultSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (error) {
      throw error;
    }

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'settings_reset', {});

    return defaultSettings;
  } catch (error) {
    throw new Error(
      `Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Specific Setting Updates
// ============================================================================

/**
 * Updates invoice settings only
 *
 * @param organizationId - Organization UUID
 * @param invoiceSettings - Invoice settings
 * @returns Updated full settings
 */
export async function updateInvoiceSettings(
  organizationId: string,
  invoiceSettings: Partial<OrganizationSettings['invoice']>
): Promise<OrganizationSettings> {
  return await updateSettings(organizationId, { invoice: invoiceSettings as any });
}

/**
 * Updates notification settings only
 *
 * @param organizationId - Organization UUID
 * @param notificationSettings - Notification settings
 * @returns Updated full settings
 */
export async function updateNotificationSettings(
  organizationId: string,
  notificationSettings: Partial<OrganizationSettings['notifications']>
): Promise<OrganizationSettings> {
  return await updateSettings(organizationId, {
    notifications: notificationSettings as any,
  });
}

/**
 * Updates UI settings only
 *
 * @param organizationId - Organization UUID
 * @param uiSettings - UI settings
 * @returns Updated full settings
 */
export async function updateUISettings(
  organizationId: string,
  uiSettings: Partial<OrganizationSettings['ui']>
): Promise<OrganizationSettings> {
  return await updateSettings(organizationId, { ui: uiSettings as any });
}

/**
 * Updates advanced settings only
 *
 * @param organizationId - Organization UUID
 * @param advancedSettings - Advanced settings
 * @returns Updated full settings
 */
export async function updateAdvancedSettings(
  organizationId: string,
  advancedSettings: Partial<OrganizationSettings['advanced']>
): Promise<OrganizationSettings> {
  return await updateSettings(organizationId, { advanced: advancedSettings as any });
}

// ============================================================================
// Settings Validation
// ============================================================================

/**
 * Validates organization settings
 *
 * @param settings - Settings to validate
 * @returns Validation result
 */
export function validateSettings(
  settings: OrganizationSettings
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate invoice settings
  if (settings.invoice) {
    if (
      settings.invoice.default_series &&
      settings.invoice.default_series.length > 25
    ) {
      errors.push('Default series must be 25 characters or less');
    }

    if (
      settings.invoice.default_folio_start !== undefined &&
      settings.invoice.default_folio_start < 1
    ) {
      errors.push('Default folio start must be at least 1');
    }

    if (
      settings.invoice.default_payment_terms !== undefined &&
      settings.invoice.default_payment_terms < 0
    ) {
      errors.push('Default payment terms cannot be negative');
    }

    if (
      settings.invoice.default_payment_method &&
      !['PUE', 'PPD'].includes(settings.invoice.default_payment_method)
    ) {
      errors.push('Default payment method must be PUE or PPD');
    }
  }

  // Validate notifications
  if (settings.notifications) {
    if (
      settings.notifications.reminder_days_before !== undefined &&
      settings.notifications.reminder_days_before < 0
    ) {
      errors.push('Reminder days before cannot be negative');
    }
  }

  // Validate UI settings
  if (settings.ui) {
    if (settings.ui.language && !['es', 'en'].includes(settings.ui.language)) {
      errors.push('Language must be "es" or "en"');
    }

    if (
      settings.ui.theme &&
      !['light', 'dark', 'system'].includes(settings.ui.theme)
    ) {
      errors.push('Theme must be "light", "dark", or "system"');
    }
  }

  // Validate advanced settings
  if (settings.advanced) {
    if (
      settings.advanced.backup_frequency &&
      !['daily', 'weekly', 'monthly'].includes(settings.advanced.backup_frequency)
    ) {
      errors.push('Backup frequency must be "daily", "weekly", or "monthly"');
    }

    if (
      settings.advanced.session_timeout !== undefined &&
      settings.advanced.session_timeout < 5
    ) {
      errors.push('Session timeout must be at least 5 minutes');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merges settings with defaults
 * Ensures all required fields exist
 *
 * @param settings - Partial settings
 * @returns Complete settings with defaults
 */
function mergeWithDefaults(
  settings: Partial<OrganizationSettings>
): OrganizationSettings {
  const defaults = getDefaultSettings();
  return deepMerge(defaults, settings);
}

/**
 * Deep merge two objects
 *
 * @param target - Target object
 * @param source - Source object
 * @returns Merged object
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target } as T;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge objects
        (result as any)[key] = deepMerge(targetValue as Record<string, any>, sourceValue as Partial<Record<string, any>>);
      } else if (sourceValue !== undefined) {
        // Override with source value
        (result as any)[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Gets a specific setting value by path
 *
 * @param settings - Organization settings
 * @param path - Setting path (e.g., 'invoice.default_series')
 * @returns Setting value or undefined
 *
 * @example
 * ```ts
 * const series = getSetting(settings, 'invoice.default_series');
 * const language = getSetting(settings, 'ui.language');
 * ```
 */
export function getSetting(
  settings: OrganizationSettings,
  path: string
): any {
  const keys = path.split('.');
  let value: any = settings;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Sets a specific setting value by path
 *
 * @param settings - Organization settings
 * @param path - Setting path (e.g., 'invoice.default_series')
 * @param value - New value
 * @returns Updated settings
 *
 * @example
 * ```ts
 * const updated = setSetting(settings, 'invoice.default_series', 'C');
 * ```
 */
export function setSetting(
  settings: OrganizationSettings,
  path: string,
  value: any
): OrganizationSettings {
  const keys = path.split('.');
  const result = { ...settings };
  let current: any = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    } else {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1]!;
  current[lastKey] = value;
  return result;
}

/**
 * Exports settings as JSON
 *
 * @param organizationId - Organization UUID
 * @returns Settings JSON string
 */
export async function exportSettings(organizationId: string): Promise<string> {
  const settings = await getSettings(organizationId);
  return JSON.stringify(settings, null, 2);
}

/**
 * Imports settings from JSON
 *
 * @param organizationId - Organization UUID
 * @param settingsJson - Settings JSON string
 * @returns Updated settings
 */
export async function importSettings(
  organizationId: string,
  settingsJson: string
): Promise<OrganizationSettings> {
  try {
    const settings = JSON.parse(settingsJson) as OrganizationSettings;
    return await updateSettings(organizationId, settings);
  } catch (error) {
    throw new Error(
      `Failed to import settings: ${error instanceof Error ? error.message : 'Invalid JSON'}`
    );
  }
}
