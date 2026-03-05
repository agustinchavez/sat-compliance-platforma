I'm building a SAT Compliance Platform - a cloud-based CFDI invoicing and tax compliance system for Mexican SMEs (small and medium enterprises).

## 🎯 PROJECT OVERVIEW

**Purpose:** Enable Mexican businesses to create legally compliant CFDI 4.0 invoices, manage customers, track expenses, and handle tax compliance - all in a modern, cloud-based platform.

**Tech Stack:**

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/ui
- **Backend:** Next.js API Routes, tRPC, PostgreSQL (Supabase)
- **AI Services:** Python FastAPI, sentence-transformers, pgvector
- **Infrastructure:** Vercel (frontend), Railway/Render (AI service), Redis (sessions/cache)
- **Storage:** Cloudflare R2 or AWS S3 (for XML/PDF files)

**Core Architecture Principles:**

1. **Multi-tenant:** All data scoped to `organization_id` with Row-Level Security
2. **Type-safe:** TypeScript end-to-end, Zod for validation
3. **Modular:** Each component is self-contained with clear interfaces
4. **Secure:** Encryption for sensitive data (CSD certificates, PAC credentials), RBAC for access control
5. **Testable:** Unit tests for business logic, integration tests for workflows

---

## ✅ WHAT'S ALREADY BUILT

### Component 1: User Authentication ✓

- ✅ Supabase Auth integration (signup, login, logout, email verification)
- ✅ Database schema with `users` and `organizations` tables
- ✅ User roles stored in database: `owner`, `admin`, `accountant`, `user`
- ✅ Row Level Security (RLS) policies for multi-tenant data isolation
- ✅ Auth helper functions in `lib/auth/index.ts`:
  - `getCurrentUser()` - Get authenticated user
  - `requireAuth()` - Require authentication
  - `requireRole(roles)` - Basic role checking
  - `isOwner()`, `isAdmin()` - Role checkers
- ✅ Protected routes via middleware
- ✅ Organization automatically created during signup (owner role assigned)

### Current Database Structure (correct me if I'm wrong here please)

```sql
-- users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'user',  -- owner, admin, accountant, user
  permissions JSONB DEFAULT '{}',   -- For custom permissions
  email_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  tax_regime VARCHAR(10) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  plan VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, tRPC, PostgreSQL (Supabase)
- **Auth:** Supabase Auth (already integrated)
- **Cache:** Redis (need to integrate for RBAC)
- **File Structure:** `apps/web/` (monorepo structure)

---

## 📋 CURRENT TASK: Component 2 - Role-Based Access Control (RBAC)

Now I need to build a comprehensive RBAC system that goes beyond basic role checking.

### **Component 2: Role-Based Access Control (RBAC)**

**Purpose:** Manage fine-grained permissions and access control across the application based on user roles and resource types.

**Key Requirements:**

1. **Hierarchical Role System**

```
   Owner (highest)
     ↓ Can do everything
   Admin
     ↓ Can manage users, customers, products, invoices
   Accountant
     ↓ Can view/edit invoices, expenses, reports (read-only for settings)
   User (lowest)
     ↓ Can create invoices and expenses (limited access)
```

2. **Permission-Based Actions**

   - **CRUD operations:** `create`, `read`, `update`, `delete`
   - **Special actions:** `approve`, `cancel`, `export`, `invite`
   - **Resource types:** `invoice`, `customer`, `product`, `expense`, `user`, `organization`, `report`, `settings`

3. **Resource-Level Permissions**

   - **Own resources:** Users can edit their own created resources
   - **Organization resources:** Access based on role within organization
   - **Example:**
     - An `accountant` can view all invoices but only edit draft invoices
     - A `user` can only edit invoices they created
     - An `owner` can do anything

4. **Performance: Cached Permission Checks**
   - Permission checks should be fast (<10ms)
   - Cache user permissions in Redis
   - Cache TTL: 5 minutes (invalidate on role change)
   - Cache key structure: `permissions:${userId}:${orgId}`

**Expected Functionality:**

```typescript
// Basic permission check
const canEdit = await checkPermission(userId, "invoice", "update");
// → true/false

// Get all available actions for a resource
const actions = await getAvailableActions(userId, "invoice");
// → ['read', 'create', 'update'] (based on role)

