import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import IdeaDumpClient from "@/components/ideas/IdeaDumpClient";
import { requireAccess } from "@/lib/access";
import type { Vertical } from "@/lib/types";

export default async function IdeasPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("idea_dump");

  const { data: verticals } = await supabase.from("verticals").select("*").order("order_index");

  return <IdeaDumpClient userId={user.id} verticals={(verticals || []) as Vertical[]} />;
}
