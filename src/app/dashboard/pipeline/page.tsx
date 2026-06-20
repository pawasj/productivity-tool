import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import PipelineClient from "@/components/modules/PipelineClient";
import type { Lead, Profile, Vertical } from "@/lib/types";

export default async function PipelinePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: leads }, { data: members }, { data: verticals }, { data: profile }, { data: briefs }] = await Promise.all([
    supabase.from("leads").select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name, email), vertical:verticals(name, color)").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("verticals").select("*").order("order_index"),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("client_briefs").select("*, creator:profiles!client_briefs_created_by_fkey(full_name)").order("created_at", { ascending: false }),
  ]);

  return (
    <PipelineClient
      initialLeads={(leads || []) as Lead[]}
      initialBriefs={(briefs || []) as Record<string, unknown>[]}
      members={(members || []) as Profile[]}
      verticals={(verticals || []) as Vertical[]}
      profile={profile as Profile}
      userId={user.id}
    />
  );
}
