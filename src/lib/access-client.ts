import type { AppModule, Profile } from "@/lib/types";

export function canAccess(profile: Profile | null, module: AppModule): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const levels: AppModule[] = (profile.access_levels as AppModule[]) || [];
  return levels.includes(module);
}
