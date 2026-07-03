"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Settings2, X, Check, Palette, LayoutDashboard } from "lucide-react";
import CollatedOverview from "@/components/modules/CollatedOverview";
import type { Vertical, Profile } from "@/lib/types";
import { VERTICAL_COLORS } from "@/lib/utils";

interface Props {
  verticals: Vertical[];
  profile: Profile;
  members: Profile[];
  userId: string;
}

const ICONS = ["📺", "📻", "🎬", "🎙️", "📱", "💻", "🌐", "📢", "🎯", "🏢", "📊", "💼", "💡", "🎨", "🚀"];
const OVERVIEW_ID = "__overview__";

export default function DashboardClient({ verticals: initialVerticals, profile, members, userId }: Props) {
  const [verticals, setVerticals] = useState<Vertical[]>(initialVerticals);
  const [activeVertical, setActiveVertical] = useState<string>(OVERVIEW_ID);
  const [showAddVertical, setShowAddVertical] = useState(false);
  const [editingVertical, setEditingVertical] = useState<Vertical | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(VERTICAL_COLORS[0]);
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [saving, setSaving] = useState(false);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const current = verticals.find((v) => v.id === activeVertical);

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  async function addVertical() {
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("verticals")
      .insert({ name: newName.trim(), color: newColor, icon: newIcon, order_index: verticals.length })
      .select()
      .single();
    if (!error && data) {
      setVerticals([...verticals, data]);
      setActiveVertical(data.id);
    }
    setSaving(false);
    setShowAddVertical(false);
    setNewName("");
  }

  async function saveVerticalEdit() {
    if (!editingVertical || !newName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("verticals")
      .update({ name: newName.trim(), color: newColor, icon: newIcon })
      .eq("id", editingVertical.id)
      .select()
      .single();
    if (!error && data) {
      setVerticals(verticals.map((v) => (v.id === data.id ? data : v)));
    }
    setSaving(false);
    setEditingVertical(null);
  }

  async function saveInlineRename() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    const { data } = await supabase
      .from("verticals")
      .update({ name: renameValue.trim() })
      .eq("id", renamingId)
      .select()
      .single();
    if (data) setVerticals(verticals.map((v) => (v.id === data.id ? data : v)));
    setRenamingId(null);
  }

  async function deleteVertical(id: string) {
    if (!confirm("Delete this vertical? All associated data will also be deleted.")) return;
    await supabase.from("verticals").delete().eq("id", id);
    const updated = verticals.filter((v) => v.id !== id);
    setVerticals(updated);
    setActiveVertical(updated[0]?.id || OVERVIEW_ID);
    setEditingVertical(null);
  }

  function openEdit(v: Vertical) {
    setEditingVertical(v);
    setNewName(v.name);
    setNewColor(v.color);
    setNewIcon(v.icon);
  }

  function startRename(v: Vertical, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(v.id);
    setRenameValue(v.name);
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Vertical Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-1 overflow-x-auto">
        <div className="flex items-center gap-1 py-2 flex-1 min-w-0">
          {/* Overview tab */}
          <button
            onClick={() => setActiveVertical(OVERVIEW_ID)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeVertical === OVERVIEW_ID
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          {verticals.map((v) => (
            <div key={v.id} className="relative flex items-center">
              {renamingId === v.id ? (
                <input
                  ref={renameRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={saveInlineRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveInlineRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border-2 border-indigo-400 outline-none w-32"
                  style={{ backgroundColor: `${v.color}15` }}
                />
              ) : (
                <button
                  onClick={() => setActiveVertical(v.id)}
                  onDoubleClick={(e) => profile.role === "admin" && startRename(v, e)}
                  title={profile.role === "admin" ? "Double-click to rename" : v.name}
                  className={`group flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeVertical === v.id
                      ? "text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  style={activeVertical === v.id ? { backgroundColor: v.color } : {}}
                >
                  <span>{v.icon}</span>
                  <span>{v.name}</span>
                  {profile.role === "admin" && activeVertical === v.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                      className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                      title="Edit icon & color"
                    >
                      <Settings2 className="w-3 h-3" />
                    </button>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        {profile.role === "admin" && (
          <button
            onClick={() => { setNewName(""); setNewColor(VERTICAL_COLORS[0]); setNewIcon(ICONS[0]); setShowAddVertical(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0 ml-1"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-7xl mx-auto">
          {activeVertical === OVERVIEW_ID ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Overview</h1>
                  <p className="text-sm text-slate-400">All verticals at a glance</p>
                </div>
              </div>
              <CollatedOverview verticals={verticals} userId={userId} />
            </>
          ) : current ? (
            <>
              {/* Vertical Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ backgroundColor: `${current.color}20` }}>
                  {current.icon}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{current.name}</h1>
                  <p className="text-sm text-slate-400">Everything in this vertical, auto-collated — add items in their own panels</p>
                </div>
              </div>
              <CollatedOverview verticals={verticals} userId={userId} focusVerticalId={current.id} />
            </>
          ) : null}
        </div>
      </div>

      {/* Modals */}
      {showAddVertical && (
        <AddVerticalModal
          name={newName} setName={setNewName}
          color={newColor} setColor={setNewColor}
          icon={newIcon} setIcon={setNewIcon}
          onSave={addVertical} onClose={() => setShowAddVertical(false)}
          saving={saving}
        />
      )}
      {editingVertical && (
        <AddVerticalModal
          title={`Edit: ${editingVertical.name}`}
          name={newName} setName={setNewName}
          color={newColor} setColor={setNewColor}
          icon={newIcon} setIcon={setNewIcon}
          onSave={saveVerticalEdit}
          onClose={() => setEditingVertical(null)}
          saving={saving}
          onDelete={profile.role === "admin" ? () => deleteVertical(editingVertical.id) : undefined}
        />
      )}
    </div>
  );
}

function AddVerticalModal({
  title = "Add New Vertical",
  name, setName, color, setColor, icon, setIcon,
  onSave, onClose, saving, onDelete,
}: {
  title?: string;
  name: string; setName: (v: string) => void;
  color: string; setColor: (v: string) => void;
  icon: string; setIcon: (v: string) => void;
  onSave: () => void; onClose: () => void;
  saving: boolean; onDelete?: () => void;
}) {
  const ICONS = ["📺", "📻", "🎬", "🎙️", "📱", "💻", "🌐", "📢", "🎯", "🏢", "📊", "💼", "💡", "🎨", "🚀"];

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Vertical Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Social Media, Distribution"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                    icon === ic ? "bg-indigo-100 ring-2 ring-indigo-400" : "hover:bg-slate-100"
                  }`}
                >{ic}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" /> Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {VERTICAL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-all"
                  style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : "none", outlineOffset: 2 }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 p-5 border-t border-slate-100">
          {onDelete ? (
            <button onClick={onDelete} className="text-sm text-rose-500 hover:text-rose-700 transition-colors">
              Delete vertical
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : <><Check className="w-3.5 h-3.5" /> Save</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
