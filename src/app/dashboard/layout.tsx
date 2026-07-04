import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import type { Profile } from "@/lib/types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex h-full bg-slate-50">
      <Sidebar profile={profile as Profile | null} />
      <main className="flex-1 overflow-hidden flex flex-col pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
