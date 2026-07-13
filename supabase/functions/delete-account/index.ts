// Supabase Edge Function: delete-account
// -----------------------------------------------------------------------------
// Permanently deletes the calling user's account and all associated data.
//
// The website (delete-account.html) calls this with the signed-in user's JWT.
// This function verifies that token, then uses the SERVICE ROLE key (which must
// NEVER be exposed to the browser) to delete the user's rows and the auth user.
//
// Deploy:   supabase functions deploy delete-account
// Secrets:  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
//           by the Supabase runtime — you do NOT need to set them manually.
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

// Tables that hold user data keyed by the user's id, and the column that holds
// that id. These rows are deleted before the auth user is removed.
//
// NOTE: If these tables already have a foreign key to auth.users with
// "ON DELETE CASCADE", you can leave this list empty — deleting the auth user
// will remove the rows automatically. List them here only if they don't cascade.
const USER_TABLES: { table: string; column: string }[] = [
  // { table: 'profiles',    column: 'id' },
  // { table: 'game_saves',  column: 'user_id' },
  // { table: 'achievements', column: 'user_id' },
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

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Identify the caller from their JWT (passed through by the browser).
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

  // 2) Delete with admin privileges.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 2a) Remove application data for this user.
    for (const { table, column } of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq(column, user.id);
      if (error) throw new Error(`Failed deleting from ${table}: ${error.message}`);
    }

    // 2b) Remove the auth user itself.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw new Error(`Failed deleting auth user: ${delErr.message}`);

    return json({ success: true, deletedUserId: user.id }, 200, cors);
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
