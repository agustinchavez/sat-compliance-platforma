Excellent work! We've completed the core foundation (Components 1-4) and the system is becoming quite robust.

## ✅ WHAT'S ALREADY BUILT (correct any of this if it's wrong please)

### Component 1: User Authentication ✓

- ✅ Supabase Auth with email verification
- ✅ User registration with automatic organization creation
- ✅ Session management and protected routes
- ✅ Password reset functionality

### Component 2: Role-Based Access Control (RBAC) ✓

- ✅ 4 role levels: Owner > Admin > Accountant > User
- ✅ Resource and action-based permissions
- ✅ `requirePermission()`, `requireRole()`, `assignRole()` functions
- ✅ Redis-cached permission checks (3-5ms)
- ✅ Role assignment with cache invalidation

### Component 3: Multi-Tenant Context Manager ✓

- ✅ Automatic organization scoping with RLS
- ✅ Cross-tenant isolation
- ✅ `getScopedClient()` for auto-filtered queries
- ✅ Tenant validation and resource ownership checks

### Component 4: Organization Service ✓

- ✅ Complete organization profile management
- ✅ CFDI certificate upload and encryption (Cloudflare R2)
- ✅ PAC provider configuration with encrypted credentials
- ✅ Organization settings management
- ✅ Certificate validation and expiry tracking
- ✅ Organization soft delete

### Current Database Structure (correct this if it's wrong)

```sql
-- users table (already exists)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'user',  -- owner, admin, accountant, user
  permissions JSONB DEFAULT '{}',   -- Custom permissions
  email_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Need to add invitations table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',  -- pending, accepted, expired, cancelled
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_pending_invitation UNIQUE (organization_id, email, status)
);

CREATE INDEX idx_invitations_token ON invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_email ON invitations(email) WHERE status = 'pending';
```

### Tech Stack (correct any of this if it's wrong please)

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js Server Actions, PostgreSQL (Supabase)
- **Auth:** Supabase Auth
- **Email:** Need to integrate (SendGrid, Resend, or React Email)
- **Cache:** Redis (for tracking invitation attempts)
- **File Structure:** `apps/web/lib/` and `apps/web/app/`

### Current User Creation Flow (correct any of this if it's wrong)

```typescript
// When user signs up:
1. User registers with email (becomes owner)
2. Organization is created automatically
3. User is added to organization with 'owner' role

// Now we need to add:
1. Owners/Admins can invite additional users
2. Invitees receive email with magic link
3. Invitees sign up and join organization with specified role
4. Role management (change roles, remove users)
5. Ownership transfer
```

---

## 📋 CURRENT TASK: Component 5 - Team Management Service

We need to build a comprehensive team management system that allows organizations to:

1. Invite users to their organization
2. Manage invitation lifecycle (send, resend, cancel, expire)
3. Handle invitation acceptance and user onboarding
4. Assign and update user roles
5. Remove team members
6. Transfer ownership (for critical operations)
7. Track team member activity

### **Component 5: Team Management Service**

**Purpose:** Enable organizations to build and manage their teams with proper role assignment, invitation workflows, and user lifecycle management.

**Key Requirements:**

1. **Invitation System**

   - Send email invitations with secure tokens
   - Token expiration (7 days default)
   - One active invitation per email per organization
   - Invitation status tracking (pending, accepted, expired, cancelled)
   - Resend invitation functionality
   - Cancel pending invitations

2. **Invitation Acceptance**

   - Validate invitation token
   - Check token expiration
   - Create user account (if new) or link existing user
   - Assign specified role
   - Mark invitation as accepted
   - Send welcome notifications

