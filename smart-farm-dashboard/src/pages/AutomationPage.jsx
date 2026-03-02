import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AutomationPanel from '../components/AutomationPanel';

const API_URL = `http://${window.location.hostname}:5000`;

const PARAM_LABELS = {
  soil_hum:  { label: 'ความชื้นดิน',   unit: '%',    icon: '🌱' },
  soil_2_hum:{ label: 'ความชื้นดิน2',  unit: '%',    icon: '🌱' },
  temp:      { label: 'อุณหภูมิ',       unit: '°C',   icon: '🌡️' },
  hum:       { label: 'ความชื้นอากาศ', unit: '%',    icon: '💧' },
  lux:       { label: 'แสง',           unit: 'lux',  icon: '☀️' },
  co2:       { label: 'CO₂',           unit: 'ppm',  icon: '🌫️' },
  s1_hum:    { label: 'ดิน S1',        unit: '%',    icon: '🌱' },
  s1_ph:     { label: 'pH S1',         unit: '',     icon: '🧪' },
  s2_hum:    { label: 'ดิน S2',        unit: '%',    icon: '🌱' },
  s3_hum:    { label: 'ดิน S3',        unit: '%',    icon: '🌱' },
  s4_hum:    { label: 'ดิน S4',        unit: '%',    icon: '🌱' },
};

function getParamInfo(param) {
  return PARAM_LABELS[param] || { label: param, unit: '', icon: '📡' };
}

