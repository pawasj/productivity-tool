import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ReportsClient from "@/components/reports/ReportsClient";
import { requireAccess } from "@/lib/access";
import type { Vertical } from "@/lib/types";

export default async function ReportsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("reports");

  const { data: verticals } = await supabase.from("verticals").select("*").order("order_index");

  return <ReportsClient verticals={(verticals || []) as Vertical[]} userId={user.id} />;
}
