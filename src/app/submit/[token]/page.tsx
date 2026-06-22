"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { CheckCircle, Upload, Loader2, AlertCircle } from "lucide-react";

const PLATFORM_FORMATS: Record<string, string[]> = {
  Instagram: ["Reel", "Carousel Post", "Static Post", "Story", "Live"],
  YouTube: ["YouTube Video", "YouTube Short", "YouTube Live"],
  Reddit: ["Post", "Comment", "Video Post"],
  Twitter: ["Tweet", "Thread", "Video Tweet"],
  LinkedIn: ["Post", "Article", "Video", "Carousel"],
  Facebook: ["Reel", "Post", "Video", "Story", "Live"],
  TikTok: ["Video", "Live", "Story"],
  Other: ["Post", "Video", "Story", "Other"],
};

const PLATFORMS = Object.keys(PLATFORM_FORMATS);

interface CampaignInfo {
  brand_name: string;
  industry?: string;
  campaign_type?: string;
  brief_id: string;
}

export default function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [handleName, setHandleName] = useState("");
  const [liveLink, setLiveLink] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [format, setFormat] = useState("Reel");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    params.then(p => {
      setToken(p.token);
      fetch(`/api/submit/${p.token}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) setError(d.error);
          else setCampaign(d);
        })
        .catch(() => setError("Failed to load campaign info"))
        .finally(() => setLoading(false));
    });
  }, []);

  function handleFile(file: File) {
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshot) { alert("Please upload a screenshot of your analytics."); return; }
    if (!liveLink.startsWith("http")) { alert("Live link must start with http/https."); return; }
    setSubmitting(true);

    try {
      // Upload screenshot to Supabase storage
      const ext = screenshot.name.split(".").pop() || "png";
      const path = `submissions/${token}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("campaign-screenshots")
        .upload(path, screenshot, { contentType: screenshot.type });
      if (upErr) throw new Error("Screenshot upload failed: " + upErr.message);

      const { data: urlData } = supabase.storage
        .from("campaign-screenshots")
        .getPublicUrl(path);

      // Submit to API
      const res = await fetch(`/api/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle_name: handleName,
          live_link: liveLink,
          platform,
          format,
          screenshot_url: urlData.publicUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submission failed");
      setSubmitted(true);
    } catch (err) {
      alert(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-slate-600">{error}</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Submitted!</h1>
        <p className="text-slate-500">Your campaign metrics have been received. The team will review and update the campaign results. Thank you!</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Campaign Metrics Submission</p>
          <h1 className="text-2xl font-bold text-slate-900">{campaign?.brand_name}</h1>
          {(campaign?.industry || campaign?.campaign_type) && (
            <p className="text-sm text-slate-500 mt-1">
              {[campaign.industry, campaign.campaign_type].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <p className="text-sm text-slate-500">
            Please fill in your post details and upload a screenshot of your analytics dashboard (shows views, likes, reach, etc.)
          </p>

          {/* Handle name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your Page / Handle Name <span className="text-red-500">*</span></label>
            <input
              required
              value={handleName}
              onChange={e => setHandleName(e.target.value)}
              placeholder="e.g. @youraccount"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Live link */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Live Post / Reel Link <span className="text-red-500">*</span></label>
            <input
              required
              value={liveLink}
              onChange={e => setLiveLink(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              type="url"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Platform + Format row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Platform <span className="text-red-500">*</span></label>
              <select
                value={platform}
                onChange={e => { setPlatform(e.target.value); setFormat(PLATFORM_FORMATS[e.target.value]?.[0] || ""); }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Format <span className="text-red-500">*</span></label>
              <select
                value={format}
                onChange={e => setFormat(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(PLATFORM_FORMATS[platform] || []).map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Screenshot upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Analytics Screenshot <span className="text-red-500">*</span></label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => document.getElementById("screenshot-input")?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"}`}
            >
              {screenshotPreview ? (
                <img src={screenshotPreview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Drag & drop or click to upload</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP supported</p>
                </>
              )}
            </div>
            <input
              id="screenshot-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {screenshot && (
              <p className="text-xs text-green-600 mt-1">✓ {screenshot.name}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit My Metrics"}
          </button>
        </form>
      </div>
    </div>
  );
}
