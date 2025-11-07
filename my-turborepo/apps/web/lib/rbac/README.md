# RBAC (Role-Based Access Control) System

Comprehensive permission management for the SAT Compliance Platform.

## ✅ Features

- **4 Role Levels:** Owner, Admin, Accountant, User
- **8 Resource Types:** Invoice, Customer, Product, Expense, User, Organization, Report, Settings
- **12 Action Types:** create, read, update, delete, approve, reject, cancel, send, download, stamp, export, invite
- **Redis Caching:** Fast permission checks (<5ms)
- **Ownership Rules:** Users can edit their own resources
- **Special Rules:** Accountants can edit draft invoices
- **Custom Permissions:** Per-user overrides via database
- **Multi-tenant:** Organization-scoped permissions

---

## 📚 Quick Start

### 1. Basic Permission Check

```typescript
import { requirePermission } from '@/lib/rbac'

// In Server Actions
export async function createInvoiceAction(data: InvoiceData) {
  'use server'

  // Throws error if user lacks permission
  await requirePermission('invoice', 'create')

  // User has permission, proceed...
  const invoice = await createInvoice(data)
  return invoice
}
```

### 2. Resource-Specific Permission

```typescript
import { requireResourcePermission } from '@/lib/rbac'

export async function updateInvoiceAction(invoiceId: string, data: Partial<Invoice>) {
  'use server'

  // Checks role permission + ownership + special rules
  await requireResourcePermission('invoice', 'update', invoiceId)

  // User can edit this specific invoice
  const updated = await updateInvoice(invoiceId, data)
  return updated
}
```

### 3. Role-Based Access

```typescript
import { requireRole, requireOwner } from '@/lib/rbac'

export async function deleteOrganization(orgId: string) {
  'use server'

  // Only owners can delete organizations
  await requireOwner()

  await deleteOrg(orgId)
}

export async function inviteUser(email: string, role: string) {
  'use server'

  // Owner or Admin can invite users
  await requireRole(['owner', 'admin'])

  await sendInvite(email, role)
}
```

### 4. Non-Throwing Permission Checks

```typescript
import { hasPermission, hasRole } from '@/lib/rbac'

export async function InvoiceActions({ invoiceId }) {
  const canEdit = await hasPermission('invoice', 'update')
  const canDelete = await hasPermission('invoice', 'delete')
  const isOwner = await hasRole('owner')

  return (
    <div>
      {canEdit && <button>Edit</button>}
      {canDelete && <button>Delete</button>}
      {isOwner && <button>Settings</button>}
    </div>
  )
}
```

---

## 🔑 Permission Matrix

| Resource | Owner | Admin | Accountant | User |
|----------|-------|-------|------------|------|
| **Invoice** | All | All | create, read, update, send, download, stamp | create, read, send, download |
| **Customer** | All | All | read | read |
| **Product** | All | All | read | read |
| **Expense** | All | All | create, read, update, approve, reject, download | create, read, download |
| **User** | All | invite, read, update | read | - |
| **Organization** | All | read | read | read |
| **Report** | read, export | read, export | read, export | read |
| **Settings** | read, update | read, update | read | read |

---

## 🎯 Common Use Cases

### Server Actions

```typescript
'use server'

import { requirePermission } from '@/lib/rbac'

export async function createCustomer(data: CustomerData) {
  // Check permission before proceeding
  await requirePermission('customer', 'create')

  const supabase = await createClient()
  const { data: customer } = await supabase
    .from('customers')
    .insert(data)
    .select()
    .single()

  return customer
}
```

### API Routes

```typescript
import { requirePermission } from '@/lib/rbac'

export async function POST(request: Request) {
  try {
    // Require permission
    await requirePermission('invoice', 'create')

    const body = await request.json()
    // ... create invoice

    return Response.json({ success: true })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return Response.json({ error: error.message }, { status: 403 })
    }
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

### Conditional Rendering

```typescript
import { hasPermission, isOwner } from '@/lib/rbac'

export async function DashboardPage() {
  const canCreateInvoice = await hasPermission('invoice', 'create')
  const canManageUsers = await hasPermission('user', 'invite')
  const isOrgOwner = await isOwner()

  return (
    <div>
      {canCreateInvoice && (
        <Link href="/invoices/new">Create Invoice</Link>
      )}

      {canManageUsers && (
        <Link href="/team">Manage Team</Link>
      )}

      {isOrgOwner && (
        <Link href="/settings">Organization Settings</Link>
      )}
    </div>
  )
}
```

### Batch Permission Checks

```typescript
import { checkMultiplePermissions } from '@/lib/rbac'