// Check specific resource ownership
const canEditThisInvoice = await checkResourcePermission(
  userId,
  "invoice",
  "update",
  invoiceId
);
// → Checks both role permission AND ownership

// Get user's full permission set
const permissions = await getUserPermissions(userId);
// → { invoice: ['create', 'read', 'update'], customer: ['read'], ... }

// Middleware for route protection
// In API route or server action:
await requirePermission("invoice", "create");
// → Throws error if user lacks permission

// Role management (owner only)
await assignRole(targetUserId, organizationId, "accountant");
await revokeRole(targetUserId, organizationId);
```

**File Structure to Create:**

```
apps/web/lib/rbac/
├── service.ts                    # Core RBAC logic
│   ├── checkPermission(userId, resource, action)
│   ├── checkResourcePermission(userId, resource, action, resourceId)
│   ├── getUserPermissions(userId)
│   ├── getAvailableActions(userId, resourceType)
│   ├── assignRole(userId, organizationId, role)
│   ├── revokeRole(userId, organizationId)
│   ├── canAccessOrganization(userId, organizationId)
│   └── invalidatePermissionCache(userId)
│
├── roles.ts                      # Role definitions
│   ├── OWNER_PERMISSIONS         # All permissions
│   ├── ADMIN_PERMISSIONS         # Most permissions
│   ├── ACCOUNTANT_PERMISSIONS    # Financial focus
│   ├── USER_PERMISSIONS          # Limited permissions
│   └── getRolePermissions(role)
│
├── permissions.ts                # Resource permissions
│   ├── INVOICE_PERMISSIONS       # ['create', 'read', 'update', 'delete', 'approve', 'cancel']
│   ├── CUSTOMER_PERMISSIONS      # ['create', 'read', 'update', 'delete']
│   ├── PRODUCT_PERMISSIONS       # ['create', 'read', 'update', 'delete']
│   ├── EXPENSE_PERMISSIONS       # ['create', 'read', 'update', 'delete', 'approve']
│   ├── USER_PERMISSIONS          # ['read', 'invite', 'update', 'delete']
│   ├── ORGANIZATION_PERMISSIONS  # ['read', 'update', 'delete']
│   ├── REPORT_PERMISSIONS        # ['read', 'export']
│   ├── SETTINGS_PERMISSIONS      # ['read', 'update']
│   └── getAllResourceTypes()
│
├── middleware.ts                 # Permission middleware
│   ├── requirePermission(resource, action)
│   ├── requireOwner()
│   ├── requireAdminOrOwner()
│   └── filterByPermissions(data, userId)
│
├── cache.ts                      # Redis caching
│   ├── getCachedPermissions(userId, orgId)
│   ├── setCachedPermissions(userId, orgId, permissions)
│   ├── invalidateCache(userId)
│   └── warmCache(userId)
│
├── types.ts                      # TypeScript types
│   ├── Role type
│   ├── Resource type
│   ├── Action type
│   ├── Permission interface
│   └── PermissionCheck interface
│
└── utils.ts                      # Helper utilities
    ├── isOwner(role)
    ├── isAdminOrAbove(role)
    ├── canManageUsers(role)
    └── compareRoles(role1, role2)  // Returns hierarchy comparison
```

**Permission Matrix (What Each Role Can Do):**

| Resource         | Owner        | Admin                  | Accountant            | User               |
| ---------------- | ------------ | ---------------------- | --------------------- | ------------------ |
| **Invoice**      | All actions  | All actions            | Create, Read, Update  | Create, Read (own) |
| **Customer**     | All actions  | All actions            | Read only             | Read only          |
| **Product**      | All actions  | All actions            | Read only             | Read only          |
| **Expense**      | All actions  | All actions            | Create, Read, Approve | Create, Read (own) |
| **User**         | All actions  | Invite, Read, Update   | Read only             | None               |
| **Organization** | All actions  | Read only              | Read only             | Read only          |
| **Report**       | Read, Export | Read, Export           | Read, Export          | Read (limited)     |
| **Settings**     | Read, Update | Read, Update (limited) | Read only             | Read only          |

**Special Permission Rules:**

```typescript
// 1. Resource Ownership Override
// Users can always edit their own created resources (if role allows creation)
if (resource.created_by === userId && hasBasePermission) {
  return true;
}

