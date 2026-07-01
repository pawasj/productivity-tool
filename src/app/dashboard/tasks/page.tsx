import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import TasksClient from "@/components/tasks/TasksClient";
import { requireAccess } from "@/lib/access";
import type { Vertical, Profile } from "@/lib/types";

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("tasks");

  const svc = createServiceRoleClient();
  const [{ data: verticals }, { data: members }] = await Promise.all([
    svc.from("verticals").select("*").order("order_index"),
    svc.from("profiles").select("id, full_name, email, designation, role").order("full_name"),
  ]);

  return (
    <TasksClient
      userId={user.id}
      verticals={(verticals || []) as Vertical[]}
      members={(members || []) as Profile[]}
    />
  );
}
