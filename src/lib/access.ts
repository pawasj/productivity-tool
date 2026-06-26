import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import type { AppModule, Profile } from "@/lib/types";

/**
 * Call at the top of any protected server page.
 * Admins always pass. Members need the module in their access_levels.
 * Redirects to /dashboard if access is denied.
 */
export async function requireAccess(module: AppModule): Promise<Profile> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const p = profile as Profile;

  // Admins always have full access
  if (p.role === "admin") return p;

  // Members need the module listed in their access_levels
  const levels: AppModule[] = (p.access_levels as AppModule[]) || [];
  if (!levels.includes(module)) redirect("/dashboard");

  return p;
}

/**
 * Check if a profile has access to a module (for UI conditional rendering).
 * Admins always return true.
 */
export function canAccess(profile: Profile | null, module: AppModule): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const levels: AppModule[] = (profile.access_levels as AppModule[]) || [];
  return levels.includes(module);
}
