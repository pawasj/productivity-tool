import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import VendorManager from "@/components/vendors/VendorManager";
import { requireAccess } from "@/lib/access";
import type { Profile } from "@/lib/types";

export default async function VendorsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("vendor_management");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return <VendorManager currentUser={profile as Profile} />;
}
