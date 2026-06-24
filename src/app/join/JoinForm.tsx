"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, X, CheckCircle2, ChevronDown, Users, Globe } from "lucide-react";

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X (Twitter)" },
  { value: "reddit", label: "Reddit" },
  { value: "newsletter", label: "Newsletter / Substack" },
  { value: "website", label: "Website / Blog" },
  { value: "other", label: "Other" },
];

const ALL_CATEGORIES = [
  "Startups", "Memes", "Pop Culture", "News", "Regional", "Motivational",
  "Clips", "Community", "Politics", "Cinema / OTT", "Cricket / Sports",
  "Music", "Devotional", "Other",
];

const CREATOR_CATEGORIES = ALL_CATEGORIES;
const PAGE_CATEGORIES = ALL_CATEGORIES;

interface PlatformEntry {
  platform: string;
  handle_name: string;
  channel_link: string;
  followers: string;
  rate_post: string;
  rate_reel: string;
  rate_story: string;
  rate_carousel: string;
  rate_collab_post: string;
  rate_combo: string;
}

const EMPTY_PLATFORM = (): PlatformEntry => ({
  platform: "instagram", handle_name: "", channel_link: "",
  followers: "", rate_post: "", rate_reel: "", rate_story: "",
  rate_carousel: "", rate_collab_post: "", rate_combo: "",
});

