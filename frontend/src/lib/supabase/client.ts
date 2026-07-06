/**
 * Supabase Browser Client
 * ========================
 * Creates a Supabase client for use in Client Components (browser-side).
 * 
 * WHY A SEPARATE BROWSER CLIENT:
 * Next.js App Router has two environments: Server (Node.js) and Client (browser).
 * Each needs its own Supabase client because:
 * - Browser client uses the ANON key (safe to expose)
 * - Server client can use cookies for session management
 * - The @supabase/ssr package handles the differences
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
