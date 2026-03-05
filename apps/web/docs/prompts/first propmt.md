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

## 📋 CURRENT TASK: Phase 1 - Foundation

I'm starting with the foundation layer. The first component to build is:

### **Component 1: User Authentication Service**

**Purpose:** Handle user registration, login, session management, and password operations.

**Technical Requirements:**

- JWT-based authentication with refresh tokens (access: 15min, refresh: 30 days)
- Email verification flow with expiring tokens
- Password hashing with bcrypt (12 rounds minimum)
- Session storage in Redis for fast lookup
- Rate limiting on auth endpoints (5 attempts per 15min)
- Secure password reset with one-time tokens

**Expected Functionality:**

```typescript
// What users should be able to do:
1. Register with email + password + full name
2. Verify email via token link
3. Login with email + password (returns JWT tokens)
4. Request password reset via email
5. Reset password with valid token
6. Refresh access token using refresh token
7. Logout (invalidate tokens)
```

**File Structure to Create:**

```
src/server/auth/
├── service.ts           // Core authentication logic
│   ├── register(email, password, fullName)
│   ├── login(email, password)
│   ├── verifyEmail(token)
│   ├── requestPasswordReset(email)
│   ├── resetPassword(token, newPassword)
│   ├── refreshToken(refreshToken)
│   └── logout(userId)
├── middleware.ts        // Auth middleware for protected routes
│   ├── requireAuth()
│   ├── requireRole(roles)
│   └── validateSession()
├── tokens.ts           // JWT token generation and validation
│   ├── generateAccessToken(user)
│   ├── generateRefreshToken(user)
│   ├── verifyToken(token)
│   └── revokeToken(token)
└── validation.ts       // Input validation
    ├── validateEmail(email)
    ├── validatePassword(password)
    └── sanitizeInput(data)
```

**Database Tables Needed:**

```sql
-- users table (already created in schema)
- id (UUID, primary key)
- organization_id (UUID, foreign key)
- email (unique)
- password_hash
- full_name
- role (owner, admin, accountant, user)
- email_verified (boolean)
- last_login_at
- created_at, updated_at, deleted_at

-- password_reset_tokens table (needs creation)
- id (UUID, primary key)
- user_id (UUID, foreign key)
- token (unique, indexed)
- expires_at
- used_at (nullable)
- created_at

-- email_verification_tokens table (needs creation)
- id (UUID, primary key)
- user_id (UUID, foreign key)
- token (unique, indexed)
- expires_at
- created_at
```

**Dependencies:**

- `bcrypt` or `@node-rs/bcrypt` (password hashing)
- `jsonwebtoken` (JWT tokens)
- `ioredis` (Redis client)
- `zod` (validation schemas)
- Email service (we'll mock this for now, implement later)

**Security Requirements:**

- Passwords: minimum 8 characters, must include uppercase, lowercase, number
- Email verification tokens: expire after 24 hours
- Password reset tokens: expire after 1 hour, single-use only
- Rate limiting: 5 failed login attempts = 15 minute lockout
- JWT secrets: stored in environment variables

---

## 🎯 WHAT I NEED FROM YOU

Before we start writing code, please help me with:

1. **Review the approach:** Does this authentication strategy make sense? Any security concerns or improvements you'd suggest?

2. **Database migrations:** Should I create the `password_reset_tokens` and `email_verification_tokens` tables now, or are there better alternatives?

3. **Session management:** I'm planning to store sessions in Redis with the structure:

```
   Key: "session:{userId}"
   Value: { refreshToken, expiresAt, deviceInfo }
   TTL: 30 days
```

Is this a good approach?

4. **Error handling:** What specific errors should I handle? (e.g., user already exists, invalid credentials, expired token, etc.)

5. **Testing strategy:** What should I test first? Unit tests for password hashing? Integration tests for full registration flow?

6. **Environment variables:** What env vars will I need? (I'm thinking: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `DATABASE_URL`)

7. **Implementation order:** Should I build in this order?
   - Token generation/validation functions
   - Password hashing utilities
   - Register function
   - Login function
   - Email verification
   - Password reset
   - Middleware for protected routes

Please ask any clarifying questions you have. Once we align on the approach, I'll be ready to start implementing!

```

---

## 📝 Why This Prompt Works

This prompt is effective because it:

✅ **Provides clear context** - AI understands the bigger picture
✅ **Sets boundaries** - Specific tech stack and constraints
✅ **Shows structure** - Exactly what files and functions are needed
✅ **Asks for planning first** - Prevents premature coding
✅ **Identifies dependencies** - AI knows what tools to use
✅ **Requests validation** - Gets AI to spot issues early
✅ **Specifies security requirements** - Critical for auth systems
✅ **Leaves room for AI expertise** - Asks for improvements

---

## 🔄 What Happens Next

After you send this prompt, the AI should:

1. **Ask clarifying questions** about specific implementation details
2. **Suggest improvements** to your approach
3. **Propose the implementation plan** with step-by-step order
4. **Identify potential issues** (security concerns, edge cases)
5. **Recommend specific libraries** and why

Once you and the AI align on the approach (usually 1-2 back-and-forth messages), you'll then say:
```

Great! Let's start implementing.

Begin with the token generation and validation functions.

File: src/server/auth/tokens.ts

Please provide:

1. The complete implementation
2. TypeScript types/interfaces
3. Error handling
4. JSDoc comments
5. Example usage

After the code, also provide:

- Unit tests for these functions
- Any environment variables needed
- Integration points with other files

```

---

## 💡 Pro Tips

**After the AI responds:**

1. **Review carefully** - Check for security issues, edge cases
2. **Ask "why"** - "Why did you choose approach X over Y?"
3. **Test incrementally** - Don't build everything before testing
4. **Save checkpoints** - Git commit after each working piece
5. **Document as you go** - Add comments explaining business logic

**If you get stuck:**
```

I implemented the code you provided, but I'm getting this error:

[paste exact error message]

Here's the context:

- Environment: [Node version, etc.]
- What I was doing: [specific action]
- What I expected: [expected behavior]
- What happened: [actual behavior]

Can you help me debug this?
