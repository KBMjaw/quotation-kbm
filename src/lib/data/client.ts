import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LocalBackend } from "./local";
import { Repo } from "./repo";
import { SupabaseBackend } from "./supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

let supabase: SupabaseClient | null = null;
let repo: Repo | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  supabase ??= createClient(url!, key!);
  return supabase;
}

/** Browser-only: Supabase when configured, otherwise localStorage. */
export function getRepo(): Repo {
  if (repo) return repo;
  const sb = getSupabase();
  repo = new Repo(sb ? new SupabaseBackend(sb) : new LocalBackend(window.localStorage));
  return repo;
}
