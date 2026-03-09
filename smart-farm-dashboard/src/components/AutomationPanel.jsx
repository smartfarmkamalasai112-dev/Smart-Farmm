import React, { useState, useEffect } from 'react';
import { Save, Settings, Info } from 'lucide-react';

const DEVICE_NAMES = [
  "ปั้มแปลง1 (ดิน 2 แปลง 1)",
  "พัดลม (Fan)",
  "ไฟส่องสว่าง (Lamp)",
  "พ่นหมอก (Mist)",
  "ปั้มแปลง2 (ดิน 2 แปลง 2)",
  "ปั้ม Evap (EvapPump)",
  "วาล์ว1 (ดิน 1 แปลง 1)",
  "วาล์ว2 (ดิน 3 แปลง 1)",
  "วาล์ว3 (ดิน 1 แปลง 2)",
  "วาล์ว1-P2 (ดิน 2 แปลง 2)",
  "วาล์ว2-P2 (ดิน 3 แปลง 2)",
  "วาล์ว3-P2 (V3-P2)"
];
const UNIT_LABELS = [
  "% (Moisture)",
  "°C (Temp)",
  "Lux (Light)",
  "% (Moisture)",
  "% (Moisture)",
  "% (Moisture)",
  "°C (Temp)",
  "Lux (Light)",
  "% (Moisture)",
  "°C (Temp)",
  "Lux (Light)",
  "% (Moisture)"
];

export default function AutomationPanel({ config, relayConfigs, onSaveConfig, currentValues, currentCO2, relayStatus }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        {config.map((rule, idx) => {
          console.log(`🔍 [Relay ${idx}] ConfigRow initializing with rule:`, rule, `condition type: ${typeof rule?.condition}`);
          return (
            <ConfigRow 
              key={idx}
              index={idx}
              initialConfig={rule || { target: 0, condition: '<' }}
              relayConfig={relayConfigs[idx] || {}}
              currentVal={currentValues[idx]}
              currentCO2={currentCO2}
              relayStatus={relayStatus ? relayStatus[idx] : false}
              onSave={onSaveConfig}
              label={DEVICE_NAMES[idx]}
              unit={UNIT_LABELS[idx]}
            />
          );
        })}
    </div>
  );
}

