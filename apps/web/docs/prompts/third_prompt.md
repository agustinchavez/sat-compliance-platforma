Excellent progress! We've completed Components 1 and 2 and they're working beautifully together.

## ✅ WHAT'S ALREADY BUILT

### Component 1: User Authentication ✓

- ✅ Supabase Auth integration (signup, login, logout, email verification)
- ✅ User and organization creation flow
- ✅ Protected routes and middleware
- ✅ Session management
- ✅ Auth helper functions (`getCurrentUser()`, `requireAuth()`)

### Component 2: Role-Based Access Control (RBAC) ✓

- ✅ 4 role levels: Owner > Admin > Accountant > User
- ✅ 8 resource types with granular permissions
- ✅ Redis-cached permission checks (3-5ms performance)
- ✅ Ownership and special rule support
- ✅ Comprehensive middleware (`requirePermission()`, `requireRole()`)
- ✅ Full TypeScript type safety
- ✅ Complete documentation with examples

### Current Database Structure (correct if I am wrong)

```sql
-- All tables have organization_id for multi-tenancy
CREATE TABLE users (
  id UUID PRIMARY KEY,
  auth_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),  -- Multi-tenant key
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  -- ... other fields
);

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  -- ... other fields
);

-- Future tables will follow this pattern:
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),  -- Multi-tenant key
  -- ... fields
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),  -- Multi-tenant key
  customer_id UUID REFERENCES customers(id),
  -- ... fields
);
```

### Current RLS Policies (Basic)

```sql
-- Basic RLS on users table
CREATE POLICY "Users can view own organization users"
  ON users FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM users
    WHERE auth_id = auth.uid()
  ));

-- Need to expand RLS to be more comprehensive and centralized
```

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

## 📋 CURRENT TASK: Component 3 - Multi-Tenant Context Manager

While we have basic multi-tenancy (organization_id column), we need a **comprehensive tenant context system** that:

1. Automatically scopes ALL database queries to the current organization
2. Prevents accidental cross-organization data leaks
3. Provides easy-to-use context throughout the application
4. Works seamlessly with our RBAC system
5. Enforces tenant isolation at multiple layers

### **Component 3: Multi-Tenant Context Manager**

**Purpose:** Create a robust multi-tenant system that automatically isolates data between organizations and manages tenant context throughout the application lifecycle.

**Key Requirements:**

1. **Automatic Query Scoping**

   - All database queries automatically filtered by `organization_id`
   - No need to manually add `WHERE organization_id = X`
   - Works with Supabase client
   - Fails safely (denies if organization context missing)

2. **Tenant Context Extraction**

   - Extract organization from user session
   - Available throughout request lifecycle
   - Accessible in Server Actions, API Routes, tRPC procedures
   - Cached for performance (avoid repeated DB queries)

3. **Multi-Layer Security**

   - **Layer 1:** Application code (TypeScript utilities)
   - **Layer 2:** Database RLS policies (PostgreSQL)
   - **Layer 3:** RBAC integration (permission checks)
   - Defense in depth: if one layer fails, others protect

4. **Organization Switching (Future)**

   - Support for users in multiple organizations
   - Secure organization switching with validation
   - Audit logging of organization access

5. **Cross-Tenant Access Prevention**
   - Detect and block cross-organization queries
   - Log security violations
   - Provide clear error messages

**Expected Functionality:**

```typescript
// 1. Get current organization context
const org = await getCurrentOrganization();
// → { id: 'org-123', name: 'Mi Empresa', rfc: '...', ... }

// 2. Get scoped Supabase client (automatically filters by org_id)
const supabase = await getScopedClient();
const { data: customers } = await supabase.from("customers").select("*");
// → Returns ONLY customers from current organization
// → No need to add .eq('organization_id', orgId)

// 3. Validate tenant access (before performing sensitive operations)
await validateTenantAccess(organizationId);
// → Throws error if user doesn't belong to this organization

// 4. Check if resource belongs to user's organization
const isValid = await isResourceInOrganization("invoice", invoiceId);
// → true/false

// 5. Organization switching (for users in multiple orgs)
await switchOrganization(newOrganizationId);
// → Validates access, updates context, invalidates caches

// 6. Prevent data leakage
const safeData = await preventDataLeakage(queryResult);
// → Strips organization_id from response, prevents info disclosure
```

**File Structure to Create:**

