import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

export type { Database, Json } from "./database.types.js";

export type TransWaveDatabaseClient = SupabaseClient<Database>;

const commonOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
} as const;

export function createUserDatabaseClient(url: string, publishableKey: string, accessToken: string): TransWaveDatabaseClient {
  return createClient<Database>(url, publishableKey, {
    ...commonOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

export function createSystemDatabaseClient(url: string, secretKey: string): TransWaveDatabaseClient {
  return createClient<Database>(url, secretKey, commonOptions);
}
