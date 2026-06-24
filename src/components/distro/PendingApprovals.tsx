"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  CheckCircle2, XCircle, Clock, Users, Globe, ExternalLink,
  RefreshCw, ChevronDown, ChevronUp, Phone, Mail, MapPin,
} from "lucide-react";

interface Submission {
  id: string;
  influencer_type: "creator" | "page";
  handle_name: string;
  channel_link?: string;
  platform: string;
  category?: string;
  followers?: number;
  rate_post?: number;
  rate_reel?: number;
  rate_story?: number;
  rate_carousel?: number;
  rate_collab_post?: number;
  rate_combo?: number;
  person_name?: string;
  contact_no?: string;
  email?: string;
  location?: string;
  state?: string;
  notes?: string;
  additional_platforms?: Record<string, unknown>[];
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at?: string;
}

function fmt(n?: number | null) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtRupee(n?: number | null) {
  if (!n) return "—";
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", youtube: "▶️", linkedin: "💼", x: "✖️",
  reddit: "🔴", newsletter: "📨", website: "🌐", other: "🔗",
};

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
      <span>{PLATFORM_ICONS[platform] || "🔗"}</span>
      <span className="capitalize">{platform}</span>
    </span>
  );
}

interface CardProps {
  sub: Submission;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  actionLoading: string | null;
}

function SubmissionCard({ sub, onApprove, onReject, actionLoading }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const loading = actionLoading === sub.id;
  const additional = sub.additional_platforms || [];

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${
      sub.status === "pending" ? "border-slate-200" : sub.status === "approved" ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/20 opacity-70"
    }`}>
      {/* Top row */}
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Avatar */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
          sub.influencer_type === "creator" ? "bg-blue-100" : "bg-violet-100"
        }`}>
          {sub.influencer_type === "creator" ? "👤" : "📄"}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900">{sub.handle_name}</span>
            <PlatformBadge platform={sub.platform} />
            {additional.length > 0 && (
              <span className="text-xs text-slate-400">+{additional.length} more platform{additional.length > 1 ? "s" : ""}</span>
            )}
            {sub.status === "approved" && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Approved
              </span>
            )}
            {sub.status === "rejected" && (
              <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Rejected
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {sub.category && <span className="text-xs text-slate-500">{sub.category}</span>}
            {sub.followers && (
              <span className="text-xs text-slate-500 font-medium">{fmt(sub.followers)} followers</span>
            )}
            {sub.person_name && (
              <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" />{sub.person_name}</span>
            )}
            {sub.location && (
              <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{sub.location}{sub.state ? `, ${sub.state}` : ""}</span>
            )}
          </div>

          {/* Contact quick view */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {sub.contact_no && (
              <a href={`tel:${sub.contact_no}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Phone className="w-3 h-3" />{sub.contact_no}
              </a>
            )}
            {sub.email && (
              <a href={`mailto:${sub.email}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Mail className="w-3 h-3" />{sub.email}
              </a>
            )}
          </div>

          {/* Quick rates */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {[
              { label: "Post", val: sub.rate_post },
              { label: "Reel", val: sub.rate_reel },
              { label: "Story", val: sub.rate_story },
              { label: "Collab", val: sub.rate_collab_post },
              { label: "Combo", val: sub.rate_combo },
            ].filter(r => r.val).map(r => (
              <span key={r.label} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {r.label}: <strong>{fmtRupee(r.val)}</strong>
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {sub.channel_link && (
            <a href={sub.channel_link} target="_blank" rel="noreferrer"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors" title="View profile">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" title="Expand">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {sub.status === "pending" && (
            <>
              <button
                onClick={() => onReject(sub.id)}
                disabled={loading}
                className="flex items-center gap-1 text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              <button
                onClick={() => onApprove(sub.id)}
                disabled={loading}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50">
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-4">
          {/* Rates table */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">PRICING — PRIMARY PLATFORM</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Static Post", val: sub.rate_post },
                { label: "Reel / Short", val: sub.rate_reel },
                { label: "Story", val: sub.rate_story },
                { label: "Carousel", val: sub.rate_carousel },
                { label: "Collab Post", val: sub.rate_collab_post },
                { label: "Combo", val: sub.rate_combo },
              ].map(r => (
                <div key={r.label} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-[10px] text-slate-400">{r.label}</p>
                  <p className="text-sm font-bold text-slate-800">{fmtRupee(r.val)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Additional platforms */}
          {additional.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">ADDITIONAL PLATFORMS</p>
              <div className="space-y-2">
                {additional.map((ap, i) => (
                  <div key={i} className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
                    <PlatformBadge platform={String(ap.platform ?? "other")} />
                    <span className="text-sm font-medium text-slate-800">{String(ap.handle_name ?? "")}</span>
                    {ap.followers != null && <span className="text-xs text-slate-400">{fmt(Number(ap.followers))} followers</span>}
                    {typeof ap.channel_link === "string" && ap.channel_link && (
                      <a href={ap.channel_link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-auto">
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {sub.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">NOTES</p>
              <p className="text-sm text-slate-600">{sub.notes}</p>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Submitted {new Date(sub.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {sub.reviewed_at && ` · Reviewed ${new Date(sub.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PendingApprovals({ subtype }: { subtype: "creator" | "page" }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("influencer_submissions")
      .select("*")
      .eq("influencer_type", subtype)
      .order("submitted_at", { ascending: false });
    setSubmissions((data || []) as Submission[]);
    setLoading(false);
  }, [subtype]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    if (!confirm(action === "approve" ? "Approve and add to database?" : "Reject this submission?")) return;
    setActionLoading(id);
    try {
      const res = await fetch("/api/distro/approve-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error("Action failed");
      // Update local state
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: action === "approve" ? "approved" : "rejected" } : s));
    } catch (err) {
      alert("Something went wrong. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = submissions.filter(s => filter === "all" || s.status === filter);
  const pendingCount = submissions.filter(s => s.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {(["pending", "approved", "rejected", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${filter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {f === "pending" && pendingCount > 0 ? (
                  <span className="flex items-center gap-1.5">
                    Pending
                    <span className="w-4 h-4 bg-amber-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">{pendingCount}</span>
                  </span>
                ) : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">{filtered.length} submission{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Share link */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-800">Share Registration Link</p>
          <p className="text-xs text-blue-500 mt-0.5">Send this to creators and pages to self-register</p>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700 font-mono">
            {typeof window !== "undefined" ? `${window.location.origin}/join` : "/join"}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join`)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Copy
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading submissions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No {filter === "all" ? "" : filter} submissions</p>
          <p className="text-xs mt-1">Share the registration link to start receiving profiles</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => (
            <SubmissionCard
              key={sub.id}
              sub={sub}
              onApprove={id => handleAction(id, "approve")}
              onReject={id => handleAction(id, "reject")}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
