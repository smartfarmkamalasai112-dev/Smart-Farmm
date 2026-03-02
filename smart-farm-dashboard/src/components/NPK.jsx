import React from 'react';

export default function NPK({ npk }) {
  const n = npk?.n || 0;
  const p = npk?.p || 0;
  const k = npk?.k || 0;

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col justify-center">
      <div className="text-base font-bold text-gray-400 uppercase tracking-widest mb-4 text-center">
        Nutrients (NPK)
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-center items-end">
        <div>
          <div className="text-4xl text-blue-500 font-bold">N</div>
          <div className="text-5xl font-black text-slate-700">{n}</div>
        </div>
        <div className="border-l border-r border-gray-100 h-12"></div>
        <div>
          <div className="text-4xl text-orange-500 font-bold">P</div>
          <div className="text-5xl font-black text-slate-700">{p}</div>
        </div>
        <div></div>
        <div>
          <div className="text-4xl text-purple-500 font-bold">K</div>
          <div className="text-5xl font-black text-slate-700">{k}</div>
        </div>
      </div>
    </div>
  );
}