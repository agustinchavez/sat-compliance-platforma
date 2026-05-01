/**
 * Service Role Supabase Client
 *
 * Creates a Supabase client with service role privileges.
 * Used for server-side operations that bypass RLS (webhooks, background jobs).
 *
 * SECURITY: Only use in server contexts. Never expose service role key to client.
 */

import { createClient } from '@supabase/supabase-js';

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