// --- Component ย่อย: ตัวแก้ปัญหา Data Race ---
function ConfigRow({ index, initialConfig, relayConfig, currentVal, currentCO2, relayStatus, onSave, label, unit }) {
  // 1. สร้างตัวแปรเก็บค่าชั่วคราว (Local State)
  const [target, setTarget] = useState(initialConfig.target);
  const [condition, setCondition] = useState(initialConfig.condition);
  const [co2Target, setCo2Target] = useState(initialConfig.co2_target || 600);
  const [co2Condition, setCo2Condition] = useState(initialConfig.co2_condition || '>');
  const [isEditing, setIsEditing] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(0);
  const [syncLocked, setSyncLocked] = useState(false);  // ⭐ Lock sync for 3.5 seconds after save

  // ⭐ Auto-unlock sync after 3.5 seconds (longer than fetch interval)
  useEffect(() => {
    if (!syncLocked) return;
    const timer = setTimeout(() => {
      setSyncLocked(false);
      setIsEditing(false);  // Also clear editing flag
    }, 3500);
    return () => clearTimeout(timer);
  }, [syncLocked]);

  // ⭐ ONLY sync initialConfig → local state when NOT editing AND NOT locked
  // ⚠️ CRITICAL: Remove local state values from dependencies to prevent infinite loop!
  useEffect(() => {
    // Don't sync if we're editing or just saved
    if (isEditing || syncLocked) {
      console.log(`⏸️ [Relay ${index}] Sync blocked: isEditing=${isEditing}, syncLocked=${syncLocked}`);
      return;
    }

    // Update local state from server ONLY when allowed
    if (initialConfig.target !== target || initialConfig.condition !== condition) {
      console.log(`✅ [Relay ${index}] Syncing from server: target ${target} → ${initialConfig.target}`);
    }
    setTarget(initialConfig.target);
    setCondition(initialConfig.condition);
    setCo2Target(initialConfig.co2_target || 600);
    setCo2Condition(initialConfig.co2_condition || '>');
  }, [initialConfig, isEditing, syncLocked, index, target, condition]);

  // ค่าเซนเซอร์ปัจจุบันจาก API
  const currentSensorValue = relayConfig.current_value || currentVal;
  const currentSensorValue1 = relayConfig.current_value1 || currentVal;
  const currentSensorValue2 = relayConfig.current_value2 || currentCO2;

  const handleSave = () => {
    // Lock immediately to prevent any updates during save
    setSyncLocked(true);
    setIsEditing(false);
    
    const saveData = { 
      target: parseFloat(target), 
      condition,
      param: relayConfig.sensor_name || initialConfig.param || 'soil_hum'
    };
    
    // เพิ่ม CO2 config สำหรับ Fan relay (index 1)
    if (index === 1) {
      saveData.target1 = parseFloat(target);
      saveData.condition1 = condition;
      saveData.param1 = relayConfig.sensor1_name || initialConfig.param1 || 'temp';
      saveData.target2 = parseFloat(co2Target);
      saveData.condition2 = co2Condition;
      saveData.param2 = relayConfig.sensor2_name || initialConfig.param2 || 'hum';
    }
    
    console.log(`🔒 Saving config for relay ${index}:`, saveData);
    onSave(index, saveData);
    setLastSaveTime(Date.now());
  };

  return (
    <div className="p-4 rounded-lg border border-slate-100 bg-white hover:border-blue-100 transition-colors shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 text-base">{index + 1}. {label}</span>
          <span className={`text-sm px-2 py-1 rounded font-semibold ${relayStatus ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {relayStatus ? '🟢 ON' : '⚪ OFF'}
          </span>
        </div>
        <div className="text-sm px-2 py-1.5 bg-slate-100 rounded text-slate-600 font-mono flex flex-col gap-1.5">
          <span>ปัจจุบัน: <strong>{currentSensorValue}</strong> {unit.split(' ')[0]}</span>
          {index === 1 && <span>CO2: <strong>{currentSensorValue2}</strong> ppm</span>}
        </div>
      </div>

      {/* Primary condition */}
      <div className="flex gap-2 items-center mt-3 mb-2.5">
        {/* Dropdown เงื่อนไข */}
        <select
          value={condition}
          onChange={(e) => {
            setCondition(e.target.value);
            setIsEditing(true);
          }}
          className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none w-20"
        >
          <option value="<">&lt; น้อยกว่า</option>
          <option value=">">&gt; มากกว่า</option>
        </select>

        {/* ช่องกรอกตัวเลข */}
        <div className="relative flex-1">
          <input
            type="number"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setIsEditing(true);
            }}
            onFocus={() => setIsEditing(true)}
            className="bg-slate-50 border border-slate-200 text-slate-900 text-base rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-2 outline-none font-bold"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-sm text-slate-400">
             {unit.split(' ')[0]}
          </div>
        </div>
      </div>

      {/* CO2 condition for Fan (index 1) */}
      {index === 1 && (
        <div className="flex gap-2 items-center mb-2.5">
          <select
            value={co2Condition}
            onChange={(e) => {
              setCo2Condition(e.target.value);
              setIsEditing(true);
            }}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none w-20"
          >
            <option value="<">&lt; น้อยกว่า</option>
            <option value=">">&gt; มากกว่า</option>
          </select>

          <div className="relative flex-1">
            <input
              type="number"
              value={co2Target}
              onChange={(e) => {
                setCo2Target(e.target.value);
                setIsEditing(true);
              }}
              onFocus={() => setIsEditing(true)}
              className="bg-slate-50 border border-slate-200 text-slate-900 text-base rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-2 outline-none font-bold"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-sm text-slate-400">
              ppm
            </div>
          </div>
        </div>
      )}

      {/* ปุ่มบันทึก */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm p-2 text-center inline-flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md shadow-blue-200"
        >
          <Save size={16} />
          บันทึก
        </button>
      </div>
    </div>
  );
}
