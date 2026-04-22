import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://riinnhpjxmmywmcvkiqd.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_IxXjjNJYFpS-7q09_6zCjg_mAMF14lu";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Supabase environment variables are MISSING! Check your .env or .env.local file.");
} else {
  console.log("✅ Supabase Client initialized with URL:", supabaseUrl);
  console.log("✅ Using Key:", supabaseAnonKey.substring(0, 15) + "...");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'nm-connect-auth-session'
  }
});