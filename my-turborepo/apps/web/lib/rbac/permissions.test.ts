import { describe, it, expect } from 'vitest'
import {
  RESOURCES,
  CRUD_ACTIONS,
  SPECIAL_ACTIONS,
  ALL_ACTIONS,
  RESOURCE_PERMISSIONS,
} from './permissions'

describe('RBAC Permissions', () => {
  describe('Constants', () => {
    it('should have correct resources defined', () => {
      expect(RESOURCES).toEqual([
        'invoice',
        'customer',
        'product',
        'expense',
        'user',
        'organization',
        'report',
        'settings',
      ])
      expect(RESOURCES).toHaveLength(8)
    })

    it('should have correct CRUD actions', () => {
      expect(CRUD_ACTIONS).toEqual(['create', 'read', 'update', 'delete'])
      expect(CRUD_ACTIONS).toHaveLength(4)
    })

    it('should have correct special actions', () => {
      expect(SPECIAL_ACTIONS).toEqual([
        'approve',
        'reject',
        'export',
        'import',
        'invite',
        'remove',
        'cancel',
        'stamp',
      ])
      expect(SPECIAL_ACTIONS).toHaveLength(8)
    })

    it('should combine all actions correctly', () => {
      expect(ALL_ACTIONS).toContain('create')
      expect(ALL_ACTIONS).toContain('read')
      expect(ALL_ACTIONS).toContain('approve')
      expect(ALL_ACTIONS).toContain('stamp')
      expect(ALL_ACTIONS).toHaveLength(12)
    })
  })

  describe('Resource Permissions', () => {
    it('should define permissions for all resources', () => {
      RESOURCES.forEach((resource) => {
        expect(RESOURCE_PERMISSIONS[resource]).toBeDefined()
        expect(Array.isArray(RESOURCE_PERMISSIONS[resource])).toBe(true)
      })
    })

    it('invoice should have correct permissions', () => {
      const invoicePerms = RESOURCE_PERMISSIONS.invoice
      expect(invoicePerms).toContain('create')
      expect(invoicePerms).toContain('read')
      expect(invoicePerms).toContain('update')
      expect(invoicePerms).toContain('delete')
      expect(invoicePerms).toContain('approve')
      expect(invoicePerms).toContain('cancel')
      expect(invoicePerms).toContain('stamp')
      expect(invoicePerms).toContain('export')
    })

    it('customer should have CRUD + export permissions', () => {
      const customerPerms = RESOURCE_PERMISSIONS.customer
      expect(customerPerms).toContain('create')
      expect(customerPerms).toContain('read')
      expect(customerPerms).toContain('update')
      expect(customerPerms).toContain('delete')
      expect(customerPerms).toContain('export')
      expect(customerPerms).toContain('import')
    })

    it('user should have restricted permissions', () => {
      const userPerms = RESOURCE_PERMISSIONS.user
      expect(userPerms).toContain('read')
      expect(userPerms).toContain('invite')
      expect(userPerms).toContain('remove')
      expect(userPerms).not.toContain('create')
      expect(userPerms).not.toContain('delete')
    })

    it('organization should have minimal permissions', () => {
      const orgPerms = RESOURCE_PERMISSIONS.organization
      expect(orgPerms).toContain('read')
      expect(orgPerms).toContain('update')
      expect(orgPerms).toHaveLength(2)
    })

    it('expense should have approval permissions', () => {
      const expensePerms = RESOURCE_PERMISSIONS.expense
      expect(expensePerms).toContain('approve')
      expect(expensePerms).toContain('reject')
    })

    it('report should have export permission', () => {
      const reportPerms = RESOURCE_PERMISSIONS.report
      expect(reportPerms).toContain('read')
      expect(reportPerms).toContain('export')
    })
  })

  describe('Permission Validation', () => {
    it('should have valid actions for each resource', () => {
      RESOURCES.forEach((resource) => {
        const permissions = RESOURCE_PERMISSIONS[resource]
        permissions.forEach((action) => {
          expect(ALL_ACTIONS).toContain(action)
        })
      })
    })

    it('should not have duplicate permissions', () => {
      RESOURCES.forEach((resource) => {
        const permissions = RESOURCE_PERMISSIONS[resource]
        const uniquePerms = [...new Set(permissions)]
        expect(permissions).toHaveLength(uniquePerms.length)
      })
    })
  })
})
