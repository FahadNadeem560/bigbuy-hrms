import { normalizeBranch } from "./importHelpers.js";

export function isBranchRestricted(profile) {
  return profile?.role === "Branch Manager";
}

// Returns the normalized branch name a Branch Manager is restricted to, or
// null for any other role (no restriction).
export function getBranchFilter(profile) {
  if (!isBranchRestricted(profile)) return null;
  return normalizeBranch(profile.branch);
}
