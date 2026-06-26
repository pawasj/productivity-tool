import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ClientsClient from "@/components/clients/ClientsClient";
import { requireAccess } from "@/lib/access";
import type { Vertical, Profile } from "@/lib/types";

export default async function ClientsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("client_details");

  const [{ data: verticals }, { data: members }, { data: vendors }] = await Promise.all([
    supabase.from("verticals").select("*").order("order_index"),
    supabase.from("profiles").select("id,full_name,designation,department").order("full_name"),
    supabase.from("vendors").select("id,name,type,service_type,rate").order("name"),
  ]);

  return (
    <ClientsClient
      verticals={(verticals || []) as Vertical[]}
      members={(members || []) as Profile[]}
      vendors={(vendors || []) as { id: string; name: string; type: string; service_type?: string; rate?: number }[]}
      userId={user.id}
    />
  );
}
