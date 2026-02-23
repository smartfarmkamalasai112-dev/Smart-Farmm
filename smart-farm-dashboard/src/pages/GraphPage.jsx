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

export default function GraphPage() {
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
    fetchData();
    const interval = setInterval(fetchData, 60000); // Auto-refresh every 1 minute
    return () => clearInterval(interval);
  }, [limit]);

  // Fetch hourly data from dedicated endpoint whenever in daily mode
  useEffect(() => {
    if (filterMode === 'daily') {
      fetchHourlyData();
      const interval = setInterval(fetchHourlyData, 60000);
      return () => clearInterval(interval);
    }
  }, [filterMode]);

  // Fetch weekly data from dedicated endpoint whenever in weekly mode
  useEffect(() => {
    if (filterMode === 'weekly') {
      fetchWeeklyData();
      const interval = setInterval(fetchWeeklyData, 60000);
      return () => clearInterval(interval);
    }
  }, [filterMode]);

  // Fetch monthly data from dedicated endpoint whenever in monthly mode
  useEffect(() => {
    if (filterMode === 'monthly') {
      fetchMonthlyData();
      const interval = setInterval(fetchMonthlyData, 60000);
      return () => clearInterval(interval);
    }
  }, [filterMode]);

  const fetchHourlyData = async () => {
    try {
      setHourlyLoading(true);
      const response = await fetch(`http://localhost:5000/api/backup-data/hourly`);
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
      const response = await fetch(`http://localhost:5000/api/backup-data/weekly`);
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
        `http://localhost:5000/api/backup-data?limit=${limit}&offset=0`
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
      const response = await fetch(`http://localhost:5000/api/backup-data/monthly`);
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
    const chartData = filterMode === 'daily' ? hourlyData :
                      filterMode === 'weekly' ? weeklyData :
                      monthlyData;
    
    const sensorEntries = chartData.filter(d => d.type === 'sensor');
    
    return sensorEntries.map(entry => ({
      name: entry.timestamp,
      temp: entry.data.temp || 0,
      humidity: entry.data.humidity || 0,
      soil_1: entry.data.soil_1 || 0,
      soil_2: entry.data.soil_2 || 0,
      lux: entry.data.lux || 0,
      co2: entry.data.co2 || 0
    }));
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
      marginBottom: '30px',
      padding: '15px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    chartTitle: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#333'
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
      {
        <div>
          {sensorChartData.length === 0 ? (
            <div style={styles.noDataMessage}>
              ไม่มีข้อมูลเซนเซอร์สำหรับช่วงเวลานี้
            </div>
          ) : (
            <>
              {/* Temperature & Humidity Chart */}
              <div style={styles.chartContainer}>
                <div style={styles.chartTitle}>🌡️ อุณหภูมิและความชื้น</div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={sensorChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis yAxisId="left" label={{ value: 'อุณหภูมิ (°C)', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: 'ความชื้น (%)', angle: 90, position: 'insideRight' }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="temp" stroke="#d32f2f" name="อุณหภูมิ (°C)" dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#1976d2" name="ความชื้น (%)" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Soil Moisture Chart */}
              <div style={styles.chartContainer}>
                <div style={styles.chartTitle}>🌱 ความชื้นดิน</div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={sensorChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis label={{ value: 'ความชื้น (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="soil_1" stroke="#388e3c" name="ดิน 1 (%)" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="soil_2" stroke="#00796b" name="ดิน 2 (%)" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Light & CO2 Chart */}
              <div style={styles.chartContainer}>
                <div style={styles.chartTitle}>💡 แสงและ CO2</div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={sensorChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis yAxisId="left" label={{ value: 'แสง (lux)', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: 'CO2 (ppm)', angle: 90, position: 'insideRight' }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="lux" stroke="#f57f17" name="แสง (lux)" dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="co2" stroke="#7b1fa2" name="CO2 (ppm)" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      }
    </div>
  );
}