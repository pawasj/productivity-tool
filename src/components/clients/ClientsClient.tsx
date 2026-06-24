"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Users2, Plus, X, Search, Pencil, Trash2, Building2, Phone, Mail, MapPin, CreditCard, FileText, Loader2, RefreshCw } from "lucide-react";
import type { Client, Vertical } from "@/lib/types";

const EMPTY_CLIENT: Omit<Client, "id" | "created_at" | "updated_at"> = {
  name: "", office_address: "", gst_number: "", contact_name: "",
  contact_phone: "", contact_email: "", engagement_type: "one_time",
  amount: 0, monthly_value: 0, deliverables: "", vertical_id: "",
  status: "active", notes: "",
};

const EXPENSE_CATEGORIES = ["Salaries", "Tools & Software", "Office Rent", "Marketing", "Travel", "Freelancers", "Content Production", "Miscellaneous"];

interface Props { verticals: Vertical[]; userId: string; }

export default function ClientsClient({ verticals, userId }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVertical, setFilterVertical] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...EMPTY_CLIENT });
  const [saving, setSaving] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("*, vertical:verticals(id,name,color)")
      .order("updated_at", { ascending: false });
    setClients((data || []) as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function sf(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })); }

  function openNew() { setForm({ ...EMPTY_CLIENT }); setEditing(null); setShowForm(true); }
  function openEdit(c: Client) {
    setForm({
      name: c.name, office_address: c.office_address || "",
      gst_number: c.gst_number || "", contact_name: c.contact_name || "",
      contact_phone: c.contact_phone || "", contact_email: c.contact_email || "",
      engagement_type: c.engagement_type || "one_time",
      amount: c.amount || 0, monthly_value: c.monthly_value || 0,
      deliverables: c.deliverables || "", vertical_id: c.vertical_id || "",
      status: c.status || "active", notes: c.notes || "",
    });
    setEditing(c); setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      amount: Number(form.amount) || 0,
      monthly_value: Number(form.monthly_value) || 0,
      vertical_id: form.vertical_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from("clients").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("clients").insert({ ...payload, created_at: new Date().toISOString() });
    }
    setSaving(false); setShowForm(false); setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this client?")) return;
    await supabase.from("clients").delete().eq("id", id);
    setClients(c => c.filter(x => x.id !== id));
    if (selectedClient?.id === id) setSelectedClient(null);
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || (c.contact_name || "").toLowerCase().includes(q);
    const matchV = !filterVertical || c.vertical_id === filterVertical;
    return matchQ && matchV;
  });

  const totalRevenue = clients.filter(c => c.engagement_type === "one_time").reduce((s, c) => s + (c.amount || 0), 0);
  const totalMRR = clients.filter(c => c.engagement_type === "retainer").reduce((s, c) => s + (c.monthly_value || 0), 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-200">
              <Users2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Client Details</h1>
              <p className="text-sm text-slate-400">Manage client records, auto-synced from Sales Pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
              <Plus className="w-4 h-4" /> Add Client
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Clients", value: clients.length, color: "text-violet-600" },
            { label: "Active", value: clients.filter(c => c.status === "active").length, color: "text-emerald-600" },
            { label: "One-time Revenue", value: `₹${totalRevenue.toLocaleString("en-IN")}`, color: "text-blue-600" },
            { label: "Monthly Retainer", value: `₹${totalMRR.toLocaleString("en-IN")}/mo`, color: "text-amber-600" },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-lg font-bold ${s.color} mt-0.5`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Client List */}
        <div className="flex flex-col w-80 border-r border-slate-200 bg-white overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">All Verticals</option>
              {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <Users2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                {clients.length === 0 ? "No clients yet. Clients auto-appear when a lead is Approved in the pipeline." : "No matches"}
              </div>
            ) : filtered.map(c => (
              <button key={c.id} onClick={() => setSelectedClient(c)}
                className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedClient?.id === c.id ? "bg-violet-50 border-l-2 border-l-violet-500" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{c.contact_name || "—"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {c.vertical && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: `${c.vertical.color}20`, color: c.vertical.color }}>
                          {c.vertical.name}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.engagement_type === "retainer" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                        {c.engagement_type === "retainer" ? "Retainer" : "One-time"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-slate-700">
                      {c.engagement_type === "retainer" ? `₹${(c.monthly_value || 0).toLocaleString("en-IN")}/mo` : `₹${(c.amount || 0).toLocaleString("en-IN")}`}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedClient ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Users2 className="w-14 h-14 mb-3 opacity-20" />
              <p className="text-sm">Select a client to view details</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedClient.name}</h2>
                  {selectedClient.vertical && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium mt-1 inline-block"
                      style={{ background: `${selectedClient.vertical.color}20`, color: selectedClient.vertical.color }}>
                      {selectedClient.vertical.name}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(selectedClient)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => remove(selectedClient.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Building2, label: "Office Address", value: selectedClient.office_address },
                  { icon: CreditCard, label: "GST Number", value: selectedClient.gst_number },
                  { icon: Users2, label: "Contact Person", value: selectedClient.contact_name },
                  { icon: Phone, label: "Phone", value: selectedClient.contact_phone },
                  { icon: Mail, label: "Email", value: selectedClient.contact_email },
                  { icon: MapPin, label: "Status", value: selectedClient.status },
                ].map(({ icon: Icon, label, value }) => value ? (
                  <div key={label} className="bg-white rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                    </div>
                    <p className="text-sm text-slate-800 font-medium">{value}</p>
                  </div>
                ) : null)}
              </div>

              <div className="bg-white rounded-xl border border-slate-100 p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Engagement Details</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Type</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{selectedClient.engagement_type === "retainer" ? "Monthly Retainer" : "One-time"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{selectedClient.engagement_type === "retainer" ? "Monthly Value" : "Deal Value"}</p>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      ₹{((selectedClient.engagement_type === "retainer" ? selectedClient.monthly_value : selectedClient.amount) ?? 0).toLocaleString("en-IN")}
                      {selectedClient.engagement_type === "retainer" && "/mo"}
                    </p>
                  </div>
                  {selectedClient.deliverables && (
                    <div>
                      <p className="text-xs text-slate-400">Deliverables</p>
                      <p className="text-sm text-slate-700 mt-0.5">{selectedClient.deliverables}</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedClient.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1"><FileText className="w-3.5 h-3.5 text-amber-600" /><p className="text-xs font-medium text-amber-700">Notes</p></div>
                  <p className="text-sm text-slate-700">{selectedClient.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-900">{editing ? "Edit Client" : "Add Client"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {[
                { label: "Client / Brand Name *", key: "name", placeholder: "e.g. Samsung India", col: 2 },
                { label: "Office Address", key: "office_address", placeholder: "Full address", col: 2 },
                { label: "GST Number", key: "gst_number", placeholder: "22AAAAA0000A1Z5" },
                { label: "Contact Person", key: "contact_name", placeholder: "Name" },
                { label: "Phone", key: "contact_phone", placeholder: "+91 98765 43210" },
                { label: "Email", key: "contact_email", placeholder: "contact@brand.com" },
                { label: "Deliverables", key: "deliverables", placeholder: "e.g. 4 Reels/month", col: 2 },
                { label: "Notes", key: "notes", placeholder: "Any additional notes…", col: 2 },
              ].map(({ label, key, placeholder, col }) => (
                <div key={key} className={col === 2 ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                  <input value={String((form as Record<string, unknown>)[key] || "")}
                    onChange={e => sf(key, e.target.value)} placeholder={placeholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Vertical</label>
                <select value={form.vertical_id || ""} onChange={e => sf("vertical_id", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="">Select vertical</option>
                  {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Engagement Type</label>
                <select value={form.engagement_type} onChange={e => sf("engagement_type", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="one_time">One-time</option>
                  <option value="retainer">Monthly Retainer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {form.engagement_type === "retainer" ? "Monthly Value (₹)" : "Deal Value (₹)"}
                </label>
                <input type="number" value={form.engagement_type === "retainer" ? (form.monthly_value || "") : (form.amount || "")}
                  onChange={e => sf(form.engagement_type === "retainer" ? "monthly_value" : "amount", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select value={form.status || "active"} onChange={e => sf("status", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                  {["active", "paused", "churned", "prospect"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 text-sm bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
