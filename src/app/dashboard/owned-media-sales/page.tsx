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
  const [{ data: properties }, { data: members }] = await Promise.all([
    svc.from("owned_media_properties").select("id, name").order("name"),
    svc.from("profiles").select("id, full_name").order("full_name"),
  ]);

  return (
    <OwnedMediaSalesClient
      userId={user.id}
      properties={(properties || []) as { id: string; name: string }[]}
      members={(members || []) as { id: string; full_name: string }[]}
    />
  );
}
