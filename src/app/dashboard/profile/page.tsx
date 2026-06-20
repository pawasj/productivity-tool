import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import UserProfileClient from "@/components/profile/UserProfileClient";
import type { Profile } from "@/lib/types";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ cal_connected?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("profiles").select("*").order("full_name"),
  ]);

  if (!profile) redirect("/login");

  return (
    <UserProfileClient
      profile={profile as Profile}
      members={(members || []) as Profile[]}
      calConnected={params.cal_connected === "1"}
    />
  );
}
