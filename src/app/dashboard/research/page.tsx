import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ResearchClient from "@/components/research/ResearchClient";
import { requireAccess } from "@/lib/access";

export default async function ResearchPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("research_hub");

  return <ResearchClient userId={user.id} />;
}
