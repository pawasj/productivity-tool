import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ClientsClient from "@/components/clients/ClientsClient";
import type { Vertical } from "@/lib/types";

export default async function ClientsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: verticals }, { data: profile }] = await Promise.all([
    supabase.from("verticals").select("*").order("order_index"),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  return (
    <ClientsClient
      verticals={(verticals || []) as Vertical[]}
      userId={user.id}
    />
  );
}
