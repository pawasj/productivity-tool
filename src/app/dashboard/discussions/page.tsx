import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DiscussionBoard from "@/components/forum/DiscussionBoard";
import type { Profile } from "@/lib/types";

export default async function DiscussionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: members } = await supabase.from("profiles").select("*").order("full_name");

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-5">
      <DiscussionBoard
        currentUser={profile as Profile}
        allMembers={(members || []) as Profile[]}
      />
    </div>
  );
}