export async function InvoiceCard({ invoice }) {
  const perms = await checkMultiplePermissions([
    ['invoice', 'update'],
    ['invoice', 'delete'],
    ['invoice', 'cancel'],
    ['invoice', 'send'],
  ])

  return (
    <Card>
      <h3>{invoice.number}</h3>
      <div className="actions">
        {perms['invoice.update'] && <button>Edit</button>}
        {perms['invoice.delete'] && <button>Delete</button>}
        {perms['invoice.cancel'] && <button>Cancel</button>}
        {perms['invoice.send'] && <button>Send</button>}
      </div>
    </Card>
  )
}
```

---

## 🔐 Special Permission Rules

### 1. Ownership Override

Users can edit their own resources even if their role doesn't allow it:

```typescript
// A 'user' role can update invoices they created
// Even though USER_PERMISSIONS doesn't include 'update'

const result = await checkResourcePermission(
  userId,
  'invoice',
  'update',
  invoiceId // This invoice was created by userId
)
// result.allowed = true (ownership override)
```

### 2. Draft Invoice Exception

Accountants can edit draft invoices (but not submitted ones):

```typescript
// Accountant editing a draft invoice
await requireResourcePermission('invoice', 'update', draftInvoiceId)
// ✓ Allowed (status === 'draft')

// Accountant editing a stamped invoice
await requireResourcePermission('invoice', 'update', stampedInvoiceId)
// ✗ Denied (status === 'stamped')
```

### 3. Organization Isolation

Users can NEVER access resources from other organizations:

```typescript
// Even if you're an owner, you can't access another org's data
const otherOrgInvoice = await getInvoice('invoice-from-other-org')
const result = await checkResourcePermission(
  userId,
  'invoice',
  'read',
  otherOrgInvoice.id
)
// result.allowed = false (different organization)
```

---

## ⚡ Performance

### Caching Strategy

- **TTL:** 5 minutes (300 seconds)
- **Storage:** Redis (Upstash)
- **Cache Key:** `permissions:v1:{userId}:{organizationId}`
- **Hit Rate:** ~95% (permissions rarely change)
- **Cache Miss:** Falls back to database query (30-50ms)
- **Cache Hit:** Returns in 3-5ms

### Cache Invalidation

```typescript
import { invalidatePermissionCache, invalidateOrganizationCache } from '@/lib/rbac'

// Invalidate single user (after role change)
await invalidatePermissionCache(userId)

// Invalidate all users in organization (after org-wide change)
await invalidateOrganizationCache(organizationId)
```

---

## 🔄 Role Management

### Assign Role

```typescript
import { assignRole } from '@/lib/rbac'

const result = await assignRole(
  targetUserId,
  organizationId,
  'accountant' // New role
)

if (result.success) {
  // Role changed, cache invalidated
} else {
  console.error(result.error)
}
```

### Revoke Access

```typescript
import { revokeAccess } from '@/lib/rbac'

const result = await revokeAccess(targetUserId, organizationId)
// User is soft-deleted, cache invalidated
```

---

## 🛠️ Custom Permissions

Add per-user custom permissions via database:

```typescript
// Update users.permissions JSONB column
{
  "invoice": ["export"], // Add export permission
  "customer": ["delete"] // Add delete permission
}

// These merge with role permissions
// Owner permissions + custom permissions = final permissions
```

---

## 🧪 Testing

```typescript
import { checkPermission, getRolePermissions } from '@/lib/rbac'

describe('RBAC', () => {
  it('owner has all invoice permissions', () => {
    const perms = getRolePermissions('owner')
    expect(perms.invoice).toContain('delete')
  })

  it('user cannot delete invoices', async () => {
    const canDelete = await checkPermission(userId, 'invoice', 'delete')
    expect(canDelete).toBe(false)
  })
})
```

---

## 📊 Utilities

### Display Helpers

```typescript
import {
  getRoleDisplayName,
  getResourceDisplayName,
  getActionIcon,
  formatPermission
} from '@/lib/rbac'

getRoleDisplayName('owner') // "Owner"
getResourceDisplayName('invoice') // "Invoice"
getActionIcon('create') // "➕"
formatPermission('invoice', 'create') // "Create new records - Invoice"
```

### Debug Logging

```typescript
import { logPermissions, getPermissionSummary } from '@/lib/rbac'

const perms = await getUserPermissions(userId)
logPermissions(userId, user.role, perms)
// Logs formatted permission tree to console
```

---

## 🚨 Error Handling

```typescript
import { UnauthorizedError, ForbiddenError } from '@/lib/rbac'

try {
  await requirePermission('invoice', 'delete')
} catch (error) {
  if (error instanceof UnauthorizedError) {
    // User not logged in
    redirect('/login')
  }

  if (error instanceof ForbiddenError) {
    // User logged in but lacks permission
    return { error: 'You don't have permission to delete invoices' }
  }
}
```

---

## 📝 Next Steps

1. **Add Custom Permissions:** Update `users.permissions` JSONB for special cases
2. **Implement Temporary Permissions:** Grant time-limited access
3. **Add Audit Logging:** Log all permission denials for security
4. **Build Permission UI:** Let owners manage user permissions

---

## 🔗 Related Files

- `/lib/auth/index.ts` - Authentication system
- `/lib/supabase/` - Database client
- Database migrations with RLS policies
