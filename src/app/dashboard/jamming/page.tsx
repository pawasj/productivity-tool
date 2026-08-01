import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import JammingBoardClient from "@/components/jamming/JammingBoardClient";
import { requireAccess } from "@/lib/access";

export default async function JammingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await requireAccess("jamming_board");

  const svc = createServiceRoleClient();
  const { data: clients } = await svc.from("clients").select("name").order("name");

  return (
    <JammingBoardClient
      userId={user.id}
      userName={profile.full_name || "Someone"}
      clientNames={Array.from(new Set((clients || []).map(c => (c as { name: string }).name).filter(Boolean)))}
    />
  );
}