```
apps/web/lib/multi-tenant/
├── context.ts                    # Tenant context management
│   ├── TenantContext class       # Context state holder
│   ├── getCurrentOrganization()  # Get current org from session
│   ├── getOrganizationId()       # Get just the ID (fast)
│   ├── setOrganizationContext()  # Set context (internal use)
│   ├── switchOrganization()      # Change active organization
│   ├── getUserOrganizations()    # List user's organizations
│   └── validateOrganizationAccess() # Check user membership
│
├── database.ts                   # Database scoping utilities
│   ├── getScopedClient()         # Get auto-scoped Supabase client
│   ├── createScopedQuery()       # Add org_id to query builder
│   ├── validateQueryScope()      # Ensure query is scoped
│   ├── withOrganizationScope()   # HOF to wrap queries
│   └── getRLSContext()           # Get RLS vars for current user
│
├── middleware.ts                 # Request middleware
│   ├── extractTenantContext()    # Extract from request/session
│   ├── injectTenantContext()     # Add to request object
│   ├── validateTenantAccess()    # Verify user belongs to org
│   ├── requireOrganization()     # Throw if no org context
│   └── withTenantContext()       # HOF for API routes
│
├── isolation.ts                  # Cross-tenant protection
│   ├── isResourceInOrganization() # Check resource ownership
│   ├── validateCrossOrgAccess()  # Detect cross-org queries
│   ├── preventDataLeakage()      # Strip sensitive fields
│   ├── sanitizeForOrganization() # Remove cross-org data
│   └── detectTenantViolation()   # Security monitoring
│
├── rls.ts                        # RLS policy management
│   ├── enableRLSForTable()       # Enable RLS on table
│   ├── createOrgScopedPolicy()   # Standard org-scoped policy
│   ├── createRLSPolicies()       # Generate policies for all tables
│   ├── validateRLSPolicies()     # Check policies are active
│   └── getRLSPolicySQL()         # Generate SQL for policies
│
├── cache.ts                      # Organization data caching
│   ├── getCachedOrganization()   # Get org from cache
│   ├── setCachedOrganization()   # Cache org data
│   ├── invalidateOrgCache()      # Clear org cache
│   └── warmOrganizationCache()   # Pre-load org data
│
├── types.ts                      # TypeScript types
│   ├── TenantContext interface
│   ├── OrganizationContext interface
│   ├── ScopedQuery interface
│   └── TenantIsolationError class
│
├── utils.ts                      # Helper utilities
│   ├── formatOrganizationId()    # Normalize org ID
│   ├── isValidOrganizationId()   # Validate org ID format
│   ├── extractOrgFromResource()  # Get org_id from resource
│   └── logTenantAccess()         # Audit logging
│
└── index.ts                      # Main exports
    └── Export all public functions
```

**Integration with Existing Systems:**

```typescript
// RBAC Integration
// ================
// RBAC already checks organization isolation, but we need to enhance it

// Current RBAC check:
await checkPermission(userId, "invoice", "read");

// Enhanced with tenant context:
const org = await getCurrentOrganization();
await checkPermission(userId, "invoice", "read");
// → Automatically validates user belongs to org
// → Permission check scoped to user's organization

// Auth Integration
// ================
// Auth provides user session, we add organization context

// Current:
const user = await getCurrentUser();

// Enhanced:
const user = await getCurrentUser();
const org = await getCurrentOrganization(); // Added
// → Organization derived from user.organization_id
// → Cached in Redis for performance

// Supabase Client Integration
// ===========================
// Replace manual organization_id filtering

// OLD WAY (manual, error-prone):
const { data } = await supabase
  .from("invoices")
  .select("*")
  .eq("organization_id", user.organization_id); // Easy to forget!

// NEW WAY (automatic, safe):
const supabase = await getScopedClient();
const { data } = await supabase.from("invoices").select("*");
// → Automatically filters by organization_id via RLS
// → Impossible to access other organizations' data
```

**Row-Level Security (RLS) Policies:**

We need comprehensive RLS policies for ALL tables:

```sql
-- Template for all multi-tenant tables:
-- =====================================

-- Policy 1: SELECT (Read)
CREATE POLICY "org_select_policy" ON [table_name]
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- Policy 2: INSERT (Create)
CREATE POLICY "org_insert_policy" ON [table_name]
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- Policy 3: UPDATE (Modify)
CREATE POLICY "org_update_policy" ON [table_name]
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- Policy 4: DELETE (Remove)
CREATE POLICY "org_delete_policy" ON [table_name]
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- Apply to all tables:
-- - customers
-- - products
-- - invoices
-- - invoice_items
-- - expenses
-- - payments
-- - journal_entries
-- - (future tables)
```

**Security Scenarios to Handle:**

```typescript
// Scenario 1: User tries to access another org's invoice
// ======================================================
const invoiceId = "invoice-from-other-org";
const invoice = await getInvoice(invoiceId);
// → RLS blocks at database level
// → Returns null or empty result
// → Application logs security violation

// Scenario 2: Developer forgets to scope query
// ============================================
const { data } = await supabase.from("customers").select("*");
// → RLS automatically filters by organization_id
// → Developer doesn't need to remember to add filter
// → Safe by default

// Scenario 3: API endpoint receives cross-org resource ID
// =======================================================
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Validate resource belongs to user's organization
  const isValid = await isResourceInOrganization("customer", params.id);
  if (!isValid) {
    throw new TenantIsolationError("Resource not found");
  }

  // Proceed with delete
  await deleteCustomer(params.id);
}

// Scenario 4: User in multiple organizations switches context
// ===========================================================
const userOrgs = await getUserOrganizations();
// → ['org-1', 'org-2', 'org-3']

await switchOrganization("org-2");
// → Validates user has access
// → Updates session context
// → Invalidates permission cache
// → Logs organization switch for audit
```

