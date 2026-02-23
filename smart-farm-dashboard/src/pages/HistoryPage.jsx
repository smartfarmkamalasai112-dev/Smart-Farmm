import React, { useState, useEffect } from 'react';
import { Clock, Calendar, RefreshCcw, Database } from 'lucide-react';

export default function HistoryPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  // viewMode: 'day' = รายชั่วโมงเริ่มจาก 00:00, 'month' = รายวันเริ่มจากวันที่ 1
  const [viewMode, setViewMode] = useState('day');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // ✅ ดึงข้อมูลสรุปจาก API ที่เราทำ Fixed Slots ไว้ใน Backend
      const res = await fetch(`/api/sheet-history?mode=${viewMode}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const jsonData = await res.json();
      if (jsonData.data) {
        // กรองเอาเฉพาะช่องที่มีข้อมูล (ไม่แสดงช่องที่เป็นค่าว่างในตาราง)
        // หรือถ้าอยากให้เห็นช่องว่างให้เอา .filter ออกครับ
        const validData = jsonData.data.filter(item => item.temp !== null);
        
        // เรียงลำดับ: เอาข้อมูลล่าสุดไว้ด้านบนสุด (Descending)
        setLogs([...validData].reverse());
      }
    } catch (err) {
      console.error("Error fetching aggregated history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 60000); // อัปเดตทุก 1 นาที
    return () => clearInterval(interval);
  }, [viewMode]);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden min-h-[600px] flex flex-col">
      
      {/* Header & Mode Selector */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
          <Database size={24} className="text-blue-600"/> 
          ประวัติข้อมูลสรุป
        </h2>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-200 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode('day')} 
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${viewMode === 'day' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Clock size={16} /> รายชั่วโมง (00:00 - 23:00)
            </button>
            <button 
              onClick={() => setViewMode('month')} 
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${viewMode === 'month' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Calendar size={16} /> รายวัน (วันที่ 1 - สิ้นเดือน)
            </button>
          </div>
          <button onClick={fetchHistory} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600">
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="table-container flex-1 overflow-y-auto relative h-[600px]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="py-3 px-4 font-semibold text-sm">วัน-เวลา</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">Temp</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">Hum</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">Soil</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">Lux</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">CO2</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">N</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">P</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">K</th>
              <th className="py-3 px-2 text-center font-semibold text-sm">pH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center text-slate-400 py-20">
                  {loading ? "กำลังโหลดข้อมูลสรุป..." : "ไม่พบข้อมูลในช่วงเวลานี้"}
                </td>
              </tr>
            ) : (
              logs.map((row, index) => (
                <tr key={index} className="hover:bg-blue-50/50 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                    <div className="font-bold text-slate-700">{row.date}</div>
                    <div className="text-blue-600">{row.time}</div>
                  </td>
                  <td className="py-3 px-2 text-center tabular-nums font-semibold text-red-500">{row.temp}°</td>
                  <td className="py-3 px-2 text-center tabular-nums font-semibold text-blue-500">{row.hum}%</td>
                  <td className="py-3 px-2 text-center tabular-nums font-semibold text-emerald-600">{row.soil}%</td>
                  <td className="py-3 px-2 text-center tabular-nums text-orange-500">{row.lux}</td>
                  <td className="py-3 px-2 text-center tabular-nums text-slate-500">{row.co2}</td>
                  <td className="py-3 px-2 text-center tabular-nums text-emerald-700">{row.n}</td>
                  <td className="py-3 px-2 text-center tabular-nums text-orange-700">{row.p}</td>
                  <td className="py-3 px-2 text-center tabular-nums text-purple-700">{row.k}</td>
                  <td className="py-3 px-2 text-center tabular-nums font-bold text-indigo-600">{row.ph}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center uppercase tracking-widest">
        Data Aggregated from Google Sheets
      </div>
    </div>
  );
}