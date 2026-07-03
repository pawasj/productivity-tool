import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import OwnedMediaClient from "@/components/owned-media/OwnedMediaClient";
import { requireAccess } from "@/lib/access";

export default async function OwnedMediaPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("owned_media");

  return <OwnedMediaClient />;
}
