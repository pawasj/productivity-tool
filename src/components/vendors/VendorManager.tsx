"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Building2, Plus, X, Search, MapPin, Phone, Mail, Globe, Tag, FileText, GraduationCap, Filter } from "lucide-react";
import type { Profile } from "@/lib/types";

interface Vendor {
  id: string;
  name: string;
  type: "vendor" | "intern";
  specializations: string[];
  description: string | null;
  agreement_notes: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  is_active: boolean;
  created_at: string;
}

const VENDOR_SPECS = [
  "Social Media Management", "Production & Video Shoots", "Editing", "Design",
  "UI / UX", "Tech Development", "Photography", "Copywriting & Content",
  "PR & Communications", "Event Management", "Influencer Outreach",
  "SEO / SEM", "Performance Marketing", "Strategy & Consulting", "Distribution", "Other",
];

const INTERN_SPECS = [
  "Social Media", "Content Writing", "Graphic Design", "Video Editing",
  "Research & Analytics", "Client Servicing", "Business Development",
  "Tech / Development", "Marketing", "Operations", "HR",
  "Distribution", "Influencer Marketing", "Other",
];

const INDIAN_STATES_SHORT = [
  "Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata",
  "Ahmedabad", "Jaipur", "Lucknow", "Maharashtra", "Karnataka", "Tamil Nadu",
  "Uttar Pradesh", "Rajasthan", "Gujarat", "West Bengal", "Telangana",
  "Kerala", "Punjab", "Haryana", "Madhya Pradesh", "Other",
];

const EMPTY_FORM = {
  name: "", type: "vendor" as "vendor" | "intern", specializations: [] as string[],
  description: "", agreement_notes: "", location: "", city: "", state: "",
  contact_name: "", contact_email: "", contact_phone: "", website: "", is_active: true,
};

interface Props { currentUser: Profile; }

