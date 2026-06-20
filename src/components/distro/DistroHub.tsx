"use client";

import { useState } from "react";
import { Network, Database, FileText, BarChart3, Activity } from "lucide-react";
import type { Profile, Vertical } from "@/lib/types";
import InfluencerDB from "./InfluencerDB";
import BriefPlanner from "./BriefPlanner";
import DistroCRM from "./DistroCRM";

interface Props {
  profile: Profile;
  userId: string;
  verticals: Vertical[];
}

const TABS = [
  { id: "db", label: "Influencer Database", icon: Database },
  { id: "brief", label: "New Campaign Brief", icon: FileText },
  { id: "crm", label: "Client CRM", icon: BarChart3 },
];

export default function DistroHub({ profile, userId, verticals }: Props) {
  const [activeTab, setActiveTab] = useState("db");

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
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "db" && <InfluencerDB />}
        {activeTab === "brief" && <BriefPlanner />}
        {activeTab === "crm" && <DistroCRM />}
      </div>
    </div>
  );
}
