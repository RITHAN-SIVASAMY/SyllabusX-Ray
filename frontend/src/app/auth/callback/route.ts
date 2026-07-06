/**
 * OAuth Callback Route Handler
 * ==============================
 * After Google OAuth, Supabase redirects here with an auth code.
 * This route exchanges the code for a session, then redirects to dashboard.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If something went wrong, redirect to homepage with error
  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
