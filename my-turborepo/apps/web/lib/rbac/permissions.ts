/**
 * Resource Permission Definitions
 *
 * Defines what actions are available for each resource type
 */

import type { Action, Resource, ResourcePermissions } from './types'

// ============================================
// RESOURCE-SPECIFIC PERMISSIONS
// ============================================

/**
 * Invoice permissions
 * Invoices require special SAT compliance actions
 */
export const INVOICE_PERMISSIONS: Action[] = [
  'create',   // Create new draft invoice
  'read',     // View invoices
  'update',   // Edit draft invoices
  'delete',   // Delete draft invoices (soft delete)
  'approve',  // Approve invoice before stamping
  'cancel',   // Cancel stamped invoice (SAT process)
  'send',     // Send invoice via email/WhatsApp
  'download', // Download PDF/XML
  'stamp',    // Request PAC stamping (CFDI)
]

/**
 * Customer permissions
 * Managing customer/client database
 */
export const CUSTOMER_PERMISSIONS: Action[] = [
  'create',   // Add new customer
  'read',     // View customers
  'update',   // Edit customer info
  'delete',   // Delete customer (soft delete)
]

/**
 * Product permissions
 * Managing product/service catalog
 */
export const PRODUCT_PERMISSIONS: Action[] = [
  'create',   // Add new product/service
  'read',     // View products
  'update',   // Edit product info
  'delete',   // Delete product (soft delete)
]

/**
 * Expense permissions
 * Tracking deductible expenses
 */
export const EXPENSE_PERMISSIONS: Action[] = [
  'create',   // Submit expense claim
  'read',     // View expenses
  'update',   // Edit expense details
  'delete',   // Delete expense (soft delete)
  'approve',  // Approve expense claim
  'reject',   // Reject expense claim
  'download', // Download receipts/XML
]

/**
 * User permissions
 * Managing team members
 */
export const USER_PERMISSIONS: Action[] = [
  'read',     // View team members
  'invite',   // Invite new users
  'update',   // Edit user roles/permissions
  'delete',   // Remove users (soft delete)
]

/**
 * Organization permissions
 * Managing organization settings
 */
export const ORGANIZATION_PERMISSIONS: Action[] = [
  'read',     // View organization info
  'update',   // Update organization settings
  'delete',   // Delete organization (owner only)
]

/**
 * Report permissions
 * Tax reports and analytics
 */
export const REPORT_PERMISSIONS: Action[] = [
  'read',     // View reports
  'export',   // Export reports (PDF/Excel)
]

/**
 * Settings permissions
 * System configuration
 */
export const SETTINGS_PERMISSIONS: Action[] = [
  'read',     // View settings
  'update',   // Modify settings
]

// ============================================
// RESOURCE PERMISSION MAP
// ============================================

/**
 * Map of all available permissions per resource
 */
export const RESOURCE_PERMISSION_MAP: Record<Resource, Action[]> = {
  invoice: INVOICE_PERMISSIONS,
  customer: CUSTOMER_PERMISSIONS,
  product: PRODUCT_PERMISSIONS,
  expense: EXPENSE_PERMISSIONS,
  user: USER_PERMISSIONS,
  organization: ORGANIZATION_PERMISSIONS,
  report: REPORT_PERMISSIONS,
  settings: SETTINGS_PERMISSIONS,
}

/**
 * Get all available actions for a resource type
 */
export function getResourcePermissions(resource: Resource): Action[] {
  return RESOURCE_PERMISSION_MAP[resource] || []
}

/**
 * Check if an action is valid for a resource
 */
export function isValidActionForResource(
  resource: Resource,
  action: Action
): boolean {
  const validActions = RESOURCE_PERMISSION_MAP[resource]
  return validActions.includes(action)
}

// ============================================
// PERMISSION DESCRIPTIONS (for UI)
// ============================================

/**
 * Human-readable descriptions for actions
 */
export const ACTION_DESCRIPTIONS: Record<Action, string> = {
  // CRUD
  create: 'Create new records',
  read: 'View and access records',
  update: 'Edit existing records',
  delete: 'Remove records',

  // Special
  approve: 'Approve pending items',
  reject: 'Reject submissions',
  cancel: 'Cancel submitted items',
  send: 'Send via email or WhatsApp',
  download: 'Download files',
  stamp: 'Request SAT stamping',
  export: 'Export data',
  invite: 'Invite team members',
}

/**
 * Human-readable resource names (for UI)
 */
export const RESOURCE_NAMES: Record<Resource, { singular: string; plural: string }> = {
  invoice: { singular: 'Invoice', plural: 'Invoices' },
  customer: { singular: 'Customer', plural: 'Customers' },
  product: { singular: 'Product', plural: 'Products' },
  expense: { singular: 'Expense', plural: 'Expenses' },
  user: { singular: 'User', plural: 'Users' },
  organization: { singular: 'Organization', plural: 'Organizations' },
  report: { singular: 'Report', plural: 'Reports' },
  settings: { singular: 'Setting', plural: 'Settings' },
}
