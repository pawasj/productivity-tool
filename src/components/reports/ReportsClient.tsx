"use client";

import { useState } from "react";
import { FileBarChart2, TrendingUp, Receipt, BarChart3 } from "lucide-react";
import type { Vertical } from "@/lib/types";
import SalesReport from "./SalesReport";
import ExpenseReport from "./ExpenseReport";
import PnLReport from "./PnLReport";

const TABS = [
  { id: "sales", label: "Sales Report", icon: TrendingUp },
  { id: "expense", label: "Expense Report", icon: Receipt },
  { id: "pnl", label: "P&L Report", icon: BarChart3 },
];

interface Props { verticals: Vertical[]; userId: string; }

export default function ReportsClient({ verticals, userId }: Props) {
  const [activeTab, setActiveTab] = useState("sales");

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-sm shadow-emerald-200">
            <FileBarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-400">Sales, Expenses & P&L reporting</p>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === id ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "sales" && <SalesReport verticals={verticals} />}
        {activeTab === "expense" && <ExpenseReport verticals={verticals} userId={userId} />}
        {activeTab === "pnl" && <PnLReport verticals={verticals} />}
      </div>
    </div>
  );
}
