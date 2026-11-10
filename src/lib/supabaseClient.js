import { createClient } from '@supabase/supabase-js';

// Publishable (anon) key -- safe to ship in client code. All real access
// control is enforced by Postgres Row-Level Security on the other end, not
// by keeping this key secret.
const SUPABASE_URL = 'https://fjvfslfczdlfjgqlgibo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Bjnm2WpmQMRLaTDAoqm1GA_ScmI-nu9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
