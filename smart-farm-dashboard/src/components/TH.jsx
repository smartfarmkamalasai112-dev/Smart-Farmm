import React from 'react';

export default function TH({ th }) {
  return (
    <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col justify-center">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">
        T-H Sensor
      </div>
      
      <div className="flex justify-around items-center">
        <div className="text-center">
            <span className="block text-2xl font-black text-slate-800">{th?.t || 0}°C</span>
            <span className="text-[10px] text-gray-400">Temp</span>
        </div>
        
        <div className="h-8 w-px bg-gray-200 mx-2"></div>
        
        <div className="text-center">
            <span className="block text-2xl font-black text-slate-800">{th?.h || 0}%</span>
            <span className="text-[10px] text-gray-400">Humid</span>
        </div>
      </div>
    </div>
  );
}