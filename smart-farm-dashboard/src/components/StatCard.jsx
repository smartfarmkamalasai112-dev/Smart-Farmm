import React from 'react';

export default function StatCard({ icon: Icon, title, value, unit, color }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    teal:  'bg-teal-100 text-teal-600'
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[color] || 'bg-gray-100'}`}>
          <Icon size={24} strokeWidth={2.5} />
        </div>
        <span className="text-slate-400 text-xs font-semibold uppercase">{title}</span>
      </div>
      <div className="flex items-baseline">
        <span className="text-3xl font-bold text-slate-800">{value || '-'}</span>
        <span className="ml-1 text-sm text-slate-500 font-medium">{unit}</span>
      </div>
    </div>
  );
}