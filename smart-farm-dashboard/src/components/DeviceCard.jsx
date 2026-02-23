import React from 'react';
import { Power } from 'lucide-react';

const DEVICE_NAMES = ["ปั้มแปลง1", "พัดลม", "ไฟส่องสว่าง", "พ่นหมอก"];
const DEVICE_ICONS = ["💧", "🌀", "💡", "🌫️"];

export default function DeviceCard({ 
  index, 
  displayData, 
  currentValue, 
  isOn, 
  onToggleRelay
}) {

  const handleToggleRelay = () => {
    onToggleRelay(index);
  };

  const displayValue = typeof currentValue === 'object' ? currentValue.temp : currentValue;
  const displayValue2 = typeof currentValue === 'object' ? currentValue.co2 : null;

  const getUnit = () => {
    if (index === 1) return '°C';
    if (index === 2) return ' Lux';
    return '%';
  };

  return (
    <div className="p-4 rounded-2xl shadow-sm border border-slate-100 bg-white hover:border-blue-100 transition-colors h-full flex flex-col">
      {/* Header: Icon + Name (Simple) */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{DEVICE_ICONS[index]}</span>
        <h3 className="font-bold text-slate-800">{DEVICE_NAMES[index]}</h3>
      </div>

      {/* Current Value */}
      <div className="mb-4 flex-1">
        <div className="text-xs text-slate-600">Current:</div>
        <div className="text-2xl font-bold text-slate-800">
          {displayValue.toFixed(1)}{getUnit()}
          {displayValue2 && <span className="text-xs ml-1">→ {displayValue2}ppm</span>}
        </div>
      </div>

      {/* Toggle Button Only */}
      <button
        onClick={handleToggleRelay}
        className={`w-full py-2 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
          isOn
            ? 'bg-green-500 hover:bg-green-600 text-white'
            : 'bg-red-500 hover:bg-red-600 text-white'
        }`}
      >
        <Power size={18} />
        {isOn ? 'ON' : 'OFF'}
      </button>

      {/* Footer: Current Relay State */}
      <div className="mt-3 pt-3 border-t border-slate-200 text-center text-xs text-slate-600">
        <div className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
          isOn
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {isOn ? '◆ ON' : '⏻ OFF'}
        </div>
      </div>
    </div>
  );
}