import { supabase } from "../lib/supabaseClient.js";

export async function fetchAllUsers() {
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function callAdminManageUsers(body) {
  const { data, error } = await supabase.functions.invoke("admin-manage-users", { body });
  if (error) {
    // supabase-js only exposes the top-level Edge Function error by default;
    // the actual reason (e.g. "username, fullName and role are required")
    // is in the response body, which functions.invoke attaches as `context`.
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  return data;
}

export async function createUser({ username, fullName, title, role, branch, employeeId, menuOverrides }) {
  return callAdminManageUsers({
    action: "create", username, fullName, title: title || null, role,
    branch: branch || null, employeeId: employeeId || null, menuOverrides: menuOverrides || null,
  });
}

export async function resetUserPassword(userId) {
  return callAdminManageUsers({ action: "reset_password", userId });
}

export async function updateUser(id, patch) {
  const { error } = await supabase.from("users").update(patch).eq("id", id);
  if (error) throw error;
}