**Performance Considerations:**

```typescript
// Cache Strategy:
// ==============

// Cache Key: `org:${organizationId}`
// TTL: 15 minutes (longer than permission cache)
// Invalidation: On organization update

// Organization data caching (avoid DB hit on every request):
async function getCurrentOrganization() {
  const user = await getCurrentUser();

  // Try cache first (1-2ms)
  const cached = await getCachedOrganization(user.organization_id);
  if (cached) return cached;

  // Cache miss, query DB (20-30ms)
  const org = await getOrganizationFromDB(user.organization_id);

  // Cache for next request
  await setCachedOrganization(user.organization_id, org);

  return org;
}

// Expected Performance:
// - Cache Hit: 1-2ms ⚡
// - Cache Miss: 20-30ms
// - Hit Rate: ~99% (org data rarely changes)
```

**Migration Requirements:**

```sql
-- Need to create migration for:
-- =============================

-- 1. Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
-- (repeat for all tables)

-- 2. Create policies (using template above)
-- 3. Add indexes for performance
CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_invoices_org ON invoices(organization_id);
-- (repeat for all tables)

-- 4. Add check constraints
ALTER TABLE customers
  ADD CONSTRAINT check_org_not_null
  CHECK (organization_id IS NOT NULL);
-- (repeat for all tables)
```

**Environment Variables:**

```env
# Already have these, no new env vars needed
REDIS_URL=...  # For caching (already set up for RBAC)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 🎯 WHAT I NEED FROM YOU

Before we start implementation, please help me plan:

1. **RLS Strategy:**

   - Should I use the policy template above for ALL tables?
   - Or are there tables that shouldn't have RLS (like SAT catalogs)?
   - Should I create a helper function to generate policies programmatically?

2. **Scoped Client Approach:**

   - How should `getScopedClient()` work internally?
   - Option A: Set RLS context variables (`SET LOCAL app.organization_id = X`)
   - Option B: Automatically append `.eq('organization_id', orgId)` to queries
   - Option C: Rely purely on RLS policies (simplest)
   - Which approach is best?

3. **Organization Switching:**

   - Should I support multiple organizations per user NOW?
   - Or defer this feature until later?
   - If now: How should I store user-organization relationships?
     - Option A: `user_organizations` junction table
     - Option B: `organizations` array in `users.permissions` JSONB
     - Option C: Keep it simple - one org per user for now

4. **Performance Optimization:**

   - Cache organization data in Redis (like RBAC permissions)?
   - Cache TTL: 15 minutes? 1 hour?
   - What should trigger cache invalidation?

5. **Error Handling:**

   - What should happen when RLS blocks a query?
   - Currently: Supabase returns empty result
   - Should I: Detect empty results and throw `TenantIsolationError`?
   - Or: Let empty results flow through (more performant)?

6. **RBAC Integration:**

   - Should tenant context be checked BEFORE or AFTER RBAC?
   - My thinking: Tenant context → RBAC → Business logic
   - Agree?

7. **Testing Strategy:**

   - How do I test RLS policies effectively?
   - Should I create test users in different organizations?
   - Test cross-org access attempts?

8. **Migration Order:**
   - Should I enable RLS on all existing tables NOW?
   - Or gradually enable as we build features?
   - Risk: Enabling RLS might break existing code if not careful

**Implementation Order (My Proposal):**

1. **Types & Errors** (types.ts)

   - Define TypeScript types
   - Create error classes

2. **Context Management** (context.ts)

   - `getCurrentOrganization()`
   - `getOrganizationId()`
   - Basic context utilities

3. **Caching Layer** (cache.ts)

   - Redis caching for org data
   - Cache invalidation

4. **Database Utilities** (database.ts)

   - `getScopedClient()`
   - Query scoping helpers

5. **RLS Policies** (rls.ts + migration)

   - Generate RLS policy SQL
   - Create migration to enable RLS

6. **Isolation Utilities** (isolation.ts)

   - Cross-org access detection
   - Security violation logging

7. **Middleware** (middleware.ts)

   - Request context extraction
   - Integration with existing auth middleware

8. **Integration & Testing**
   - Update existing code to use scoped client
   - Test cross-org access prevention
   - Performance testing

**Questions for You:**

1. Any security concerns with this approach?
2. Should I add more defensive layers?
3. How should I handle the edge case where a user's organization is deleted?
4. Should organization context be in React Context for client components?
5. Any performance optimizations I'm missing?

Please review this plan and:

- ✅ Confirm the RLS policy approach
- ✅ Choose the scoped client strategy (A, B, or C)
- ✅ Decide on multi-org support (now vs. later)
- ✅ Validate the implementation order
- ✅ Answer my questions above
- ✅ Suggest any improvements

Once we align on the approach, start building step by step!

```

```
