"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Network, Database, FileText, Clock } from "lucide-react";
import type { Profile, Vertical } from "@/lib/types";
import InfluencerDB from "./InfluencerDB";
import BriefPlanner from "./BriefPlanner";
import PendingApprovals from "./PendingApprovals";
import { createClient } from "@/lib/supabase";

interface Props {
  profile: Profile;
  userId: string;
  verticals: Vertical[];
}

export default function DistroHub({ profile, userId, verticals }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("db");
  const [editingBriefId, setEditingBriefId] = useState<string | null>(null);
  const [prefillData, setPrefillData] = useState<Record<string, string> | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const supabase = createClient();

  // Load pending count for badge
  useEffect(() => {
    supabase.from("influencer_submissions").select("id", { count: "exact", head: true }).eq("status", "pending")
      .then(({ count }) => setPendingCount(count || 0));
  }, []);

  useEffect(() => {
    const briefId = searchParams.get("brief");
    const prefill = searchParams.get("prefill");
    if (briefId) {
      setEditingBriefId(briefId);
      setActiveTab("brief");
      router.replace("/dashboard/distro", { scroll: false });
    } else if (prefill) {
      try {
        const data = JSON.parse(decodeURIComponent(prefill));
        setPrefillData(data);
        setEditingBriefId(null);
        setActiveTab("brief");
        router.replace("/dashboard/distro", { scroll: false });
      } catch { /* ignore bad JSON */ }
    }
  }, []);

  function handleTabChange(id: string) {
    if (id !== "brief") setEditingBriefId(null);
    setActiveTab(id);
  }

  const TABS = [
    { id: "db", label: "Influencer Database", icon: Database },
    { id: "brief", label: "Campaign Brief", icon: FileText },
    { id: "pending", label: "Pending Approvals", icon: Clock, badge: pendingCount },
  ];

  // Which subtype to show in pending (creator or page, based on which DB sub-tab was active)
  // Default to showing both — we'll put a sub-tab toggle inside PendingApprovals
  const [pendingSubtype, setPendingSubtype] = useState<"creator" | "page">("creator");

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Distribution Hub</h1>
            <p className="text-sm text-slate-400">Manage influencers, build media plans, track campaigns</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {id === "brief" && editingBriefId && (
                <span className="ml-1 text-xs bg-blue-400/30 px-1.5 py-0.5 rounded-full">editing</span>
              )}
              {badge != null && badge > 0 && (
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === id ? "bg-white/20 text-white" : "bg-amber-500 text-white"}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "db" && <InfluencerDB />}
        {activeTab === "brief" && (
          <BriefPlanner
            key={editingBriefId || "new"}
            initialBriefId={editingBriefId || undefined}
            prefillData={prefillData || undefined}
            onNewBrief={() => { setEditingBriefId(null); setPrefillData(null); }}
          />
        )}
        {activeTab === "pending" && (
          <div>
            {/* Sub-type toggle */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-5">
              {(["creator", "page"] as const).map(t => (
                <button key={t} onClick={() => setPendingSubtype(t)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${pendingSubtype === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {t === "creator" ? "👤 Creators" : "📄 Community Pages"}
                </button>
              ))}
            </div>
            <PendingApprovals key={pendingSubtype} subtype={pendingSubtype} onCountChange={(delta) => setPendingCount(c => Math.max(0, c + delta))} />
          </div>
        )}
      </div>
    </div>
  );
}
