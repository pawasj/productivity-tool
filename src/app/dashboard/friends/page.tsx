import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import FriendsClient from "@/components/friends/FriendsClient";
import { requireAccess } from "@/lib/access";

export default async function FriendsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAccess("friends_of_bcc");

  return <FriendsClient userId={user.id} />;
}
