import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DistroHub from "@/components/distro/DistroHub";
import type { Profile } from "@/lib/types";

export default async function DistroPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: verticals }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("verticals").select("*").order("order_index"),
  ]);

  return (
    <DistroHub
      profile={profile as Profile}
      userId={user.id}
      verticals={verticals || []}
    />
  );
}
