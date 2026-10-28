import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import AddTeamMember from "@/components/admin/AddTeamMember";
import type { Profile } from "@/lib/types";

// HRMS users land here to add people. Admins can use it too, though they also
// have the full invite flow in the Admin Panel.
export default async function AddTeamMemberPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "hrms" && me?.role !== "admin") redirect("/dashboard");

  const { data: members } = await supabase
    .from("profiles").select("id, full_name, designation, department, email, created_at").order("full_name");

  return <AddTeamMember members={(members || []) as Profile[]} isAdmin={me?.role === "admin"} />;
}
