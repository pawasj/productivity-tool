import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import OwnedMediaClient from "@/components/owned-media/OwnedMediaClient";
import { requireAccess } from "@/lib/access";

export default async function OwnedMediaPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("owned_media");

  const svc = createServiceRoleClient();
  const { data: members } = await svc
    .from("profiles")
    .select("id, full_name")
    .order("full_name");

  return <OwnedMediaClient members={(members || []) as { id: string; full_name: string }[]} />;
}