// 2. Draft Invoice Exception
// Accountants can edit draft invoices, but not submitted/paid ones
if (resource === "invoice" && invoice.status === "draft" && isAccountant) {
  return true;
}

// 3. Self-Management Exception
// Users can always update their own profile (not role or organization)
if (resource === "user" && resourceId === userId && action === "update") {
  return true; // But validate: can't change role, org, or email
}

// 4. Organization Isolation
// Users can NEVER access resources from other organizations
if (resource.organization_id !== user.organization_id) {
  return false; // Hard block, even for owner
}
```

**Redis Cache Structure:**

```typescript
// Cache key format
key: `permissions:${userId}:${organizationId}`

// Cache value (JSON)
{
  role: 'accountant',
  permissions: {
    invoice: ['create', 'read', 'update'],
    customer: ['read'],
    product: ['read'],
    expense: ['create', 'read', 'approve'],
    user: ['read'],
    organization: ['read'],
    report: ['read', 'export'],
    settings: ['read']
  },
  cachedAt: '2025-11-06T10:30:00Z',
  expiresAt: '2025-11-06T10:35:00Z'
}

// TTL: 5 minutes (300 seconds)
```

**Dependencies:**

- ✅ Supabase (PostgreSQL) - already set up
- ❌ Redis - need to integrate (use Upstash Redis for serverless)
- ✅ Auth system - already built
- ❌ tRPC procedures - will use this RBAC in tRPC middleware

**Environment Variables Needed:**

```env
# Add to .env.local
REDIS_URL=redis://...           # Upstash Redis URL
REDIS_TOKEN=...                 # Upstash Redis token (if using REST API)
```

---

## 🎯 WHAT I NEED FROM YOU

Let's plan the implementation before coding:

1. **Redis Integration Strategy:**

   - Should I use Upstash Redis (serverless, works with Vercel)?
   - Or use Redis Stack/Cloud?
   - Should I use `ioredis` or `@upstash/redis` (REST API)?

2. **Permission Check Performance:**

   - My approach: Cache full permission object in Redis
   - On each check: Read from cache (5ms) vs. DB query (50ms)
   - Does this approach make sense? Any improvements?

3. **Permission Definition Structure:**

   - Should permissions be defined as constants or in database?
   - I'm thinking: Code (constants) for base permissions, database for custom overrides
   - Agree/disagree?

4. **Middleware Pattern:**

   - Should `requirePermission()` be used in:
     - tRPC middleware? (I think yes)
     - Server Actions? (I think yes)
     - API Routes? (I think yes)
   - How should I structure this to avoid duplication?

5. **Role Change Handling:**

   - When an owner changes a user's role, I need to:
     - Update database
     - Invalidate Redis cache
     - Force user to refresh? Or handle gracefully?
   - What's the best UX here?

6. **Resource Ownership Tracking:**

   - Should I add `created_by` column to all resource tables?
   - Or track ownership differently?
   - This affects the "own vs. organization" permission checks

7. **Testing Strategy:**

   - What should I test first?
     - Unit tests for role definitions?
     - Integration tests for permission checks?
     - Cache invalidation scenarios?

8. **Implementation Order:**
   - Suggested order:
     1. Set up Redis connection
     2. Define permission constants (roles.ts, permissions.ts)
     3. Build core service functions (service.ts)
     4. Add caching layer (cache.ts)
     5. Create middleware (middleware.ts)
     6. Add utility functions (utils.ts)
     7. Write tests
   - Does this order make sense?

**Security Considerations:**

- Permission checks should NEVER be bypassable
- Always check permissions server-side (never trust client)
- Cache invalidation must be immediate on role changes
- Multi-tenant isolation must be enforced (RLS + application layer)

**Questions for You:**

1. Are there any security holes in my permission matrix?
2. Should I add more granular permissions (e.g., `approve_expense` vs. `create_expense`)?
3. How should I handle "temporary permissions" (e.g., delegate access for 24 hours)?
4. Should I log all permission checks for audit purposes?

Please review this plan and:

- ✅ Confirm the approach is sound
- ✅ Suggest any improvements or concerns
- ✅ Answer my questions above
- ✅ Propose the implementation order

Once we align, I'll start implementing step by step!
