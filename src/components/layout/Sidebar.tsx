"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  LayoutDashboard, TrendingUp,
  LogOut, ChevronRight, Shield, Network,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import NotificationBell from "./NotificationBell";

interface SidebarProps {
  profile: Profile | null;
}

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/pipeline", icon: TrendingUp, label: "Sales Pipeline" },
  { href: "/dashboard/distro", icon: Network, label: "Distribution Hub" },
];

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
      {/* Brand */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <Image src="/bcc-logo.png" alt="BCC Media Network" width={130} height={36} className="object-contain" priority />
          <NotificationBell />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 pt-2 pb-1">
          Workspace
        </p>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = href === "/dashboard"
            ? pathname === "/dashboard" || (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/pipeline") && !pathname.startsWith("/dashboard/admin") && !pathname.startsWith("/dashboard/distro"))
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400" />}
            </Link>
          );
        })}

        {profile?.role === "admin" && (
          <>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 pt-4 pb-1">
              Administration
            </p>
            <Link
              href="/dashboard/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/dashboard/admin")
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin Panel
            </Link>
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
            {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{profile?.full_name || "User"}</p>
            <p className="text-xs text-slate-400 truncate">{profile?.role}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors mt-1"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
