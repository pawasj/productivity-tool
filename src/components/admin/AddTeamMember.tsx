"use client";

import { useState } from "react";
import { UserPlus, Loader2, CheckCircle2, Copy, RefreshCw, Info } from "lucide-react";
import type { Profile } from "@/lib/types";

const EMPLOYMENT = [
  { value: "full_time", label: "Full-Time" },
  { value: "intern", label: "Intern" },
  { value: "part_time", label: "Part-Time" },
  { value: "freelancer", label: "Freelancer" },
  { value: "contract", label: "Contract" },
];

// Readable temporary password: no lookalike characters
function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => chars[x % chars.length]).join("");
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

const EMPTY = { full_name: "", email: "", department: "", designation: "", employment_type: "full_time", reporting_manager_id: "" };

export default function AddTeamMember({ members, isAdmin }: { members: Profile[]; isAdmin: boolean }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [password, setPassword] = useState(tempPassword);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.full_name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true); setError("");
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No role or access sent: the server forces member + no access for HRMS
      body: JSON.stringify({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password,
        department: form.department.trim() || null,
        designation: form.designation.trim() || null,
        employment_type: form.employment_type,
        reporting_manager_id: form.reporting_manager_id || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || json.error) { setError(json.error || `Couldn't add (${res.status})`); return; }
    setCreated({ name: form.full_name.trim(), email: form.email.trim().toLowerCase(), password });
    setForm({ ...EMPTY });
    setPassword(tempPassword());
  }

  async function copyLogin() {
    if (!created) return;
    await navigator.clipboard.writeText(
      `Welcome to BCC Media Network, ${created.name}!\n\nLogin: https://bombaycontentcompany.com/login\nEmail: ${created.email}\nTemporary password: ${created.password}\n\nPlease change your password after signing in.`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const input = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Add Team Member</h1>
            <p className="text-sm text-slate-400">Create a login for a new employee, intern or freelancer</p>
          </div>
        </div>

        <div className="flex items-start gap-2 px-4 py-3 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            New people start with <span className="font-semibold">no module access</span>.
            {isAdmin ? " Set their access in the Admin Panel afterwards." : " An admin will grant their access after you add them."}
          </p>
        </div>

        {created && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="w-4 h-4" /> {created.name} has been added
            </p>
            <div className="mt-3 text-sm text-emerald-900 space-y-0.5">
              <p>Email: <span className="font-mono">{created.email}</span></p>
              <p>Temporary password: <span className="font-mono font-semibold">{created.password}</span></p>
            </div>
            <p className="text-[11px] text-emerald-700 mt-2">This password is shown only once — share it with them directly.</p>
            <button onClick={copyLogin}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
              <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy login details"}
            </button>
          </div>
        )}

        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Full Name *</span>
              <input value={form.full_name} onChange={e => set("full_name", e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Work Email *</span>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                placeholder="name@bccmedianetwork.com" className={input} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Designation</span>
              <input value={form.designation} onChange={e => set("designation", e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Department</span>
              <input value={form.department} onChange={e => set("department", e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Employment Type</span>
              <select value={form.employment_type} onChange={e => set("employment_type", e.target.value)} className={`${input} bg-white`}>
                {EMPLOYMENT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Reporting Manager</span>
              <select value={form.reporting_manager_id} onChange={e => set("reporting_manager_id", e.target.value)} className={`${input} bg-white`}>
                <option value="">—</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.designation ? ` (${m.designation})` : ""}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1">Temporary Password</span>
            <div className="flex gap-2">
              <input value={password} readOnly className={`${input} font-mono bg-slate-50`} />
              <button type="button" onClick={() => setPassword(tempPassword())} title="Generate another"
                className="px-3 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button type="submit" disabled={!valid || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {saving ? "Adding…" : "Add Team Member"}
          </button>
        </form>
      </div>
    </div>
  );
}
