import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Supabase environment variables are MISSING! Check your .env or .env.local file.");
} else {
  console.log("✅ Supabase Client initialized with URL:", supabaseUrl);
  console.log("✅ Using Key:", supabaseAnonKey.substring(0, 15) + "...");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);