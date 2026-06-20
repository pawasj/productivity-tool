"use client";

import { useState } from "react";
import { TrendingUp, BarChart3, Briefcase } from "lucide-react";
import type { Lead, Profile, Vertical } from "@/lib/types";
import PipelineClient from "@/components/modules/PipelineClient";
import DistroCRM from "@/components/distro/DistroCRM";

interface Props {
  initialLeads: Lead[];
  initialBriefs: Record<string, unknown>[];
  members: Profile[];
  verticals: Vertical[];
  profile: Profile;
  userId: string;
}

const TABS = [
  { id: "pipeline", label: "Sales Pipeline", icon: TrendingUp, desc: "Your personal leads & opportunities" },
  { id: "campaigns", label: "Campaign Briefs", icon: BarChart3, desc: "Distribution campaign tracker" },
];

export default function SalesCRMClient({ initialLeads, members, verticals, profile, userId }: Props) {
  const [activeTab, setActiveTab] = useState("pipeline");

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-sm shadow-emerald-200">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sales CRM</h1>
            <p className="text-sm text-slate-400">Pipeline, leads, and campaign briefs — all in one place</p>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "pipeline" && (
          <PipelineClient
            initialLeads={initialLeads}
            initialBriefs={[]}
            members={members}
            verticals={verticals}
            profile={profile}
            userId={userId}
          />
        )}
        {activeTab === "campaigns" && (
          <div className="p-5">
            <DistroCRM />
          </div>
        )}
      </div>
    </div>
  );
}
