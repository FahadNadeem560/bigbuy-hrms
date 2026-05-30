import { supabase } from "../lib/supabaseClient";

export async function getCurrentAuthSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function fetchUserProfileByAuthId(authUserId) {
  if (!authUserId) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMasterFallbackUser() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("role", "Master")
    .eq("status", "Active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signInWithEmailPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
