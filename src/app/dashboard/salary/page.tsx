import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import SalaryClient from "@/components/salary/SalaryClient";
import { requireAccess } from "@/lib/access";
import type { Vertical, Profile } from "@/lib/types";

export default async function SalaryPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("salary");

  const svc = createServiceRoleClient();
  const [{ data: verticals }, { data: members }, { data: vendors }] = await Promise.all([
    svc.from("verticals").select("*").order("order_index"),
    svc.from("profiles").select("*").order("full_name"),
    svc.from("vendors").select("id, name, type, service_type, rate").order("name"),
  ]);

  return (
    <SalaryClient
      userId={user.id}
      verticals={(verticals || []) as Vertical[]}
      members={(members || []) as Profile[]}
      vendors={(vendors || []) as { id: string; name: string; type: string; service_type?: string; rate?: number }[]}
    />
  );
}
