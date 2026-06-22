import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import CampaignResults from "@/components/results/CampaignResults";

interface Props {
  searchParams: Promise<{ brief?: string }>;
}

export default async function ResultsPage({ searchParams }: Props) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const briefId = params.brief || null;

  return <CampaignResults initialBriefId={briefId} />;
}