export default function VendorManager({ currentUser }: Props) {
  const [activeTab, setActiveTab] = useState<"vendor" | "intern">("vendor");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [specFilter, setSpecFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => { loadVendors(); }, [activeTab]);

  async function loadVendors() {
    setLoading(true);
    const { data } = await supabase.from("vendors").select("*").eq("type", activeTab).order("name");
    setVendors((data || []) as Vendor[]);
    setLoading(false);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const record = { ...form, type: activeTab, created_by: currentUser.id };
    if (editId) {
      const { data } = await supabase.from("vendors").update(record).eq("id", editId).select().single();
      if (data) setVendors(prev => prev.map(v => v.id === editId ? data as Vendor : v));
    } else {
      const { data } = await supabase.from("vendors").insert(record).select().single();
      if (data) setVendors(prev => [data as Vendor, ...prev]);
    }
    setSaving(false);
    closeForm();
  }

  async function deleteVendor(id: string) {
    await supabase.from("vendors").delete().eq("id", id);
    setVendors(prev => prev.filter(v => v.id !== id));
    if (expanded === id) setExpanded(null);
  }

  function openEdit(v: Vendor) {
    setForm({ ...v, description: v.description || "", agreement_notes: v.agreement_notes || "", location: v.location || "", city: v.city || "", state: v.state || "", contact_name: v.contact_name || "", contact_email: v.contact_email || "", contact_phone: v.contact_phone || "", website: v.website || "" });
    setEditId(v.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...EMPTY_FORM, type: activeTab });
    setEditId(null);
  }

  function toggleSpec(s: string) {
    setForm(f => ({
      ...f,
      specializations: f.specializations.includes(s) ? f.specializations.filter(x => x !== s) : [...f.specializations, s],
    }));
  }

  const specs = activeTab === "vendor" ? VENDOR_SPECS : INTERN_SPECS;

  const filtered = vendors.filter(v => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.contact_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (specFilter && !v.specializations.includes(specFilter)) return false;
    if (stateFilter && v.state !== stateFilter && v.city !== stateFilter) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm shadow-teal-200">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vendor Management</h1>
            <p className="text-sm text-slate-400">Manage vendors, agencies, and intern resources</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <button onClick={() => setActiveTab("vendor")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "vendor" ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            <Building2 className="w-4 h-4" /> Vendors & Agencies
          </button>
          <button onClick={() => setActiveTab("intern")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "intern" ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
            <GraduationCap className="w-4 h-4" /> Intern Army
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${activeTab === "vendor" ? "vendors" : "interns"}…`}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={specFilter} onChange={e => setSpecFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All specializations</option>
            {specs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All locations</option>
            {INDIAN_STATES_SHORT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => { setForm({ ...EMPTY_FORM, type: activeTab }); setEditId(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> Add {activeTab === "vendor" ? "Vendor" : "Intern"}
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">Total {activeTab === "vendor" ? "Vendors" : "Interns"}</p>
            <p className="text-2xl font-bold text-slate-900">{filtered.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">Active</p>
            <p className="text-2xl font-bold text-teal-600">{filtered.filter(v => v.is_active).length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">Locations</p>
            <p className="text-2xl font-bold text-slate-900">{new Set(filtered.map(v => v.city || v.state).filter(Boolean)).size}</p>
          </div>
        </div>

        {/* Vendor List */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading && <div className="text-center py-12 text-slate-400">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No {activeTab === "vendor" ? "vendors" : "interns"} yet. Add one above.</p>
            </div>
          )}
          {filtered.map(v => (
            <div key={v.id} className="border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setExpanded(x => x === v.id ? null : v.id)}>
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                  <span className="text-teal-700 font-bold text-sm">{v.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{v.name}</span>
                    {!v.is_active && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {v.specializations.slice(0, 3).map(s => (
                      <span key={s} className="text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full">{s}</span>
                    ))}
                    {v.specializations.length > 3 && <span className="text-xs text-slate-400">+{v.specializations.length - 3} more</span>}
                  </div>
                </div>
                {(v.city || v.state) && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <MapPin className="w-3 h-3" /> {v.city || v.state}
                  </span>
                )}
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(v)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors text-xs px-2">Edit</button>
                  <button onClick={() => deleteVendor(v.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {expanded === v.id && (
                <div className="px-5 pb-5 pt-1 bg-slate-50/50 grid grid-cols-2 gap-4 border-t border-slate-100">
                  {v.description && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-slate-500 uppercase mb-1">About</p>
                      <p className="text-sm text-slate-700">{v.description}</p>
                    </div>
                  )}
                  {v.agreement_notes && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-slate-500 uppercase mb-1">Agreement Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{v.agreement_notes}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Contact</p>
                    {v.contact_name && <p className="text-sm text-slate-700">{v.contact_name}</p>}
                    {v.contact_phone && <p className="flex items-center gap-1 text-sm text-slate-600"><Phone className="w-3 h-3" /> {v.contact_phone}</p>}
                    {v.contact_email && <p className="flex items-center gap-1 text-sm text-slate-600"><Mail className="w-3 h-3" /> {v.contact_email}</p>}
                    {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-teal-600 hover:underline"><Globe className="w-3 h-3" /> {v.website}</a>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Specializations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {v.specializations.map(s => <span key={s} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full">{s}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-slate-900">{editId ? "Edit" : "Add"} {activeTab === "vendor" ? "Vendor" : "Intern"}</h3>
              <button onClick={closeForm}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">{activeTab === "vendor" ? "Company / Vendor" : "Name"} *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Name</label>
                  <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Point of contact"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+91 XXXXX XXXXX"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="email@example.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Website</label>
                  <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Mumbai"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
                  <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select state…</option>
                    {INDIAN_STATES_SHORT.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Specializations</label>
                <div className="flex flex-wrap gap-1.5">
                  {specs.map(s => (
                    <button key={s} type="button" onClick={() => toggleSpec(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border-2 transition-all ${form.specializations.includes(s) ? "border-teal-400 bg-teal-50 text-teal-800 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What do they do? Any notable work?" rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Agreement / Contract Notes</label>
                <textarea value={form.agreement_notes} onChange={e => setForm(f => ({ ...f, agreement_notes: e.target.value }))}
                  placeholder="Payment terms, NDA status, contract dates…" rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-teal-600 w-4 h-4" />
                <span className="text-sm text-slate-700">Active {activeTab === "vendor" ? "vendor" : "intern"}</span>
              </label>
            </div>
            <div className="flex gap-2 p-5 border-t border-slate-100">
              <button onClick={closeForm} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-2 text-sm bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Save Changes" : `Add ${activeTab === "vendor" ? "Vendor" : "Intern"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
