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

// Internal accounts (Branch Manager/GM/Master/HR) log in with a plain
// username; Supabase Auth requires an email-shaped identifier under the
// hood, so we append a synthetic, non-deliverable domain.
export function usernameToEmail(username) {
  return `${String(username || "").trim().toLowerCase()}@bigbuy.internal`;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Goes through a SECURITY DEFINER RPC rather than a direct table update --
// the only UPDATE policy on public.users requires role = 'Master', so a
// non-Master account's own attempt to clear this flag was previously
// silently blocked by RLS (0 rows affected, no error), leaving them stuck
// on the forced password-change screen forever. The RPC only ever touches
// the caller's own row (via auth.uid()), so authUserId here is unused --
// kept as a parameter so ChangePassword.jsx doesn't need to change.
export async function clearMustChangePassword(_authUserId) {
  const { error } = await supabase.rpc("clear_my_must_change_password");
  if (error) throw error;
}
