import React from 'react';

export default function Card({ title, value }) {
  return (
    <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center h-full">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
        {title}
      </div>
      
      {/* ลดขนาดตัวอักษรลงเพื่อให้พอดีกล่องเล็ก */}
      <div className="text-3xl lg:text-4xl font-extrabold text-slate-800 tracking-tight text-center">
        {value}
      </div>
    </div>
  );
}