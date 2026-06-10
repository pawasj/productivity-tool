import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import AdminClient from "@/components/modules/AdminClient";
import type { Profile } from "@/lib/types";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: members } = await supabase.from("profiles").select("*").order("created_at");

  return <AdminClient members={(members || []) as Profile[]} currentUser={profile as Profile} />;
}
