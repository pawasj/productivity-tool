import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import OwnedMediaSalesClient from "@/components/owned-media/OwnedMediaSalesClient";
import { requireAccess } from "@/lib/access";

export default async function OwnedMediaSalesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("owned_media_sales");

  const svc = createServiceRoleClient();
  const { data: properties } = await svc
    .from("owned_media_properties")
    .select("id, name")
    .order("name");

  return (
    <OwnedMediaSalesClient
      userId={user.id}
      properties={(properties || []) as { id: string; name: string }[]}
    />
  );
}
