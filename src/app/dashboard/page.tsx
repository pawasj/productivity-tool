import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/layout/DashboardClient";
import type { Vertical, Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: verticals }, { data: profile }, { data: members }] = await Promise.all([
    supabase.from("verticals").select("*").order("order_index"),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("profiles").select("*").order("full_name"),
  ]);

  return (
    <DashboardClient
      verticals={(verticals || []) as Vertical[]}
      profile={profile as Profile}
      members={(members || []) as Profile[]}
      userId={user.id}
    />
  );
}