3. **Role Management**

   - Update user roles (owner/admin only)
   - Validate role transitions (can't demote last owner)
   - Invalidate permission cache after role change
   - Audit log for role changes
   - Prevent self-demotion

4. **Team Member Management**

   - List team members with roles and status
   - Filter by role, status, activity
   - Remove team members (soft delete)
   - Prevent removing last owner
   - Reactivate removed users

5. **Ownership Transfer**

   - Transfer ownership to another admin
   - Require confirmation from both parties
   - Atomic operation (old owner → admin, new admin → owner)
   - Audit logging
   - Email notifications to all parties

6. **Activity Tracking**
   - Last login tracking (already in users table)
   - Invitation history
   - Role change history
   - Team member statistics

**Expected Functionality:**

```typescript
// 1. Invite user to organization
const invitation = await inviteUser(organizationId, {
  email: "newuser@example.com",
  role: "accountant",
  message: "Join our accounting team!", // Optional custom message
});
// → Creates invitation, sends email, returns invitation object

// 2. Resend invitation
await resendInvitation(invitationId);
// → Generates new token, extends expiry, sends new email

// 3. Cancel invitation
await cancelInvitation(invitationId);
// → Marks as cancelled, user can't accept anymore

// 4. Accept invitation
const result = await acceptInvitation(token, {
  full_name: "Juan Pérez",
  password: "SecurePass123", // If new user
});
// → Validates token, creates/links user, assigns role

// 5. List team members
const members = await getTeamMembers(organizationId, {
  includeInvitations: true,
  role: "accountant", // Filter by role
  status: "active", // Filter by status
});
// → Returns users + pending invitations

// 6. Update user role
await updateUserRole(organizationId, userId, "admin");
// → Changes role, invalidates permission cache, logs change

// 7. Remove team member
await removeTeamMember(organizationId, userId, {
  reason: "No longer with company",
});
// → Soft deletes user, logs removal, sends notification

// 8. Transfer ownership
await transferOwnership(organizationId, newOwnerId, {
  confirmationToken: "token-from-new-owner",
});
// → Atomic role swap, updates both users, notifies team

// 9. Get team statistics
const stats = await getTeamStats(organizationId);
// → { total: 5, byRole: {...}, pendingInvitations: 2 }
```

**File Structure to Create:**

```
apps/web/lib/team/
├── service.ts                    # Main team management service
│   ├── getTeamMembers(orgId, filters)
│   ├── getTeamMember(orgId, userId)
│   ├── removeTeamMember(orgId, userId, reason)
│   ├── reactivateTeamMember(orgId, userId)
│   ├── updateUserRole(orgId, userId, newRole)
│   ├── transferOwnership(orgId, newOwnerId, confirmation)
│   ├── getTeamStats(orgId)
│   └── canRemoveUser(orgId, userId)  // Check if removal is allowed
│
├── invitations.ts                # Invitation management
│   ├── inviteUser(orgId, data)
│   ├── resendInvitation(invitationId)
│   ├── cancelInvitation(invitationId)
│   ├── acceptInvitation(token, userData)
│   ├── validateInvitationToken(token)
│   ├── getInvitation(token)
│   ├── getPendingInvitations(orgId)
│   ├── getInvitationByEmail(orgId, email)
│   ├── generateInvitationToken()
│   ├── isInvitationExpired(invitation)
│   └── cleanupExpiredInvitations()  // Cron job helper
│
├── validation.ts                 # Validation utilities
│   ├── validateInvitationEmail(email, orgId)
│   ├── validateRoleAssignment(role, assignedBy)
│   ├── canAssignRole(assignerRole, targetRole)
│   ├── canRemoveUser(removerRole, targetRole, orgId)
│   ├── isLastOwner(userId, orgId)
│   └── validateOwnershipTransfer(orgId, fromUserId, toUserId)
│
├── notifications.ts              # Email notifications
│   ├── sendInvitationEmail(invitation)
│   ├── sendInvitationReminder(invitation)
│   ├── sendWelcomeEmail(user, organization)
│   ├── sendRoleChangeNotification(user, oldRole, newRole)
│   ├── sendRemovalNotification(user, reason)
│   ├── sendOwnershipTransferNotification(oldOwner, newOwner, org)
│   └── notifyTeamMemberAdded(organization, newUser)
│
├── activity.ts                   # Activity tracking
│   ├── logInvitation(invitation)
│   ├── logInvitationAccepted(invitation, userId)
│   ├── logRoleChange(userId, oldRole, newRole, changedBy)
│   ├── logTeamMemberRemoved(userId, removedBy, reason)
│   ├── logOwnershipTransfer(orgId, fromUserId, toUserId)
│   ├── getTeamActivityLog(orgId, filters)
│   └── getUserActivityLog(userId)
│
├── ownership.ts                  # Ownership transfer logic
│   ├── initiateOwnershipTransfer(orgId, newOwnerId)
│   ├── confirmOwnershipTransfer(orgId, confirmationToken)
│   ├── cancelOwnershipTransfer(orgId)
│   ├── generateTransferConfirmationToken()
│   └── validateTransferConfirmation(token)
│
├── types.ts                      # TypeScript types
│   ├── TeamMember interface
│   ├── Invitation interface
│   ├── InvitationStatus type
│   ├── TeamMemberFilters interface
│   ├── RoleChangeRequest interface
│   ├── OwnershipTransfer interface
│   └── TeamStats interface
│
├── utils.ts                      # Helper utilities
│   ├── formatTeamMember(user)
│   ├── sortTeamMembers(members, sortBy)
│   ├── filterTeamMembers(members, filters)
│   ├── getUserDisplayName(user)
│   ├── getRoleBadgeColor(role)
│   └── canManageTeam(userRole)
│
└── index.ts                      # Main exports
    └── Export all public functions
```

**Invitation Flow:**

```typescript
// Step 1: Owner/Admin sends invitation
// =====================================
POST /api/team/invite
{
  "email": "newuser@example.com",
  "role": "accountant",
  "message": "Welcome to the team!"
}

// Backend:
1. Validate sender has permission (requirePermission('user', 'invite'))
2. Check email not already in organization
3. Check for existing pending invitation (cancel old one)
4. Create invitation record with token
5. Send email with invitation link
6. Return invitation object

// Step 2: Invitee receives email
// ==============================
Subject: You've been invited to join [Organization Name]

Hi there!

[Inviter Name] has invited you to join [Organization Name] as an [Role].

[Optional custom message]

[Accept Invitation Button] → https://app.com/accept-invitation?token=xyz123

This invitation expires in 7 days.

// Step 3: Invitee clicks link and accepts
// ========================================
GET /accept-invitation?token=xyz123

1. Validate token exists and not expired
2. Show invitation details (org name, role, inviter)
3. If user exists: Show "Accept" button
4. If new user: Show registration form (name, password)

// Step 4: Acceptance handling
// ===========================
POST /api/team/accept-invitation
{
  "token": "xyz123",
  "full_name": "Juan Pérez",  // If new user
  "password": "SecurePass123"  // If new user
}

// Backend:
1. Validate token
2. If new user: Create Supabase Auth user
3. Create user record in public.users
4. Link to organization with specified role
5. Mark invitation as accepted
6. Send welcome email
7. Invalidate permission cache
8. Log activity
```

**Role Assignment Rules:**

```typescript
// Who can assign what roles:
// =========================

// Owner can:
- Invite: admin, accountant, user
- Promote: user → accountant → admin
- Demote: admin → accountant → user
- Remove: any role except self (if last owner)

// Admin can:
- Invite: accountant, user
- Promote: user → accountant
- Demote: accountant → user
- Remove: accountant, user (not other admins or owners)

// Accountant/User cannot:
- Invite anyone
- Change roles
- Remove anyone

// Role hierarchy validation:
function canAssignRole(assignerRole: Role, targetRole: Role): boolean {
  const hierarchy = { owner: 4, admin: 3, accountant: 2, user: 1 }

  // Can only assign roles below or equal to own level
  return hierarchy[assignerRole] >= hierarchy[targetRole]
}

// Special cases:
// - Cannot demote self
// - Cannot remove last owner
// - Cannot remove user with higher role
```

**Invitation Security:**

```typescript
// Token Generation:
// ================
import { randomBytes } from 'crypto'

function generateInvitationToken(): string {
  // 32 bytes = 256 bits of randomness
  const token = randomBytes(32).toString('base64url')
  return token
}

// Token Validation:
// ================
async function validateInvitationToken(token: string): Promise<Invitation> {
  // 1. Find invitation by token
  const invitation = await getInvitationByToken(token)
  if (!invitation) throw new InvalidTokenError()

  // 2. Check status
  if (invitation.status !== 'pending') {
    throw new InvitationAlreadyUsedError()
  }

  // 3. Check expiration
  if (new Date() > invitation.expires_at) {
    await updateInvitationStatus(invitation.id, 'expired')
    throw new InvitationExpiredError()
  }

  return invitation
}

// Rate Limiting (Redis):
// =====================
// Prevent invitation spam
const RATE_LIMITS = {
  invitations_per_org_per_day: 50,
  invitations_per_email_per_org: 3, // Prevent re-invitation spam
  resends_per_invitation: 3
}

// Example Redis keys:
invitations:org:{orgId}:count:daily
invitations:org:{orgId}:email:{email}:count
invitations:{invitationId}:resends
```

**Team Member Response Types:**

```typescript
interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: "active" | "inactive" | "pending"; // pending = invitation sent
  email_verified: boolean;
  last_login_at?: Date;
  joined_at: Date;
  invited_by?: string; // User ID of inviter

  // Only if status === 'pending'
  invitation?: {
    id: string;
    sent_at: Date;
    expires_at: Date;
    resent_count: number;
  };
}

interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  token: string; // Only include in internal operations
  invited_by: {
    id: string;
    name: string;
    email: string;
  };
  expires_at: Date;
  created_at: Date;
  accepted_at?: Date;
}

type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

interface TeamStats {
  total: number;
  active: number;
  pending_invitations: number;
  by_role: {
    owner: number;
    admin: number;
    accountant: number;
    user: number;
  };
  recent_additions: number; // Last 30 days
}
```

**Email Templates:**

```typescript
// Invitation Email
// ===============
Subject: You've been invited to join {organizationName}

Hi there,

{inviterName} has invited you to join {organizationName} as a {roleName}.

{customMessage}

[Accept Invitation Button]

This invitation will expire on {expiryDate}.

---

// Role Change Email
// ================
Subject: Your role has been updated

Hi {userName},

Your role at {organizationName} has been changed from {oldRole} to {newRole} by {changedBy}.

Your new permissions are:
- {permission1}
- {permission2}
...

---

// Removal Email
// =============
Subject: Your access has been removed

Hi {userName},

Your access to {organizationName} has been removed by {removedBy}.

Reason: {reason}

If you believe this is a mistake, please contact {organizationEmail}.

---

// Welcome Email (after accepting invitation)
// ==========================================
Subject: Welcome to {organizationName}!

Hi {userName},

Welcome to {organizationName}! You've successfully joined as a {roleName}.

Get started:
- [Dashboard] View your dashboard
- [Settings] Update your profile
- [Help] Learn how to use the platform

Need help? Reply to this email or contact support.
```

**Activity Logging:**

```typescript
// Log all team management actions in activity_log table
interface TeamActivityLog {
  id: string;
  organization_id: string;
  user_id: string; // Who performed the action
  action: TeamAction;
  target_user_id?: string; // Who was affected
  details: {
    old_role?: Role;
    new_role?: Role;
    reason?: string;
    invitation_id?: string;
  };
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

type TeamAction =
  | "user_invited"
  | "invitation_resent"
  | "invitation_cancelled"
  | "invitation_accepted"
  | "role_changed"
  | "user_removed"
  | "user_reactivated"
  | "ownership_transferred";

// Example:
await logTeamActivity({
  organization_id: orgId,
  user_id: currentUser.id,
  action: "role_changed",
  target_user_id: targetUserId,
  details: {
    old_role: "user",
    new_role: "accountant",
  },
});
```

**Ownership Transfer Flow:**

```typescript
// Step 1: Current owner initiates transfer
// ========================================
const transfer = await initiateOwnershipTransfer(orgId, newOwnerId)
// → Creates pending transfer record
// → Sends confirmation email to new owner
// → Returns transfer object with confirmation token

// Step 2: New owner receives email with confirmation link
// =======================================================
Subject: Confirm ownership transfer for {organizationName}

Hi {newOwnerName},

{currentOwnerName} wants to transfer ownership of {organizationName} to you.

As the new owner, you will have full control over the organization, including:
- Managing all team members
- Accessing billing and subscription settings
- Making critical business decisions

[Confirm Transfer] [Decline Transfer]

This request will expire in 48 hours.

// Step 3: New owner confirms
// ==========================
await confirmOwnershipTransfer(orgId, confirmationToken)

// Backend (atomic transaction):
1. Validate confirmation token
2. BEGIN TRANSACTION
3. Update current owner role to 'admin'
4. Update new owner role to 'owner'
5. Invalidate permission caches for both users
6. Log ownership transfer
7. COMMIT TRANSACTION
8. Send notifications to both users and all admins
```

**Integration with Existing Systems:**

```typescript
// RBAC Integration
// ===============
// After role changes, invalidate permission cache
import { invalidatePermissionCache } from "@/lib/rbac";

async function updateUserRole(orgId: string, userId: string, newRole: Role) {
  const oldRole = await getUserRole(userId);

  // Update role in database
  await updateRoleInDB(userId, newRole);

  // Invalidate RBAC cache
  await invalidatePermissionCache(userId);

  // Log activity
  await logRoleChange(userId, oldRole, newRole, currentUserId);

  // Send notification
  await sendRoleChangeNotification(userId, oldRole, newRole);
}

// Multi-Tenant Integration
// ========================
// All team operations automatically scoped to organization
import { requireOrganization, getScopedClient } from "@/lib/multi-tenant";

async function getTeamMembers(filters: TeamMemberFilters) {
  const orgId = await requireOrganization();
  const supabase = await getScopedClient();

  // RLS automatically filters by organization_id
  const { data } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return data;
}
```

**Environment Variables:**

```env
# Email Service (for invitations)
EMAIL_PROVIDER=resend  # or 'sendgrid', 'postmark'
EMAIL_FROM=invitations@yourapp.com
EMAIL_FROM_NAME=Your App Team

# Resend API (recommended for simplicity)
RESEND_API_KEY=re_...

# Invitation Settings
INVITATION_EXPIRY_DAYS=7
MAX_INVITATIONS_PER_DAY=50
MAX_RESENDS_PER_INVITATION=3

# Redis (for rate limiting)
REDIS_URL=redis://...  # Already configured
```

**Migration Requirements:**

```sql
-- Create invitations table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  message TEXT,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_pending_invitation UNIQUE (organization_id, email, status)
);

-- Indexes
CREATE INDEX idx_invitations_token ON invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_email ON invitations(email) WHERE status = 'pending';
CREATE INDEX idx_invitations_expires ON invitations(expires_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view org invitations"
  ON invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Owners/Admins can manage invitations"
  ON invitations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

---

## 🎯 WHAT I NEED FROM YOU

Before we start implementation, please help me plan:

1. **Email Service Choice:**

   - Should I use Resend (simple, affordable) or SendGrid (established) or any others?
   - Or implement with React Email (templates as React components)?
   - Your recommendation?

2. **Invitation Expiry:**

   - 7 days default expiry?
   - Should users be able to customize expiry time?
   - Auto-cleanup expired invitations daily?

3. **Rate Limiting:**

   - 50 invitations per organization per day enough?
   - Should there be per-user limits too?
   - Redis or database for rate limiting?

4. **Ownership Transfer:**

   - Require confirmation from new owner (as proposed)?
   - Or allow immediate transfer (risky)?
   - 48-hour confirmation window?

5. **Multiple Invitations:**

   - Allow re-inviting after cancellation?
   - What if user declines invitation?
   - Handle email typos (cancel and resend)?

6. **Existing User Invitations:**

   - If inviting existing platform user, what happens?
   - Auto-accept if user already has account?
   - Or still require explicit acceptance?

7. **Implementation Order:**
   - My proposal:
     1. Types and interfaces (types.ts)
     2. Database migration (invitations table)
     3. Validation utilities (validation.ts)
     4. Core invitation logic (invitations.ts)
     5. Team member management (service.ts)
     6. Email notifications (notifications.ts)
     7. Activity logging (activity.ts)
     8. Ownership transfer (ownership.ts)
     9. UI pages and server actions
     10. Testing
   - Does this order make sense?

**UX Questions:**

1. Should invitation acceptance redirect to dashboard or onboarding flow?
2. How to handle user who doesn't have an account yet?
3. Should we show pending invitations in team member list?
4. Notification preferences - how much email is too much?

**Security Questions:**

1. Should invitation tokens be one-time use?
2. How to prevent invitation token enumeration attacks?
3. Should we notify organization when invitation is accepted?
4. Rate limit invitation acceptance attempts?

Please review this plan and:

- ✅ Review all flows and fix if they are wrong or could be improved
- ✅ Choose email service (Resend vs SendGrid vs React Email)
- ✅ Confirm invitation expiry and cleanup approach
- ✅ Validate rate limiting strategy
- ✅ Confirm ownership transfer flow
- ✅ Decide on existing user invitation handling
- ✅ Review implementation order
- ✅ Answer my questions above

Once we align on the approach, start implementing step by step!

```

---

```
