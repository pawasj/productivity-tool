"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { TrendingUp, Plus, ExternalLink } from "lucide-react";
import type { Lead, Profile } from "@/lib/types";
import { STATUS_COLORS, formatDate } from "@/lib/utils";
import Link from "next/link";

interface Props { verticalId: string; members: Profile[]; verticalColor: string; }

const STATUS_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", proposal: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost", on_hold: "On Hold",
};

export default function VerticalPipelineModule({ verticalId, members, verticalColor }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const supabase = createClient();

  useEffect(() => { fetchLeads(); }, [verticalId]);

  async function fetchLeads() {
    const { data } = await supabase
      .from("leads")
      .select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name)")
      .eq("vertical_id", verticalId)
      .not("status", "in", '("won","lost")')
      .order("updated_at", { ascending: false })
      .limit(5);
    setLeads((data || []) as Lead[]);
  }

  const totalValue = leads.reduce((sum, l) => sum + (l.deal_value || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: verticalColor }} />
          <h3 className="font-semibold text-slate-900 text-sm">Sales Pipeline</h3>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${verticalColor}20`, color: verticalColor }}>
            {leads.length} active
          </span>
          {totalValue > 0 && (
            <span className="text-xs text-slate-400">· ₹{(totalValue / 100000).toFixed(1)}L in pipeline</span>
          )}
        </div>
        <Link href={`/dashboard/pipeline?vertical=${verticalId}`}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> View all
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          <TrendingUp className="w-7 h-7 mx-auto mb-2 opacity-30" />
          No active leads
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Company</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Contact</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Our POC</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Value</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800 text-xs">{lead.company_name}</p>
                    {lead.location && <p className="text-xs text-slate-400">{lead.location}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{lead.contact_name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status]}`}>
                      {STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {(lead.our_poc as Profile)?.full_name || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {lead.deal_value ? `₹${lead.deal_value.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{formatDate(lead.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
