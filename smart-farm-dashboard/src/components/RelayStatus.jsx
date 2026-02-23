import React from 'react';
import { Power } from 'lucide-react';

export default function RelayStatus({ name, isActive }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100 opacity-60'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
        <span className={`font-medium ${isActive ? 'text-emerald-900' : 'text-slate-500'}`}>{name}</span>
      </div>
      <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
        <Power size={12} /> {isActive ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}