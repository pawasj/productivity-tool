import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import SalaryClient from "@/components/salary/SalaryClient";
import type { Vertical, Profile } from "@/lib/types";

export default async function SalaryPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: verticals }, { data: members }] = await Promise.all([
    supabase.from("verticals").select("*").order("order_index"),
    supabase.from("profiles").select("id, full_name, designation, department, role").order("full_name"),
  ]);

  return (
    <SalaryClient
      userId={user.id}
      verticals={(verticals || []) as Vertical[]}
      members={(members || []) as Profile[]}
    />
  );
}
