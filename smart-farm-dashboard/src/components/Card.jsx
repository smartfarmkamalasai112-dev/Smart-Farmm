import React from 'react';

export default function Card({ title, value }) {
  return (
    <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center h-full">
      <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
        {title}
      </div>
      
      <div className="text-4xl lg:text-5xl font-extrabold text-slate-800 tracking-tight text-center">
        {value}
      </div>
    </div>
  );
}