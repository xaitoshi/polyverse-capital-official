import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_ANON_KEY not set');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');

export type Profile = {
  id: string;
  supabase_user_id: string | null;
  wallet_address: string | null;
  email: string | null;
  created_at: string;
  last_active: string;
  settings: Record<string, unknown>;
  subscription_tier: string;
  opt_in_data_sharing: boolean;
};
