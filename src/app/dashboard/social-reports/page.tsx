import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import SocialMediaReport from "@/components/reports/SocialMediaReport";
import { requireAccess } from "@/lib/access";
import { Share2 } from "lucide-react";
import type { Vertical } from "@/lib/types";

export default async function SocialReportsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("social_media_reports");

  const { data: verticals } = await supabase.from("verticals").select("*").order("order_index");

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-200">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Social Media Reports</h1>
            <p className="text-sm text-slate-400">Generate AI-powered reports to share with clients</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <SocialMediaReport verticals={(verticals || []) as Vertical[]} userId={user.id} />
      </div>
    </div>
  );
}
