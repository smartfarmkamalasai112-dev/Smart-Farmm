import React from 'react';
import { Link } from 'react-router-dom';
import RelayControl from '../components/RelayControl';

const DEVICE_NAMES = ["ปั้มแปลง1", "พัดลม", "ไฟส่องสว่าง", "พ่นหมอก"];
const UNIT_LABELS = ["% (Moisture)", "°C (Temp)", "Lux (Light)", "% (Hum)"];

export default function ControlPage({ displayData, onToggleRelay, onToggleMode, isSidebarOpen }) {
  // Mapping ค่าปัจจุบันเพื่อส่งไปโชว์เทียบกับค่าที่ตั้งไว้
  // ลำดับต้องตรงกับ Relay: [0=ปั๊ม(ดิน), 1=พัดลม(temp), 2=ไฟ(light), 3=หมอก(hum)]
  const currentSensorValues = [
    displayData.soil,    // Relay 1 (Pump) คุมด้วยความชื้นดิน
    displayData.th.t,    // Relay 2 (Fan) คุมด้วยอุณหภูมิ
    displayData.light,   // Relay 3 (Lamp) คุมด้วยแสง
    displayData.hum      // Relay 4 (Mist) คุมด้วยความชื้นอากาศ (สมมติ)
  ];

  return (
    <div className="animate-fade-in pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RelayControl 
          relays={displayData.relay} 
          mode={displayData.mode}
          onToggleRelay={onToggleRelay}
          onToggleMode={onToggleMode}
          config={displayData.config}
        />
      </div>

      {/* Floating button: navigate to Automation Rules page (top-right, prettier) */}
      <div className="fixed right-6 top-6 z-50">
        <Link to="/control/automation" title="ไปที่ Automation Rules" aria-label="ไปที่ Automation Rules">
          <button
            className={`w-14 h-14 flex items-center justify-center bg-gradient-to-br from-green-500 to-teal-400 hover:from-green-600 hover:to-teal-500 text-white rounded-full shadow-xl transform transition-all duration-200 ${isSidebarOpen ? 'pointer-events-none opacity-40 scale-95' : 'hover:scale-105'} focus:outline-none`}
            aria-disabled={isSidebarOpen}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </Link>
      </div>
    </div>
  );
}