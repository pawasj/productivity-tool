import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import LiveMediaPlans from "@/components/distro/LiveMediaPlans";
import { canAccess } from "@/lib/access";
import type { Profile } from "@/lib/types";

export default async function LivePlansPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const profile = data as Profile | null;
  if (!profile) redirect("/login");

  // Verifiers can always see the plans they verify, even without the view module
  const canView = canAccess(profile, "live_media_plans") || canAccess(profile, "verify_live_links");
  if (!canView) redirect("/dashboard");

  return (
    <LiveMediaPlans
      userId={user.id}
      isAdmin={profile.role === "admin"}
      canVerify={canAccess(profile, "verify_live_links")}
    />
  );
}
