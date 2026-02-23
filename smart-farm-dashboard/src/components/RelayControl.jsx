import React, { useState } from 'react';
import { Power, Cpu, Hand } from 'lucide-react';

const DEVICES = [
  { name: 'ปั้มแปลง1 (Pump)', color: 'blue' },
  { name: 'พัดลม (Fan)', color: 'orange' },
  { name: 'ไฟส่องสว่าง (Lamp)', color: 'yellow' },
  { name: 'พ่นหมอก (Mist)', color: 'indigo' },
  { name: 'ปั้มแปลง2 (Plot Pump 2)', color: 'purple' },
  { name: 'ปั้ม Evap (EvapPump)', color: 'teal' },
  { name: 'วาล์ว1 (Valve 1-Plot1)', color: 'pink' },
  { name: 'วาล์ว2 (Valve 2-Plot1)', color: 'cyan' },
  { name: 'วาล์ว3 (Valve 3-Plot1)', color: 'lime' },
  { name: 'วาล์ว1 (Valve 1-Plot2)', color: 'rose' },
  { name: 'วาล์ว2 (Valve 2-Plot2)', color: 'amber' },
  { name: 'วาล์ว3 (Valve 3-Plot2)', color: 'sky' }
];

export default function RelayControl({ relays, mode, onToggleRelay, onToggleMode, config }) {
  const isAuto = mode === 'AUTO';
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [pendingRelayIndex, setPendingRelayIndex] = useState(null);
  const [tempConfig, setTempConfig] = useState({});

  // Handle clicking AUTO button - show config modal first
  const handleAutoClick = (index) => {
    setPendingRelayIndex(index);
    setTempConfig(config && config[index] ? {...config[index]} : {});
    setShowConfigModal(true);
  };

  // Handle saving config and activating AUTO
  const handleSaveAndActivateAuto = async () => {
    if (pendingRelayIndex !== null) {
      try {
        // First save the config to backend
        console.log(`🔍 [Relay ${pendingRelayIndex}] Sending config from RelayControl:`, tempConfig);
        
        const configResponse = await fetch('http://localhost:5000/api/relay-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            index: pendingRelayIndex,
            ...tempConfig
          })
        });
        
        if (!configResponse.ok) {
          throw new Error('Failed to save config');
        }
        
        console.log(`✅ Config saved for relay ${pendingRelayIndex}:`, tempConfig);
        
        // Then activate AUTO mode
        onToggleMode(pendingRelayIndex, 'AUTO');
        
        // Close modal
        setShowConfigModal(false);
        setPendingRelayIndex(null);
        setTempConfig({});
      } catch (error) {
        console.error('❌ Error saving config:', error);
        alert('Failed to save configuration. Please try again.');
      }
    }
  };

  // Handle canceling config modal
  const handleCancelConfig = () => {
    setShowConfigModal(false);
    setPendingRelayIndex(null);
    setTempConfig({});
  };

  return (
    <div className="space-y-6">
      {/* Card: โหมดการทำงาน */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-700">โหมดการทำงาน</h3>
          <p className="text-xs text-slate-400">เลือกโหมดควบคุมอุปกรณ์</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => handleAutoClick(0)}
            disabled={isAuto}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              isAuto ? 'bg-green-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cpu size={16} /> AUTO
          </button>
          <button
            onClick={() => onToggleMode(0, 'MANUAL')}
            disabled={!isAuto}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              !isAuto ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Hand size={16} /> MANUAL
          </button>
        </div>
      </div>

      {/* Grid: ปุ่ม Relay */}
      <div className="grid grid-cols-2 gap-4">
        {DEVICES.map((dev, idx) => {
          const isOn = relays[idx];
          const rule = config && config[idx];
          const conditionText = rule && (rule.condition === '<' ? 'น้อยกว่า' : 'มากกว่า');
          
          // สีปุ่มตามสถานะ
          const btnColor = isOn 
            ? (isAuto ? 'bg-green-500/80 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 cursor-pointer') 
            : (isAuto ? 'bg-slate-300 cursor-not-allowed' : 'bg-white hover:bg-slate-50 cursor-pointer border border-slate-200');
          
          const textColor = isOn ? 'text-white' : (isAuto ? 'text-slate-700' : 'text-slate-600');

          return (
            <div 
              key={idx}
              onClick={() => !isAuto && onToggleRelay(idx)}
              className={`${btnColor} p-3 rounded-xl shadow-sm transition-all duration-200 relative overflow-hidden group cursor-pointer`}
            >
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className={`p-2 rounded-full mb-1 ${isOn ? 'bg-white/20 text-white' : (isAuto ? 'bg-slate-400/40 text-slate-700' : 'bg-slate-100 text-slate-500')}`}>
                  <Power size={20} />
                </div>
                <h4 className={`font-semibold text-xs ${textColor}`}>{dev.name}</h4>
                <span className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded ${isOn ? 'bg-white/20 text-white' : (isAuto ? 'bg-slate-400/40 text-slate-700 font-semibold' : 'bg-slate-100 text-slate-400')}`}>
                  {isOn ? 'ON' : 'OFF'}
                </span>
                
                {/* Automation rule display */}
                {rule && (
                  <div className={`text-[9px] mt-1.5 px-1.5 py-0.5 rounded leading-tight ${isOn ? 'bg-white/10 text-white' : (isAuto ? 'bg-slate-400/40 text-slate-700 font-semibold' : 'bg-slate-100 text-slate-500')}`}>
                    ทำงานเมื่อ {rule.target} {conditionText}
                    {rule.co2_target && (
                      <div>หรือ CO2 {rule.co2_condition === '<' ? 'น้อยกว่า' : 'มากกว่า'} {rule.co2_target}</div>
                    )}
                  </div>
                )}

                {/* Mode Toggle Buttons */}
                <div className="flex gap-1.5 mt-3 w-full">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAutoClick(idx);
                    }}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      isAuto ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={!isAuto}
                  >
                    AUTO
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMode(idx, 'MANUAL');
                    }}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      isAuto ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={!isAuto}
                  >
                    MANUAL
                  </button>
                </div>
                
                {/* EXIT AUTO BUTTON - Shows in GLOBAL AUTO MODE */}
                {isAuto && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`คุณต้องการออกจากโหมด AUTO ใช่หรือไม่?`)) {
                        onToggleMode(idx, 'MANUAL');
                      }
                    }}
                    className="w-full mt-2 px-3 py-2 text-xs font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-md flex items-center justify-center gap-1"
                  >
                    <span>🚫</span> ออกจาก AUTO
                  </button>
                )}
              </div>
              
              {/* แถบแจ้งเตือนถ้าเป็น Auto */}
              {isAuto && (
                <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">Locked</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CONFIG MODAL - Shows when switching to AUTO */}
      {showConfigModal && pendingRelayIndex !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">⚙️ ตั้งค่า {DEVICES[pendingRelayIndex].name}</h2>
            
            <div className="space-y-4">
              {/* Example config form - can be expanded */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ค่าเป้าหมาย (Target)</label>
                <input 
                  type="number" 
                  defaultValue={tempConfig.target || 0}
                  onChange={(e) => setTempConfig({...tempConfig, target: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="กรอกค่าเป้าหมาย"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">เงื่อนไข (Condition)</label>
                <select 
                  defaultValue={tempConfig.condition || '<'}
                  onChange={(e) => setTempConfig({...tempConfig, condition: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="<">น้อยกว่า (&lt;)</option>
                  <option value=">">มากกว่า (&gt;)</option>
                </select>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-800">
                  ℹ️ <strong>ทำงานเมื่อ</strong> ค่าเซนเซอร์ {tempConfig.condition === '<' ? 'น้อยกว่า' : 'มากกว่า'} {tempConfig.target || '(ยังไม่ตั้งค่า)'}
                </p>
              </div>
            </div>

            {/* Button Group */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelConfig}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveAndActivateAuto}
                className="flex-1 px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                <Cpu size={16} /> บันทึก & เปิด AUTO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}