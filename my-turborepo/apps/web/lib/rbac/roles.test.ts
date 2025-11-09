import { describe, it, expect } from 'vitest'
import { ROLE_PERMISSIONS, canRoleAssignRole, OWNERSHIP_OVERRIDES } from './roles'
import type { Role, Resource, Action } from './types'

describe('RBAC Roles', () => {
  describe('Role Permissions', () => {
    it('should define permissions for all roles', () => {
      const roles: Role[] = ['owner', 'admin', 'accountant', 'user']
      roles.forEach((role) => {
        expect(ROLE_PERMISSIONS[role]).toBeDefined()
        expect(typeof ROLE_PERMISSIONS[role]).toBe('object')
      })
    })

    describe('Owner Role', () => {
      const ownerPerms = ROLE_PERMISSIONS.owner

      it('should have full access to all resources', () => {
        const resources: Resource[] = [
          'invoice',
          'customer',
          'product',
          'expense',
          'user',
          'organization',
          'report',
          'settings',
        ]

        resources.forEach((resource) => {
          expect(ownerPerms[resource]).toBeDefined()
          expect(Array.isArray(ownerPerms[resource])).toBe(true)
          expect(ownerPerms[resource].length).toBeGreaterThan(0)
        })
      })

      it('should have all invoice permissions', () => {
        expect(ownerPerms.invoice).toContain('create')
        expect(ownerPerms.invoice).toContain('read')
        expect(ownerPerms.invoice).toContain('update')
        expect(ownerPerms.invoice).toContain('delete')
        expect(ownerPerms.invoice).toContain('approve')
        expect(ownerPerms.invoice).toContain('cancel')
        expect(ownerPerms.invoice).toContain('stamp')
      })

      it('should be able to invite and remove users', () => {
        expect(ownerPerms.user).toContain('invite')
        expect(ownerPerms.user).toContain('remove')
      })

      it('should be able to update organization', () => {
        expect(ownerPerms.organization).toContain('update')
      })
    })

    describe('Admin Role', () => {
      const adminPerms = ROLE_PERMISSIONS.admin

      it('should have most permissions but not all', () => {
        expect(adminPerms.invoice).toBeDefined()
        expect(adminPerms.user).toBeDefined()
        expect(adminPerms.organization).toBeDefined()
      })

      it('should be able to manage invoices', () => {
        expect(adminPerms.invoice).toContain('create')
        expect(adminPerms.invoice).toContain('read')
        expect(adminPerms.invoice).toContain('update')
        expect(adminPerms.invoice).toContain('approve')
      })

      it('should be able to invite users', () => {
        expect(adminPerms.user).toContain('invite')
      })

      it('should be able to read organization but not update', () => {
        expect(adminPerms.organization).toContain('read')
        expect(adminPerms.organization).not.toContain('update')
      })

      it('should have settings access', () => {
        expect(adminPerms.settings).toContain('read')
        expect(adminPerms.settings).toContain('update')
      })
    })

    describe('Accountant Role', () => {
      const accountantPerms = ROLE_PERMISSIONS.accountant

      it('should have limited permissions focused on accounting', () => {
        expect(accountantPerms.invoice).toBeDefined()
        expect(accountantPerms.expense).toBeDefined()
        expect(accountantPerms.report).toBeDefined()
      })

      it('should be able to manage invoices', () => {
        expect(accountantPerms.invoice).toContain('create')
        expect(accountantPerms.invoice).toContain('read')
        expect(accountantPerms.invoice).toContain('update')
      })

      it('should be able to approve expenses', () => {
        expect(accountantPerms.expense).toContain('approve')
        expect(accountantPerms.expense).toContain('reject')
      })

      it('should be able to export reports', () => {
        expect(accountantPerms.report).toContain('read')
        expect(accountantPerms.report).toContain('export')
      })

      it('should not be able to manage users', () => {
        expect(accountantPerms.user).toEqual(['read'])
      })

      it('should not be able to change settings', () => {
        expect(accountantPerms.settings).toEqual(['read'])
      })
    })

    describe('User Role', () => {
      const userPerms = ROLE_PERMISSIONS.user

      it('should have minimal permissions', () => {
        expect(userPerms.invoice).toContain('read')
        expect(userPerms.customer).toContain('read')
        expect(userPerms.product).toContain('read')
      })

      it('should not be able to create invoices', () => {
        expect(userPerms.invoice).not.toContain('create')
      })

      it('should not be able to manage users', () => {
        expect(userPerms.user).toEqual(['read'])
      })

      it('should not be able to approve or reject', () => {
        expect(userPerms.expense).not.toContain('approve')
        expect(userPerms.expense).not.toContain('reject')
      })

      it('should be able to read reports', () => {
        expect(userPerms.report).toContain('read')
      })
    })
  })

  describe('Role Assignment Rules', () => {
    describe('Owner can assign any role', () => {
      it('can assign owner', () => {
        expect(canRoleAssignRole('owner', 'owner')).toBe(true)
      })

      it('can assign admin', () => {
        expect(canRoleAssignRole('owner', 'admin')).toBe(true)
      })

      it('can assign accountant', () => {
        expect(canRoleAssignRole('owner', 'accountant')).toBe(true)
      })

      it('can assign user', () => {
        expect(canRoleAssignRole('owner', 'user')).toBe(true)
      })
    })

    describe('Admin can assign limited roles', () => {
      it('cannot assign owner', () => {
        expect(canRoleAssignRole('admin', 'owner')).toBe(false)
      })

      it('cannot assign admin', () => {
        expect(canRoleAssignRole('admin', 'admin')).toBe(false)
      })

      it('can assign accountant', () => {
        expect(canRoleAssignRole('admin', 'accountant')).toBe(true)
      })

      it('can assign user', () => {
        expect(canRoleAssignRole('admin', 'user')).toBe(true)
      })
    })

    describe('Accountant cannot assign roles', () => {
      it('cannot assign owner', () => {
        expect(canRoleAssignRole('accountant', 'owner')).toBe(false)
      })

      it('cannot assign admin', () => {
        expect(canRoleAssignRole('accountant', 'admin')).toBe(false)
      })

      it('cannot assign accountant', () => {
        expect(canRoleAssignRole('accountant', 'accountant')).toBe(false)
      })

      it('cannot assign user', () => {
        expect(canRoleAssignRole('accountant', 'user')).toBe(false)
      })
    })

    describe('User cannot assign roles', () => {
      it('cannot assign any role', () => {
        expect(canRoleAssignRole('user', 'owner')).toBe(false)
        expect(canRoleAssignRole('user', 'admin')).toBe(false)
        expect(canRoleAssignRole('user', 'accountant')).toBe(false)
        expect(canRoleAssignRole('user', 'user')).toBe(false)
      })
    })
  })

  describe('Ownership Overrides', () => {
    it('should define ownership overrides', () => {
      expect(OWNERSHIP_OVERRIDES).toBeDefined()
      expect(typeof OWNERSHIP_OVERRIDES).toBe('object')
    })

    it('should allow invoice updates by creator', () => {
      const invoiceOverrides = OWNERSHIP_OVERRIDES.invoice
      expect(invoiceOverrides).toContain('update')
    })

    it('should allow customer updates by creator', () => {
      const customerOverrides = OWNERSHIP_OVERRIDES.customer
      expect(customerOverrides).toContain('update')
    })

    it('should allow expense updates by creator', () => {
      const expenseOverrides = OWNERSHIP_OVERRIDES.expense
      expect(expenseOverrides).toContain('update')
    })

    it('should not allow deletion through ownership', () => {
      Object.values(OWNERSHIP_OVERRIDES).forEach((actions) => {
        expect(actions).not.toContain('delete')
      })
    })
  })

  describe('Permission Hierarchy', () => {
    it('owner should have more permissions than admin', () => {
      const ownerInvoicePerms = ROLE_PERMISSIONS.owner.invoice.length
      const adminInvoicePerms = ROLE_PERMISSIONS.admin.invoice.length
      expect(ownerInvoicePerms).toBeGreaterThanOrEqual(adminInvoicePerms)
    })

    it('admin should have more permissions than accountant', () => {
      const adminUserPerms = ROLE_PERMISSIONS.admin.user.length
      const accountantUserPerms = ROLE_PERMISSIONS.accountant.user.length
      expect(adminUserPerms).toBeGreaterThanOrEqual(accountantUserPerms)
    })

    it('accountant should have more permissions than user', () => {
      const accountantInvoicePerms = ROLE_PERMISSIONS.accountant.invoice.length
      const userInvoicePerms = ROLE_PERMISSIONS.user.invoice.length
      expect(accountantInvoicePerms).toBeGreaterThanOrEqual(userInvoicePerms)
    })
  })
})
