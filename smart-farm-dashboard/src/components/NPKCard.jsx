import React from 'react';

export default function NPK({ npk }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-md border border-gray-100">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Nutrients (NPK)</div>
      <div className="flex gap-4 justify-between">
        <div className="text-center w-1/3">
          <div className="text-xs text-blue-500 font-bold mb-1">N</div>
          <div className="text-lg font-semibold text-gray-700">{npk.n}</div>
        </div>
        <div className="text-center w-1/3 border-l border-r border-gray-100">
          <div className="text-xs text-orange-500 font-bold mb-1">P</div>
          <div className="text-lg font-semibold text-gray-700">{npk.p}</div>
        </div>
        <div className="text-center w-1/3">
          <div className="text-xs text-purple-500 font-bold mb-1">K</div>
          <div className="text-lg font-semibold text-gray-700">{npk.k}</div>
        </div>
      </div>
    </div>
  );
}