function fmtFollowers(s: string) {
  const n = parseInt(s.replace(/[^0-9]/g, ""));
  if (!n) return "";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default function JoinForm() {
  const [step, setStep] = useState<"type" | "form" | "done">("type");
  const [influencerType, setInfluencerType] = useState<"creator" | "page" | null>(null);
  const [personName, setPersonName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [platforms, setPlatforms] = useState<PlatformEntry[]>([EMPTY_PLATFORM()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const categories = influencerType === "creator" ? CREATOR_CATEGORIES : PAGE_CATEGORIES;

  function updatePlatform(idx: number, field: keyof PlatformEntry, value: string) {
    setPlatforms(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPlatform() {
    setPlatforms(prev => [...prev, EMPTY_PLATFORM()]);
  }

  function removePlatform(idx: number) {
    if (platforms.length === 1) return;
    setPlatforms(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!influencerType) return;
    const primary = platforms[0];
    if (!primary.handle_name.trim() || !primary.platform) {
      setError("Please fill in at least the primary handle and platform.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_type: influencerType,
          person_name: personName,
          contact_no: contactNo,
          email,
          location,
          state,
          category: category || categories[0],
          notes,
          platforms,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Submission failed");
      }
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step: choose type ──────────────────────────────────────────────────────
  if (step === "type") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Logo / Brand */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <Image src="/bcc-logo.png" alt="BCC Media Network" width={160} height={60} className="object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Join BCC Media Network</h1>
            <p className="text-slate-500 mt-2 text-sm">Get discovered by leading brands. Register your profile for free.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-2 text-center">What best describes you?</h2>
            <p className="text-sm text-slate-400 text-center mb-6">This helps us match you with the right brand campaigns.</p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setInfluencerType("creator"); setStep("form"); }}
                className="flex flex-col items-center gap-3 p-6 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Users className="w-7 h-7 text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-800">Individual Creator</p>
                  <p className="text-xs text-slate-400 mt-1">YouTubers, bloggers, influencers, thought leaders</p>
                </div>
              </button>

              <button
                onClick={() => { setInfluencerType("page"); setStep("form"); }}
                className="flex flex-col items-center gap-3 p-6 border-2 border-slate-200 rounded-xl hover:border-violet-500 hover:bg-violet-50 transition-all group">
                <div className="w-14 h-14 bg-violet-100 rounded-xl flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                  <Globe className="w-7 h-7 text-violet-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-800">Community Page</p>
                  <p className="text-xs text-slate-400 mt-1">Meme pages, news pages, newsletters, subreddits</p>
                </div>
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Already registered? Your profile will be reviewed within 2–3 business days.
          </p>
        </div>
      </div>
    );
  }

  // ── Step: done ─────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">You&apos;re on our radar!</h1>
          <p className="text-slate-500 mb-2">Thank you for registering with BCC Media Network.</p>
          <p className="text-slate-400 text-sm">Our team will review your profile within 2–3 business days. Once approved, you&apos;ll be eligible for brand campaigns matching your niche.</p>
          <div className="mt-8 p-4 bg-white rounded-xl border border-slate-200 text-left">
            <p className="text-xs font-semibold text-slate-500 mb-2">WHAT HAPPENS NEXT</p>
            <div className="space-y-2">
              {["Our team reviews your profile", "You get added to our creator database", "Brands discover and reach out to you via your contact details"].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-blue-600">{i + 1}</span>
                  </div>
                  <p className="text-sm text-slate-600">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: form ─────────────────────────────────────────────────────────────
  const accentColor = influencerType === "creator" ? "blue" : "violet";
  const accentClasses = {
    badge: influencerType === "creator" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700",
    ring: "focus:ring-2 focus:ring-indigo-500",
    btn: influencerType === "creator" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700",
    header: influencerType === "creator" ? "from-blue-600 to-indigo-600" : "from-violet-600 to-indigo-600",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50">
      {/* Header */}
      <div className={`bg-gradient-to-r ${accentClasses.header} px-6 py-6`}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button onClick={() => setStep("type")} className="p-2 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">
              {influencerType === "creator" ? "Creator Registration" : "Community Page Registration"}
            </h1>
            <p className="text-sm text-white/70">Fill in your details to join BCC Media Network</p>
          </div>
          <span className={`ml-auto text-xs font-semibold px-3 py-1 rounded-full bg-white/20 text-white`}>
            {influencerType === "creator" ? "Individual Creator" : "Community Page"}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Personal / Contact Info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-800">
              {influencerType === "creator" ? "Your Personal Details" : "Page Owner Details"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Used to contact you when brands want to collaborate</p>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {influencerType === "creator" ? "Your Name" : "Admin / Owner Name"}
              </label>
              <input value={personName} onChange={e => setPersonName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Number</label>
              <input value={contactNo} onChange={e => setContactNo(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email ID</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">City / Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Mumbai, Delhi"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
              <input value={state} onChange={e => setState(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Content Category</label>
              <div className="relative">
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8">
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">About / Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Briefly describe your content, audience demographics, past brand collaborations…"
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
          </div>
        </div>

        {/* Platform(s) */}
        <div className="space-y-4">
          {platforms.map((p, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-800">
                    {idx === 0 ? "Primary Platform" : `Additional Platform ${idx + 1}`}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Handle, follower count, and pricing</p>
                </div>
                {idx > 0 && (
                  <button type="button" onClick={() => removePlatform(idx)}
                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Platform *</label>
                  <div className="relative">
                    <select value={p.platform} onChange={e => updatePlatform(idx, "platform", e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8">
                      {PLATFORMS.map(pl => <option key={pl.value} value={pl.value}>{pl.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Handle / Username *
                    {idx === 0 && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input value={p.handle_name} onChange={e => updatePlatform(idx, "handle_name", e.target.value)}
                    placeholder="@yourhandle or channel name"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Profile / Channel Link</label>
                  <input value={p.channel_link} onChange={e => updatePlatform(idx, "channel_link", e.target.value)}
                    placeholder="https://instagram.com/yourhandle"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Followers / Subscribers</label>
                  <input value={p.followers} onChange={e => updatePlatform(idx, "followers", e.target.value)}
                    placeholder="e.g. 125000 or 125K"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  {p.followers && <p className="text-xs text-slate-400 mt-1">{fmtFollowers(p.followers)}</p>}
                </div>

                {/* Pricing */}
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Pricing (₹) — leave blank if not applicable</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { field: "rate_post" as const, label: "Static Post" },
                      { field: "rate_reel" as const, label: "Reel / Short" },
                      { field: "rate_story" as const, label: "Story" },
                      { field: "rate_carousel" as const, label: "Carousel" },
                      { field: "rate_collab_post" as const, label: "Collab Post" },
                      { field: "rate_combo" as const, label: "Combo" },
                    ].map(({ field, label }) => (
                      <div key={field}>
                        <label className="block text-[11px] text-slate-500 mb-1">{label}</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">₹</span>
                          <input type="number" value={p[field]} onChange={e => updatePlatform(idx, field, e.target.value)}
                            placeholder="0"
                            className="w-full pl-6 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={addPlatform}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Another Platform
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <p className="text-xs text-slate-400 mb-4 text-center">
            By submitting, you agree to be contacted by BCC Media Network for brand collaboration opportunities.
            Your information will not be shared publicly.
          </p>
          <button type="submit" disabled={submitting}
            className={`w-full py-3.5 ${accentClasses.btn} text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60 shadow-sm`}>
            {submitting ? "Submitting…" : "Submit Registration"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 pb-8">
          BCC Media Network · bccmedia.in · Connecting brands with the right voices
        </p>
      </form>
    </div>
  );
}
