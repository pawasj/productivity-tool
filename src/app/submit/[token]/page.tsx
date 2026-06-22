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
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
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

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    setScreenshots(prev => [...prev, ...arr]);
    setScreenshotPreviews(prev => [...prev, ...arr.map(f => URL.createObjectURL(f))]);
  }

  function removeScreenshot(idx: number) {
    setScreenshots(prev => prev.filter((_, i) => i !== idx));
    setScreenshotPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshots.length) { alert("Please upload at least one analytics screenshot."); return; }
    if (!liveLink.startsWith("http")) { alert("Live link must start with http/https."); return; }
    setSubmitting(true);

    try {
      // Upload all screenshots
      const uploadedUrls: string[] = [];
      for (const file of screenshots) {
        const ext = file.name.split(".").pop() || "png";
        const path = `submissions/${token}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("campaign-screenshots")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error("Screenshot upload failed: " + upErr.message);
        const { data: urlData } = supabase.storage.from("campaign-screenshots").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const res = await fetch(`/api/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle_name: handleName,
          live_link: liveLink,
          platform,
          format,
          screenshot_urls: uploadedUrls,
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Analytics Screenshots <span className="text-red-500">*</span>
              <span className="text-xs font-normal text-slate-400 ml-1">— upload as many as needed (views, reach, likes, etc.)</span>
            </label>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById("screenshot-input")?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"}`}
            >
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
              <p className="text-sm text-slate-500">Drag & drop or click to upload</p>
              <p className="text-xs text-slate-400 mt-0.5">PNG, JPG, WEBP · multiple files allowed</p>
            </div>
            <input
              id="screenshot-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
            />

            {/* Previews grid */}
            {screenshotPreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {screenshotPreviews.map((src, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200">
                    <img src={src} alt={`screenshot ${i + 1}`} className="w-full h-32 object-cover" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(i)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >✕</button>
                    <p className="text-xs text-slate-500 px-2 py-1 truncate">{screenshots[i]?.name}</p>
                  </div>
                ))}
                {/* Add more button */}
                <div
                  onClick={() => document.getElementById("screenshot-input")?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-slate-50 transition-colors"
                >
                  <Upload className="w-5 h-5 text-slate-300 mb-1" />
                  <p className="text-xs text-slate-400">Add more</p>
                </div>
              </div>
            )}

            {screenshots.length > 0 && (
              <p className="text-xs text-green-600 mt-1.5">✓ {screenshots.length} screenshot{screenshots.length > 1 ? "s" : ""} ready</p>
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
