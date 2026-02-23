import React from 'react';
import Card from '../components/Card';
import NPK from '../components/NPK';
import TH from '../components/TH';

export default function MonitorPage({ displayData }) {
  return (
    <div className="w-full h-full pb-2 animate-fade-in">
      
      {/* Grid 4 คอลัมน์ - แสดงทั้งหมด */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* --- แถวที่ 1: ค่าหลัก 4 ตัว --- */}
        {/* ปรับเหลือ h-28 (ประมาณ 110px) */}
        <div className="h-28"><Card title="Air Temp" value={`${displayData.airTemp.toFixed(1)} °C`} /></div>
        <div className="h-28"><Card title="Humidity" value={`${displayData.hum.toFixed(1)} %`} /></div>
        <div className="h-28"><Card title="Soil Moist (SN-3002)" value={`${displayData.soil.toFixed(1)} %`} /></div>
        <div className="h-28"><Card title="Moisture1 (SN-300SD)" value={`${displayData.soilMoisture1.toFixed(1)} %`} /></div>

        {/* --- แถวที่ 2: NPK --- */}
        {/* ปรับเหลือ h-40 (ประมาณ 160px) ให้พอดีเนื้อหา */}
        <div className="h-56 col-span-2 lg:col-span-4">
          <NPK npk={displayData.npk} />
        </div>

        {/* --- แถวที่ 3: pH, CO2, Light --- */}
        {/* ปรับเหลือ h-28 เท่าแถวบน */}
        <div className="h-28 col-span-2 lg:col-span-1">
          <Card title="pH Level" value={displayData.ph.toFixed(1)} />
        </div>
        
        <div className="h-28 col-span-2 lg:col-span-1">
          <Card title="CO2 Level" value={`${displayData.co2} ppm`} />
        </div>

        <div className="h-28 col-span-2 lg:col-span-2">
          <Card title="Light" value={`${displayData.light.toFixed(0)} lx`} />
        </div>

        {/* --- แถวที่ 4: Node 3 Soil Sensors (ใหม่) --- */}
        {displayData.soilSensors && (displayData.soilSensors.soil_1 !== undefined || displayData.soilSensors.soil_2 !== undefined || displayData.soilSensors.soil_3 !== undefined || displayData.soilSensors.soil_4 !== undefined) && (
          <>
            <div className="col-span-2 lg:col-span-4 my-2">
              <h3 className="text-sm font-bold text-gray-600 px-1">🌱 Node 3 - Soil Moisture Sensors</h3>
            </div>
            <div className="h-28"><Card title="Sensor 1" value={`${(displayData.soilSensors.soil_1 || 0).toFixed(1)} %`} /></div>
            <div className="h-28"><Card title="Sensor 2" value={`${(displayData.soilSensors.soil_2 || 0).toFixed(1)} %`} /></div>
            <div className="h-28"><Card title="Sensor 3" value={`${(displayData.soilSensors.soil_3 || 0).toFixed(1)} %`} /></div>
            <div className="h-28"><Card title="Sensor 4" value={`${(displayData.soilSensors.soil_4 || 0).toFixed(1)} %`} /></div>
          </>
        )}

      </div>
    </div>
  );
}