export default function AutomationPage({ displayData, onSaveConfig, isSidebarOpen }) {
  const [relayConfigs, setRelayConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedRelayIndex, setSelectedRelayIndex] = useState(null);
  const [tempConfig, setTempConfig] = useState({});

  const RELAY_NAMES = ['ปั้มแปลง1 (Pump)', 'พัดลม (Fan)', 'ไฟส่องสว่าง (Lamp)', 'พ่นหมอก (Mist)', 'ปั้มแปลง2 (Plot Pump 2)', 'ปั้ม Evap (EvapPump)', 'วาล์ว1 (V1-P1)', 'วาล์ว2 (V2-P1)', 'วาล์ว3 (V3-P1)', 'วาล์ว1 (V1-P2)', 'วาล์ว2 (V2-P2)', 'วาล์ว3 (V3-P2)'];

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const response = await fetch(`${API_URL}/api/relay-configs`);
        const data = await response.json();
        setRelayConfigs(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching relay configs:', error);
        setLoading(false);
      }
    };

    fetchConfigs();
    const interval = setInterval(fetchConfigs, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleConfigClick = (index) => {
    const config = relayConfigs[index] || {};
    setSelectedRelayIndex(index);
    
    // Extract only the editable fields (ignore API metadata like current_value, sensor_name)
    let cleanConfig = {};
    
    if (config.target1) {
      // Dual sensor config (Fan / Valve1 P1 / Valve1 P2)
      cleanConfig = {
        param1: config.param1 || 'temp',
        condition1: config.condition1 || '>',
        target1: config.target1 || 0,
        param2: config.param2 || 'hum',
        condition2: config.condition2 || '>',
        target2: config.target2 || 0,
        logic: config.logic || 'OR'
      };
    } else {
      // Single sensor config
      cleanConfig = {
        param: config.param || 'soil_hum',
        condition: config.condition || '<',
        target: config.target || 0
      };
    }
    
    console.log(`📂 Opening config modal for relay ${index}:`, cleanConfig);
    setTempConfig(cleanConfig);
    setShowConfigModal(true);
  };

  const handleSaveConfigClick = async () => {
    if (selectedRelayIndex === null) return;
    
    try {
      console.log(`🔍 [Relay ${selectedRelayIndex}] Preparing config for save:`, tempConfig);
      
      // Build clean config to send (only editable fields, no API metadata)
      let configToSend = { index: selectedRelayIndex };
      
      if (selectedRelayIndex === 1 && tempConfig.target1) {
        // Dual sensor (Fan)
        configToSend = {
          ...configToSend,
          param1: tempConfig.param1,
          condition1: tempConfig.condition1,
          target1: tempConfig.target1,
          param2: tempConfig.param2,
          condition2: tempConfig.condition2,
          target2: tempConfig.target2,
          logic: tempConfig.logic || 'OR'
        };
      } else {
        // Single sensor
        configToSend = {
          ...configToSend,
          param: tempConfig.param,
          condition: tempConfig.condition,
          target: tempConfig.target
        };
      }
      
      console.log(`📤 Sending clean config to backend:`, configToSend);
      
      // STEP 1: Save config to backend
      const configResponse = await fetch(`${API_URL}/api/relay-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSend)
      });
      
      if (!configResponse.ok) {
        const errorText = await configResponse.text();
        throw new Error(`Failed to save config: ${errorText}`);
      }
      
      const configResult = await configResponse.json();
      console.log(`✅ Config saved for relay ${selectedRelayIndex}:`, configResult);
      
      // Update local state — merge tempConfig into existing entry to preserve current_value
      setRelayConfigs(prev => ({
        ...prev,
        [selectedRelayIndex]: { ...(prev[selectedRelayIndex] || {}), ...tempConfig }
      }));
      
      // STEP 2: Enable AUTO mode
      const modeResponse = await fetch(`${API_URL}/api/relay-modes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: selectedRelayIndex, mode: 'AUTO' })
      });
      
      if (!modeResponse.ok) {
        const errorText = await modeResponse.text();
        throw new Error(`Failed to enable AUTO mode: ${errorText}`);
      }
      
      const modeResult = await modeResponse.json();
      console.log(`✅ AUTO mode enabled for relay ${selectedRelayIndex}:`, modeResult);
      
      setShowConfigModal(false);
      alert('✅ บันทึกค่า AUTO mode เสร็จเรียบร้อย!');
    } catch (error) {
      console.error('❌ Error:', error);
      alert(`❌ ไม่สามารถบันทึกได้: ${error.message}`);
    }
  };

  // Mapping ค่าปัจจุบันเพื่อส่งไปโชว์เทียบกับค่าที่ตั้งไว้
  const currentSensorValues = [
    displayData.soil?.hum,
    displayData.air?.temp,
    displayData.env?.lux,
    displayData.soil?.hum,
    displayData.soil?.hum,
    displayData.soil?.hum,
    displayData.air?.temp,
    displayData.env?.lux,
    displayData.soil?.hum,
    displayData.air?.temp,
    displayData.env?.lux,
    displayData.soil?.hum
  ];

  const currentCO2 = displayData.co2 || 0;

  return (
    <div className="animate-fade-in pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">ตั้งค่า AUTO Mode สำหรับ Relay ทั้งหมด</h2>
      </div>

      {/* Simple Relay Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Object.keys(relayConfigs).map((relayIndex) => {
          const idx = parseInt(relayIndex);
          const cfg = relayConfigs[relayIndex];
          const relayStatus = displayData.relay?.[idx] || false;
          const isDual = !!cfg.target1;

          // current sensor value(s) from API response
          const cv1 = isDual ? cfg.current_value1 : cfg.current_value;
          const cv2 = isDual ? cfg.current_value2 : null;
          const p1  = isDual ? cfg.param1 : cfg.param;
          const p2  = isDual ? cfg.param2 : null;
          const info1 = getParamInfo(p1);
          const info2 = p2 ? getParamInfo(p2) : null;

          const condStr = isDual
            ? `${info1.icon}${cfg.target1}${cfg.condition1} / ${info2?.icon}${cfg.target2}${cfg.condition2}`
            : `${info1.icon} ${cfg.condition}${cfg.target} ${info1.unit}`;

          return (
            <button
              key={idx}
              onClick={() => handleConfigClick(idx)}
              className="p-4 rounded-lg border-2 border-slate-200 hover:border-blue-500 bg-white hover:bg-blue-50 transition-all text-left"
            >
              <div className="font-semibold text-sm">{RELAY_NAMES[idx]}</div>
              <div className={`text-xs mt-1 font-bold ${relayStatus ? 'text-green-600' : 'text-slate-400'}`}>
                {relayStatus ? '◆ ON' : '○ OFF'}
              </div>

              {/* Current sensor value */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{info1.icon} ค่าตอนนี้</span>
                  <span className="font-bold text-blue-700">{cv1 ?? '-'} {info1.unit}</span>
                </div>
                {info2 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{info2.icon} ค่าตอนนี้</span>
                    <span className="font-bold text-indigo-700">{cv2 ?? '-'} {info2.unit}</span>
                  </div>
                )}
              </div>

              {/* Target setting */}
              <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 truncate">
                🎯 {condStr}
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal */}
      {showConfigModal && selectedRelayIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">{RELAY_NAMES[selectedRelayIndex]}</h3>

            {/* ค่าเซนเซอร์ปัจจุบัน */}
            {(() => {
              const cfg = relayConfigs[selectedRelayIndex] || {};
              const isDual = !!cfg.target1;
              if (isDual) {
                const i1 = getParamInfo(cfg.param1);
                const i2 = getParamInfo(cfg.param2);
                return (
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <div className="text-lg">{i1.icon}</div>
                      <div className="text-xs text-slate-500">{i1.label}</div>
                      <div className="text-xl font-bold text-blue-700">{cfg.current_value1 ?? '-'}</div>
                      <div className="text-xs text-slate-400">{i1.unit}</div>
                    </div>
                    <div className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                      <div className="text-lg">{i2.icon}</div>
                      <div className="text-xs text-slate-500">{i2.label}</div>
                      <div className="text-xl font-bold text-indigo-700">{cfg.current_value2 ?? '-'}</div>
                      <div className="text-xs text-slate-400">{i2.unit}</div>
                    </div>
                  </div>
                );
              } else {
                const i1 = getParamInfo(cfg.param);
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-3">
                    <div className="text-3xl">{i1.icon}</div>
                    <div>
                      <div className="text-xs text-slate-500">{i1.label} ปัจจุบัน</div>
                      <div className="text-2xl font-bold text-blue-700">
                        {cfg.current_value ?? '-'} <span className="text-sm font-normal text-slate-500">{i1.unit}</span>
                      </div>
                    </div>
                  </div>
                );
              }
            })()}

            <div className="space-y-4">
              {tempConfig.target1 ? (
                <>
                  <div>
                    <label className="block text-sm font-semibold mb-1">เงื่อนไข 1 (Sensor 1)</label>
                    <select 
                      value={tempConfig.condition1 || '>'} 
                      onChange={(e) => setTempConfig({...tempConfig, condition1: e.target.value})}
                      className="w-full p-2 border rounded"
                    >
                      <option value="<">น้อยกว่า &lt;</option>
                      <option value=">">มากกว่า &gt;</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">ค่า 1 ({getParamInfo(tempConfig.param1 || 'temp').unit})</label>
                    <input 
                      type="number" 
                      value={tempConfig.target1 || 0} 
                      onChange={(e) => setTempConfig({...tempConfig, target1: parseFloat(e.target.value)})}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">เงื่อนไข 2 (Sensor 2)</label>
                    <select 
                      value={tempConfig.condition2 || '>'} 
                      onChange={(e) => setTempConfig({...tempConfig, condition2: e.target.value})}
                      className="w-full p-2 border rounded"
                    >
                      <option value="<">น้อยกว่า &lt;</option>
                      <option value=">">มากกว่า &gt;</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">ค่า 2 ({getParamInfo(tempConfig.param2 || 'hum').unit})</label>
                    <input 
                      type="number" 
                      value={tempConfig.target2 || 0} 
                      onChange={(e) => setTempConfig({...tempConfig, target2: parseFloat(e.target.value)})}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold mb-1">เงื่อนไข</label>
                    <select 
                      value={tempConfig.condition || '<'} 
                      onChange={(e) => setTempConfig({...tempConfig, condition: e.target.value})}
                      className="w-full p-2 border rounded"
                    >
                      <option value="<">น้อยกว่า &lt;</option>
                      <option value=">">มากกว่า &gt;</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">ค่าเป้าหมาย ({getParamInfo(tempConfig.param || 'soil_hum').unit})</label>
                    <input 
                      type="number" 
                      value={tempConfig.target || 0} 
                      onChange={(e) => setTempConfig({...tempConfig, target: parseFloat(e.target.value)})}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button 
                onClick={() => setShowConfigModal(false)}
                className="flex-1 px-4 py-2 bg-slate-300 text-slate-800 rounded font-semibold hover:bg-slate-400"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleSaveConfigClick}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      <FloatingBack disabled={isSidebarOpen} />
    </div>
  );
}

function FloatingBack({ disabled }) {
  const navigate = useNavigate();
  const handleClick = () => {
    if (disabled) return;
    if (window.history.length > 1) navigate(-1);
    else navigate('/control');
  };

  return (
    <div className="fixed right-6 top-6 z-50">
      <button onClick={handleClick} disabled={disabled} title="กลับไปหน้า Control" aria-label="กลับไปหน้า Control" className={`w-14 h-14 flex items-center justify-center bg-gradient-to-br from-green-500 to-teal-400 hover:from-green-600 hover:to-teal-500 text-white rounded-full shadow-xl transform transition-all duration-200 ${disabled ? 'pointer-events-none opacity-40 scale-95' : 'hover:scale-105'} focus:outline-none`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h13" />
        </svg>
      </button>
    </div>
  );
}
