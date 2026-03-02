import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const API_URL = `http://${window.location.hostname}:5000`;

export default function GraphPage({ espConnected = true }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit] = useState(500);
  const [filterMode, setFilterMode] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [hourlyData, setHourlyData] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  useEffect(() => {
    if (!espConnected) { setData([]); setLoading(false); return; }
    fetchData();
    const interval = setInterval(fetchData, 60000); // Auto-refresh every 1 minute
    return () => clearInterval(interval);
  }, [limit, espConnected]);

  // Fetch hourly data from dedicated endpoint whenever in daily mode
  useEffect(() => {
    if (!espConnected) { setHourlyData([]); return; }
    if (filterMode === 'daily') {
      fetchHourlyData();
      const interval = setInterval(fetchHourlyData, 60000);
      return () => clearInterval(interval);
    }
  }, [filterMode, espConnected]);

  // Fetch weekly data from dedicated endpoint whenever in weekly mode
  useEffect(() => {
    if (!espConnected) { setWeeklyData([]); return; }
    if (filterMode === 'weekly') {
      fetchWeeklyData();
      const interval = setInterval(fetchWeeklyData, 60000);
      return () => clearInterval(interval);
    }
  }, [filterMode, espConnected]);

  // Fetch monthly data from dedicated endpoint whenever in monthly mode
  useEffect(() => {
    if (!espConnected) { setMonthlyData([]); return; }
    if (filterMode === 'monthly') {
      fetchMonthlyData();
      const interval = setInterval(fetchMonthlyData, 60000);
      return () => clearInterval(interval);
    }
  }, [filterMode, espConnected]);

  const fetchHourlyData = async () => {
    try {
      setHourlyLoading(true);
      const response = await fetch(`${API_URL}/api/backup-data/hourly`);
      const result = await response.json();
      if (result.status === 'success') {
        const sorted = [...result.data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const sensorRows = sorted.filter(d => d.type === 'sensor').slice(-24);
        const relayRows = sorted.filter(d => d.type === 'relay').slice(-24);
        setHourlyData([...sensorRows, ...relayRows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
      }
    } catch (err) {
      console.error('Error fetching hourly data:', err);
    } finally {
      setHourlyLoading(false);
    }
  };

  const fetchWeeklyData = async () => {
    try {
      setWeeklyLoading(true);
      const response = await fetch(`${API_URL}/api/backup-data/weekly`);
      const result = await response.json();
      if (result.status === 'success') {
        const sorted = [...result.data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const sensorRows = sorted.filter(d => d.type === 'sensor').slice(-7);
        const relayRows = sorted.filter(d => d.type === 'relay').slice(-7);
        setWeeklyData([...sensorRows, ...relayRows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
      }
    } catch (err) {
      console.error('Error fetching weekly data:', err);
    } finally {
      setWeeklyLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${API_URL}/api/backup-data?limit=${limit}&offset=0`
      );
      const result = await response.json();
      
      if (result.status === 'success') {
        setData(result.data);
      } else {
        setError('Failed to fetch data');
      }
    } catch (error) {
      console.error('Error fetching backup data:', error);
      setError('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };


  const fetchMonthlyData = async () => {
    try {
      setMonthlyLoading(true);
      const response = await fetch(`${API_URL}/api/backup-data/monthly`);
      const result = await response.json();
      if (result.status === 'success') {
        const sorted = [...result.data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const sensorRows = sorted.filter(d => d.type === 'sensor').slice(-4);
        const relayRows = sorted.filter(d => d.type === 'relay').slice(-4);
        setMonthlyData([...sensorRows, ...relayRows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
      }
    } catch (err) {
      console.error('Error fetching monthly data:', err);
    } finally {
      setMonthlyLoading(false);
    }
  };

  const prepareSensorChartData = () => {
    if (!espConnected) {
      return [{ name: '–', temp: 0, humidity: 0, lux: 0, co2: 0, soil_1: 0, soil_2: 0, node3_s2_hum: 0, node3_s1_hum: 0, node3_s3_hum: 0, node3_s4_hum: 0 }];
    }
    const chartData = filterMode === 'daily' ? hourlyData :
                      filterMode === 'weekly' ? weeklyData :
                      monthlyData;

    const sensorEntries = chartData.filter(d => d.type === 'sensor');

    return sensorEntries.map(entry => {
      // _fresh === false → stale (no [FRESH] marker in backup) → null creates a gap in the chart
      // _fresh === undefined → old data, marker not yet present → treat as real
      const isFresh = entry._fresh !== false;
      const val = (v) => isFresh ? (v ?? null) : null;
      return {
        name: entry.timestamp,
        // Zone ENV
        temp:         val(entry.data.temp),
        humidity:     val(entry.data.humidity),
        lux:          val(entry.data.lux),
        co2:          val(entry.data.co2),
        // Zone แปลง 1
        soil_1:       val(entry.data.soil_1),
        soil_2:       val(entry.data.soil_2),
        node3_s2_hum: val(entry.data.node3_s2_hum),
        // Zone แปลง 2
        node3_s1_hum: val(entry.data.node3_s1_hum),
        node3_s3_hum: val(entry.data.node3_s3_hum),
        node3_s4_hum: val(entry.data.node3_s4_hum),
      };
    });
  };

  const sensorChartData = prepareSensorChartData();

  const styles = {
    container: {
      padding: '20px',
      maxWidth: '1400px',
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      borderBottom: '2px solid #e0e0e0',
      paddingBottom: '15px'
    },
    title: {
      fontSize: '24px',
      fontWeight: 'bold',
      margin: 0,
      color: '#333'
    },
    filterContainer: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px'
    },
    filterLabel: {
      display: 'flex',
      alignItems: 'center',
      fontWeight: 'bold',
      color: '#555',
      marginRight: '10px'
    },
    filterButton: {
      padding: '8px 16px',
      borderRadius: '4px',
      border: '1px solid #ddd',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      transition: 'all 0.3s'
    },
    filterButtonActive: {
      backgroundColor: '#2196F3',
      color: 'white',
      borderColor: '#1976D2'
    },
    filterButtonInactive: {
      backgroundColor: '#f0f0f0',
      color: '#666',
      borderColor: '#ddd'
    },
    dateInput: {
      padding: '8px 12px',
      borderRadius: '4px',
      border: '1px solid #ddd',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif'
    },
    chartContainer: {
      marginBottom: '16px',
      padding: '15px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    chartTitle: {
      fontSize: '15px',
      fontWeight: 'bold',
      marginBottom: '10px',
      color: '#333'
    },
    // Zone wrappers
    zoneBlock: {
      borderRadius: '10px',
      padding: '14px 16px',
      marginBottom: '24px',
    },
    zoneHeader: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '12px',
      paddingBottom: '8px',
      borderBottom: '2px solid rgba(0,0,0,0.08)'
    },
    loadingContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '400px',
      fontSize: '18px',
      color: '#999'
    },
    errorBox: {
      padding: '15px',
      backgroundColor: '#ffebee',
      color: '#c62828',
      borderRadius: '4px',
      marginBottom: '20px',
      border: '1px solid #ef5350'
    },
    noDataMessage: {
      padding: '40px',
      textAlign: 'center',
      color: '#999',
      fontSize: '16px'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          ⏳ กำลังโหลดข้อมูล...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📈 กราฟการทำงาน</h2>
      </div>

      {/* Banner: ESP32 ยังไม่ได้เชื่อมต่อ */}
      {!espConnected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff8e1', border: '1px solid #ffca28', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', color: '#795548' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>ESP32 ยังไม่ได้เชื่อมต่อ</div>
            <div style={{ fontSize: '12px', marginTop: '2px' }}>กราฟที่แสดงอยู่เป็น <strong>ข้อมูลย้อนหลัง</strong> ที่บันทึกไว้ใน database — กราฟจะไม่อัปเดตจนกว่า ESP32 จะเชื่อมต่อ</div>
          </div>
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          ⚠️ {error}
        </div>
      )}

      {/* Filter Controls */}
      <div style={styles.filterContainer}>
        <div style={styles.filterLabel}>🔍 โหมดการแสดง:</div>
        <button
          onClick={() => setFilterMode('daily')}
          style={{
            ...styles.filterButton,
            ...(filterMode === 'daily' ? styles.filterButtonActive : styles.filterButtonInactive)
          }}
        >
          24 ชั่วโมงล่าสุด (ทุกชั่วโมง)
        </button>
        <button
          onClick={() => setFilterMode('weekly')}
          style={{
            ...styles.filterButton,
            ...(filterMode === 'weekly' ? styles.filterButtonActive : styles.filterButtonInactive)
          }}
        >
          รายสัปดาห์ (7 วัน)
        </button>
        <button
          onClick={() => setFilterMode('monthly')}
          style={{
            ...styles.filterButton,
            ...(filterMode === 'monthly' ? styles.filterButtonActive : styles.filterButtonInactive)
          }}
        >
          รายเดือน (ทุกสัปดาห์)
        </button>

        {filterMode === 'weekly' && (
          <>
            <div style={styles.filterLabel}>
              {filterMode === 'weekly' ? '📅 เลือกวันเริ่มต้น:' : '📅 เลือกเดือน:'}
            </div>
            <input
              type={filterMode === 'monthly' ? 'month' : 'date'}
              value={filterMode === 'monthly' ? selectedDate.slice(0, 7) : selectedDate}
              onChange={(e) => {
                if (filterMode === 'monthly') {
                  setSelectedDate(e.target.value + '-01');
                } else {
                  setSelectedDate(e.target.value);
                }
              }}
              style={styles.dateInput}
            />
          </>
        )}
      </div>

      {/* Sensor Charts */}
      {sensorChartData.length === 0 ? (
        <div style={styles.noDataMessage}>ไม่มีข้อมูลเซนเซอร์สำหรับช่วงเวลานี้</div>
      ) : (
        <>
          {/* ══════════════ ZONE ENV ══════════════ */}
          <div style={{...styles.zoneBlock, background: '#e3f2fd', border: '2px solid #90caf9'}}>
            <div style={{...styles.zoneHeader, color: '#1565c0'}}>🌡️ สภาพแวดล้อม</div>

            {/* กราฟ 1: อุณหภูมิ + ความชื้นอากาศ */}
            <div style={styles.chartContainer}>
              <div style={styles.chartTitle}>อุณหภูมิ & ความชื้นอากาศ</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sensorChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} tick={{fontSize:11}} />
                  <YAxis yAxisId="left"  domain={[0, 50]}  label={{ value: '°C', angle: -90, position: 'insideLeft', offset: 10 }} tick={{fontSize:11}} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: '%', angle: 90, position: 'insideRight', offset: 10 }} tick={{fontSize:11}} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left"  connectNulls type="monotone" dataKey="temp"     stroke="#d32f2f" name="อุณหภูมิ (°C)"      strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line yAxisId="right" connectNulls type="monotone" dataKey="humidity" stroke="#1976d2" name="ความชื้นอากาศ (%)"  strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* กราฟ 2: แสง + CO2 */}
            <div style={styles.chartContainer}>
              <div style={styles.chartTitle}>แสง & CO₂</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sensorChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} tick={{fontSize:11}} />
                  <YAxis yAxisId="left"  domain={[0, 2000]} label={{ value: 'lux', angle: -90, position: 'insideLeft', offset: 10 }} tick={{fontSize:11}} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 2000]} label={{ value: 'ppm', angle: 90, position: 'insideRight', offset: 10 }} tick={{fontSize:11}} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left"  connectNulls type="monotone" dataKey="lux" stroke="#f57f17" name="แสง (lux)"  strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line yAxisId="right" connectNulls type="monotone" dataKey="co2" stroke="#7b1fa2" name="CO₂ (ppm)"  strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ══════════════ ZONE แปลง 1 ══════════════ */}
          <div style={{...styles.zoneBlock, background: '#e8f5e9', border: '2px solid #a5d6a7'}}>
            <div style={{...styles.zoneHeader, color: '#2e7d32'}}>🌱 แปลง 1 — ความชื้นดิน</div>

            {/* กราฟ 3 */}
            <div style={styles.chartContainer}>
              <div style={styles.chartTitle}>ความชื้นดิน แปลง 1 (%)</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sensorChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} tick={{fontSize:11}} />
                  <YAxis domain={[0, 100]} label={{ value: '%', angle: -90, position: 'insideLeft', offset: 10 }} tick={{fontSize:11}} />
                  <Tooltip />
                  <Legend />
                  <Line connectNulls type="monotone" dataKey="soil_1"       stroke="#1565c0" name="ดิน 1 (%)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line connectNulls type="monotone" dataKey="soil_2"       stroke="#e65100" name="ดิน 2 (%)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line connectNulls type="monotone" dataKey="node3_s2_hum" stroke="#6a1b9a" name="ดิน 3 (%)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ══════════════ ZONE แปลง 2 ══════════════ */}
          <div style={{...styles.zoneBlock, background: '#f1f8e9', border: '2px solid #c5e1a5'}}>
            <div style={{...styles.zoneHeader, color: '#558b2f'}}>🌿 แปลง 2 — ความชื้นดิน</div>

            {/* กราฟ 4 */}
            <div style={styles.chartContainer}>
              <div style={styles.chartTitle}>ความชื้นดิน แปลง 2 (%)</div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sensorChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} tick={{fontSize:11}} />
                  <YAxis domain={[0, 100]} label={{ value: '%', angle: -90, position: 'insideLeft', offset: 10 }} tick={{fontSize:11}} />
                  <Tooltip />
                  <Legend />
                  <Line connectNulls type="monotone" dataKey="node3_s1_hum" stroke="#1565c0" name="ดิน 1 (%)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line connectNulls type="monotone" dataKey="node3_s3_hum" stroke="#e65100" name="ดิน 2 (%)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line connectNulls type="monotone" dataKey="node3_s4_hum" stroke="#6a1b9a" name="ดิน 3 (%)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}