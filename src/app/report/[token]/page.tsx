import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import type { SocialPlatformData } from "@/lib/types";

// Public page — no auth required. Use service role for anon-accessible read.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Report {
  id: string; client_name: string; period_from: string; period_to: string;
  platforms: SocialPlatformData[]; analysis?: string; created_at: string;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { data } = await supabase.from("social_media_reports").select("client_name").eq("share_token", token).single();
  return { title: data ? `Social Media Report — ${data.client_name}` : "Social Media Report" };
}

function fmtNum(n?: number) {
  if (!n && n !== 0) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function PlatformSection({ p }: { p: SocialPlatformData & Record<string, unknown> }) {
  const metrics: { label: string; value: string }[] = [];
  if (p.followers !== undefined) metrics.push({ label: "Followers", value: fmtNum(p.followers) });
  if (p.new_followers !== undefined) metrics.push({ label: "New Followers", value: `+${fmtNum(p.new_followers)}` });
  if (p.posts !== undefined) metrics.push({ label: "Posts", value: fmtNum(p.posts) });
  if (p.reach !== undefined) metrics.push({ label: "Reach", value: fmtNum(p.reach) });
  if (p.impressions !== undefined) metrics.push({ label: "Impressions", value: fmtNum(p.impressions) });
  if (p.engagements !== undefined) metrics.push({ label: "Engagements", value: fmtNum(p.engagements) });
  if (p.engagement_rate !== undefined) metrics.push({ label: "Eng. Rate", value: `${p.engagement_rate}%` });
  if (p.likes !== undefined) metrics.push({ label: "Likes", value: fmtNum(p.likes as number) });
  if (p.comments !== undefined) metrics.push({ label: "Comments", value: fmtNum(p.comments as number) });
  if (p.shares !== undefined) metrics.push({ label: "Shares", value: fmtNum(p.shares as number) });
  if (p.saves !== undefined) metrics.push({ label: "Saves", value: fmtNum(p.saves as number) });
  if (p.video_views !== undefined) metrics.push({ label: "Video Views", value: fmtNum(p.video_views) });
  if (p.stories_views !== undefined) metrics.push({ label: "Stories Views", value: fmtNum(p.stories_views as number) });
  if (p.profile_visits !== undefined) metrics.push({ label: "Profile Visits", value: fmtNum(p.profile_visits as number) });
  if (p.link_clicks !== undefined) metrics.push({ label: "Link Clicks", value: fmtNum(p.link_clicks as number) });
  if (p.top_post_reach !== undefined) metrics.push({ label: "Top Post Reach", value: fmtNum(p.top_post_reach) });

  const platformColors: Record<string, string> = {
    Instagram: "#E1306C", YouTube: "#FF0000", LinkedIn: "#0A66C2",
    Facebook: "#1877F2", "Twitter/X": "#000000", Threads: "#101010",
    Snapchat: "#FFFC00",
  };
  const color = platformColors[p.platform] || "#6366f1";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: color }}>
          {p.platform[0]}
        </div>
        <h3 className="font-bold text-slate-900">{p.platform}</h3>
      </div>
      <div className="p-5 grid grid-cols-3 gap-3">
        {metrics.map(m => <MetricCard key={m.label} label={m.label} value={m.value} />)}
      </div>
    </div>
  );
}

function renderAnalysis(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold text-slate-900 mt-6 mb-3">{line.slice(3)}</h2>;
    if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold text-slate-800 mt-4 mb-2">{line.slice(4)}</h3>;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <li key={i} className="ml-4 text-slate-700 leading-relaxed mb-1 list-disc"
          dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
      );
    }
    if (!line.trim()) return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-slate-700 leading-relaxed mb-2"
        dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
    );
  });
}

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: report } = await supabase
    .from("social_media_reports")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!report) notFound();

  const r = report as Report;
  const fromLabel = new Date(r.period_from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const toLabel = new Date(r.period_to).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-2 font-semibold">BCC Media Network</p>
              <h1 className="text-3xl font-bold mb-2">{r.client_name}</h1>
              <p className="text-slate-300 text-sm">Social Media Performance Report</p>
              <p className="text-slate-400 text-xs mt-1">{fromLabel} — {toLabel}</p>
            </div>
            <div className="text-right">
              <div className="flex gap-2 flex-wrap justify-end">
                {(r.platforms || []).map((p: SocialPlatformData) => (
                  <span key={p.platform} className="text-xs bg-white/10 text-white px-2.5 py-1 rounded-full">{p.platform}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Platform sections */}
        {(r.platforms || []).map((p: SocialPlatformData) => (
          <PlatformSection key={p.platform} p={p} />
        ))}

        {/* AI Analysis */}
        {r.analysis && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-slate-900">AI-Powered Analysis</h2>
                <p className="text-xs text-slate-400">Generated by BCC Media Network</p>
              </div>
            </div>
            <div className="prose max-w-none">
              {renderAnalysis(r.analysis)}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4 border-t border-slate-200">
          <p className="text-xs text-slate-400">
            This report was prepared by <span className="font-semibold text-slate-600">BCC Media Network</span> for {r.client_name}.
          </p>
          <p className="text-xs text-slate-300 mt-1">
            Generated on {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  );
}
