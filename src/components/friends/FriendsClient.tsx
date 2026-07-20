"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  HeartHandshake, Plus, X, Check, Loader2, Trash2, Pencil, Search,
  PhoneCall, Mail, MapPin, Building2,
} from "lucide-react";

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
  </svg>
);

const supabase = createClient();

interface Friend {
  id: string;
  name: string;
  company?: string;
  city?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  relationship?: string;
  created_by?: string;
  created_at: string;
}

const EMPTY = { id: "", name: "", company: "", city: "", phone: "", email: "", linkedin: "", relationship: "" };

interface Props { userId: string; }

export default function FriendsClient({ userId }: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("friends_of_bcc").select("*").order("name");
    setFriends((data || []) as Friend[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      company: form.company || null,
      city: form.city || null,
      phone: form.phone || null,
      email: form.email || null,
      linkedin: form.linkedin || null,
      relationship: form.relationship || null,
      updated_at: new Date().toISOString(),
    };
    if (form.id) {
      const { data, error } = await supabase.from("friends_of_bcc").update(payload).eq("id", form.id).select().single();
      setSaving(false);
      if (error) { alert(`Failed to save: ${error.message}`); return; }
      if (data) setFriends(prev => prev.map(f => f.id === form.id ? data as Friend : f));
    } else {
      const { data, error } = await supabase.from("friends_of_bcc")
        .insert({ ...payload, created_by: userId }).select().single();
      setSaving(false);
      if (error) { alert(`Failed to save: ${error.message}`); return; }
      if (data) setFriends(prev => [...prev, data as Friend].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setShowForm(false);
    setForm({ ...EMPTY });
  }

  async function remove(f: Friend) {
    if (!confirm(`Remove ${f.name} from Friends of BCC?`)) return;
    await supabase.from("friends_of_bcc").delete().eq("id", f.id);
    setFriends(prev => prev.filter(x => x.id !== f.id));
  }

  function openEdit(f: Friend) {
    setForm({
      id: f.id, name: f.name, company: f.company || "", city: f.city || "",
      phone: f.phone || "", email: f.email || "", linkedin: f.linkedin || "",
      relationship: f.relationship || "",
    });
    setShowForm(true);
  }

  const cities = Array.from(new Set(friends.map(f => (f.city || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const filtered = friends.filter(f => {
    if (cityFilter && (f.city || "").trim().toLowerCase() !== cityFilter.toLowerCase()) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [f.name, f.company, f.city, f.phone, f.email, f.relationship].some(v => (v || "").toLowerCase().includes(q));
  });

  const linkedinHref = (v: string) => v.startsWith("http") ? v : `https://www.linkedin.com/in/${v.replace(/^@/, "")}`;

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center shadow-sm">
              <HeartHandshake className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Friends of BCC</h1>
              <p className="text-sm text-slate-400">Our network to leverage · {friends.length} people</p>
            </div>
          </div>
          <button onClick={() => { setForm({ ...EMPTY }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium hover:bg-rose-600 shadow-sm">
            <Plus className="w-4 h-4" /> Add Friend
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, company, purpose…"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 w-56" />
          </div>
          {cities.length > 0 && (
            <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
              <option value="">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-rose-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <HeartHandshake className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No friends added yet</p>
            <p className="text-xs mt-1">Build your network list — people who can open doors for BCC.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">City</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">LinkedIn</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Relationship / Deal</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50/50 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-xs shrink-0">
                            {f.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-900">{f.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {f.company ? <span className="flex items-center gap-1.5"><Building2 className="w-3 h-3 text-slate-400" />{f.company}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {f.city ? <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-slate-400" />{f.city}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="space-y-0.5">
                          {f.phone && <a href={`tel:${f.phone}`} className="flex items-center gap-1.5 text-xs hover:text-rose-600"><PhoneCall className="w-3 h-3 text-slate-400" />{f.phone}</a>}
                          {f.email && <a href={`mailto:${f.email}`} className="flex items-center gap-1.5 text-xs hover:text-rose-600"><Mail className="w-3 h-3 text-slate-400" />{f.email}</a>}
                          {!f.phone && !f.email && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {f.linkedin ? (
                          <a href={linkedinHref(f.linkedin)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
                            <LinkedinIcon className="w-3.5 h-3.5" /> Profile
                          </a>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[240px]">
                        {f.relationship || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(f)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(f)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{form.id ? "Edit Friend" : "Add Friend of BCC"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Name *"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  placeholder="Company"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="City"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone number" type="tel"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Email ID" type="email"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <input value={form.linkedin} onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))}
                placeholder="LinkedIn URL or username"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              <textarea value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
                placeholder="Relationship / Deal — how do we know them, what's the purpose or opportunity?"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none" />
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 text-sm bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add Friend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
