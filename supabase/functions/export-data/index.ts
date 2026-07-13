// Supabase Edge Function: export-data
// -----------------------------------------------------------------------------
// Returns a copy of the calling user's personal data as JSON (GDPR/CCPA "right
// to access"). The website (account.html) calls this with the signed-in user's
// JWT, verifies it, then gathers the user's data using the service role key.
//
// Deploy:  supabase functions deploy export-data
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

// Origins allowed to call this function (your live site + local preview).
const ALLOWED_ORIGINS = [
  'https://studio.determinix.com',
  'http://localhost:8000',
];

// Tables that hold this user's data, and the column that holds their id.
// Keep this in sync with the delete-account function. Empty for now because
// there are no custom tables yet — the export will contain the auth profile.
const USER_TABLES: { table: string; column: string; label?: string }[] = [
  // { table: 'profiles',    column: 'id',      label: 'profile' },
  // { table: 'game_saves',  column: 'user_id', label: 'game_saves' },
];

// -----------------------------------------------------------------------------

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return json({ error: 'Missing authorization token' }, 401, cors);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !user) {
    return json({ error: 'Invalid or expired session' }, 401, cors);
  }

  // 2) Gather the user's data with admin privileges.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const exportPayload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      signInProviders: user.app_metadata?.providers ?? [],
      userMetadata: user.user_metadata ?? {},
    },
    data: {} as Record<string, unknown>,
  };

  try {
    for (const { table, column, label } of USER_TABLES) {
      const { data, error } = await admin.from(table).select('*').eq(column, user.id);
      if (error) throw new Error(`Failed reading ${table}: ${error.message}`);
      (exportPayload.data as Record<string, unknown>)[label ?? table] = data;
    }
    return json(exportPayload, 200, cors);
  } catch (err) {
    return json({ error: (err as Error).message }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
