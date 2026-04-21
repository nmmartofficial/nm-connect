import { createClient } from '@supabase/supabase-js';

// Aapka URL aur Key jo aapne provide ki hai
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);