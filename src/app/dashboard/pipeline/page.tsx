import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import PipelineClient from "@/components/modules/PipelineClient";
import type { Lead, Profile, Vertical } from "@/lib/types";

export default async function PipelinePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: leads }, { data: members }, { data: verticals }, { data: profile }] = await Promise.all([
    supabase.from("leads").select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name, email), vertical:verticals(name, color)").eq("our_poc_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("verticals").select("*").order("order_index"),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  return (
    <PipelineClient
      initialLeads={(leads || []) as Lead[]}
      members={(members || []) as Profile[]}
      verticals={(verticals || []) as Vertical[]}
      profile={profile as Profile}
      userId={user.id}
    />
  );
}
