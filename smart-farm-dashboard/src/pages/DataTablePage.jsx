import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

export default function DataTablePage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('sensor');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'daily', 'weekly', 'monthly'
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
  }, [page, limit]);

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
        // Keep only last 24 unique hours (rolling window: drop oldest when new hour arrives)
        const sorted = [...result.data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        // For each type, keep max 24 entries (last 24 hours)
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
        `http://localhost:5000/api/backup-data?limit=${limit}&offset=${page * limit}`
      );
      const result = await response.json();
      
      if (result.status === 'success') {
        setData(result.data);
        setTotal(result.total);
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

  const sensorData = data.filter(d => d.type === 'sensor');
  const relayData = data.filter(d => d.type === 'relay');

  const handleExport = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `farm-data-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const generateCSV = () => {
    let csv = 'Timestamp,Type,Data\n';
    data.forEach(row => {
      const dataStr = JSON.stringify(row.data).replace(/"/g, '""');
      csv += `${row.timestamp},${row.type},"${dataStr}"\n`;
    });
    return csv;
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

  const maxPages = Math.ceil(total / limit);

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
    exportBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      backgroundColor: '#27ae60',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold'
    },
    tabNav: {
      display: 'flex',
      gap: '10px',
      marginBottom: '20px',
      borderBottom: '2px solid #e0e0e0'
    },
    tabButton: {
      padding: '10px 20px',
      border: 'none',
      backgroundColor: 'transparent',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      borderBottom: '3px solid transparent',
      transition: 'all 0.3s ease'
    },
    tabButtonActive: {
      color: '#2196F3',
      borderBottomColor: '#2196F3'
    },
    tabButtonInactive: {
      color: '#999',
      opacity: 0.7
    },
    loadingContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '300px'
    },
    loadingText: {
      fontSize: '18px',
      color: '#999',
      textAlign: 'center'
    },
    errorBox: {
      backgroundColor: '#ffebee',
      border: '1px solid #f44336',
      color: '#c62828',
      padding: '12px 16px',
      borderRadius: '4px',
      marginBottom: '20px'
    },
    filterContainer: {
      display: 'flex',
      gap: '15px',
      alignItems: 'center',
      padding: '15px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px',
      marginBottom: '20px',
      flexWrap: 'wrap'
    },
    filterLabel: {
      fontWeight: 'bold',
      color: '#333',
      fontSize: '14px'
    },
    filterButton: {
      padding: '8px 16px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      backgroundColor: 'white',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      transition: 'all 0.3s ease'
    },
    filterButtonActive: {
      backgroundColor: '#2196F3',
      color: 'white',
      borderColor: '#2196F3'
    },
    filterButtonInactive: {
      color: '#666'
    },
    dateInput: {
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif'
    },
    tableWrapper: {
      overflowX: 'auto',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '14px'
    },
    tableHead: {
      backgroundColor: '#f5f5f5',
      borderBottom: '2px solid #ddd'
    },
    tableHeadCell: {
      padding: '12px 16px',
      textAlign: 'left',
      fontWeight: 'bold',
      color: '#333'
    },
    tableHeadCellCenter: {
      padding: '12px 16px',
      textAlign: 'center',
      fontWeight: 'bold',
      color: '#333'
    },
    tableRow: {
      borderBottom: '1px solid #eee'
    },
    tableRowAlt: {
      backgroundColor: '#fafafa'
    },
    tableCell: {
      padding: '12px 16px'
    },
    tableCellCenter: {
      padding: '12px 16px',
      textAlign: 'center'
    },
    paginationContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '20px',
      padding: '15px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px'
    },
    paginationInfo: {
      fontSize: '14px',
      color: '#666'
    },
    paginationButtons: {
      display: 'flex',
      gap: '10px'
    },
    paginationBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      backgroundColor: '#2196F3',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold'
    },
    paginationBtnDisabled: {
      backgroundColor: '#ccc',
      cursor: 'not-allowed'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📊 ตารางข้อมูลการทำงาน</h2>
        <button
          onClick={handleExport}
          style={styles.exportBtn}
          onMouseOver={(e) => e.target.style.backgroundColor = '#229954'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#27ae60'}
        >
          <Download size={16} />
          ดาวน์โหลด CSV
        </button>
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
          onClick={() => setFilterMode('all')}
          style={{
            ...styles.filterButton,
            ...(filterMode === 'all' ? styles.filterButtonActive : styles.filterButtonInactive)
          }}
        >
          ทั้งหมด
        </button>
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
                  // Convert month format (YYYY-MM) back to date format (YYYY-MM-01)
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

      {/* Tab Navigation */}
      <div style={styles.tabNav}>
        <button
          onClick={() => setActiveTab('sensor')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'sensor' ? styles.tabButtonActive : styles.tabButtonInactive)
          }}
        >
          📊 ข้อมูลเซนเซอร์ ({filterMode === 'daily' ? hourlyData.filter(d => d.type === 'sensor').length : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'sensor').length : filterMode === 'monthly' ? monthlyData.filter(d => d.type === 'sensor').length : sensorData.length})
        </button>
        <button
          onClick={() => setActiveTab('relay')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'relay' ? styles.tabButtonActive : styles.tabButtonInactive)
          }}
        >
          ⚡ สถานะรีเลย์ ({filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay').length : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay').length : filterMode === 'monthly' ? monthlyData.filter(d => d.type === 'relay').length : relayData.length})
        </button>
      </div>

      {/* Loading State */}
      {(loading || (filterMode === 'daily' && hourlyLoading) || (filterMode === 'weekly' && weeklyLoading) || (filterMode === 'monthly' && monthlyLoading)) && (
        <div style={styles.loadingContainer}>
          <div style={styles.loadingText}>กำลังโหลดข้อมูล...</div>
        </div>
      )}

      {/* Sensor Data Table */}
      {!(loading || (filterMode === 'daily' && hourlyLoading) || (filterMode === 'weekly' && weeklyLoading) || (filterMode === 'monthly' && monthlyLoading)) && activeTab === 'sensor' && (
        <div style={styles.tableWrapper}>
          {filterMode === 'daily' && hourlyData.filter(d => d.type === 'sensor').length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลเซนเซอร์ใน 24 ชั่วโมงที่ผ่านมา
            </div>
          )}
          {filterMode === 'weekly' && weeklyData.filter(d => d.type === 'sensor').length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลเซนเซอร์สำหรับ 7 วันนี้
            </div>
          )}          {filterMode === 'monthly' && monthlyData.filter(d => d.type === 'sensor').length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลเซนเซอร์สำหรับเดือนนี้
            </div>
          )}          {filterMode === 'all' && sensorData.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลเซนเซอร์
            </div>
          )}
          {(filterMode === 'all' ? sensorData.length > 0 : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'sensor').length > 0 : weeklyData.filter(d => d.type === 'sensor').length > 0) && (
            <table style={styles.table}>
              <thead style={styles.tableHead}>
                <tr>
                  <th style={styles.tableHeadCell}>เวลา {filterMode === 'daily' ? '(รายชั่วโมง)' : filterMode === 'weekly' ? '(รายวัน)' : ''}</th>
                  <th style={styles.tableHeadCellCenter}>อุณหภูมิ (°C)</th>
                  <th style={styles.tableHeadCellCenter}>ความชื้น (%)</th>
                  {/* Soil 1 Expanded */}
                  <th style={styles.tableHeadCellCenter}>ดิน 1 (%)</th>
                  <th style={styles.tableHeadCellCenter}>ดิน 1 (pH)</th>
                  <th style={styles.tableHeadCellCenter}>ดิน 1 (N)</th>
                  <th style={styles.tableHeadCellCenter}>ดิน 1 (P)</th>
                  <th style={styles.tableHeadCellCenter}>ดิน 1 (K)</th>
                  <th style={styles.tableHeadCellCenter}>ดิน 2 (%)</th>
                  {/* ⭐ NEW: Node 3 Columns */}
                  <th style={styles.tableHeadCellCenter}>S1 (Node 3)</th>
                  <th style={styles.tableHeadCellCenter}>S1 pH (Node 3)</th>
                  <th style={styles.tableHeadCellCenter}>S2 (Node 3)</th>
                  <th style={styles.tableHeadCellCenter}>S3 (Node 3)</th>
                  <th style={styles.tableHeadCellCenter}>S4 (Node 3)</th>
                  
                  <th style={styles.tableHeadCellCenter}>แสง (lux)</th>
                  <th style={styles.tableHeadCellCenter}>CO2 (ppm)</th>
                </tr>
              </thead>
              <tbody style={styles.tableBody}>
                {(filterMode === 'all' ? sensorData : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'sensor') : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'sensor') : monthlyData.filter(d => d.type === 'sensor')).map((row, idx) => (
                  <tr 
                    key={idx} 
                    style={{
                      ...styles.tableRow,
                      ...(idx % 2 === 0 ? {} : styles.tableRowAlt)
                    }}
                  >
                    <td style={styles.tableCell}>{row.timestamp}</td>
                    <td style={{...styles.tableCellCenter, color: '#d32f2f', fontWeight: 'bold'}}>
                      {row.data.temp?.toFixed(1) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#1976d2', fontWeight: 'bold'}}>
                      {row.data.humidity?.toFixed(1) || '-'}
                    </td>
                    {/* Soil 1 Expanded */}
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold'}}>
                      {row.data.soil_1?.toFixed(1) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold', fontSize: '12px'}}>
                      {row.data.soil_1_ph?.toFixed(1) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold', fontSize: '12px'}}>
                      {row.data.soil_1_n?.toFixed(0) || '-'} mg/kg
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold', fontSize: '12px'}}>
                      {row.data.soil_1_p?.toFixed(0) || '-'} mg/kg
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold', fontSize: '12px'}}>
                      {row.data.soil_1_k?.toFixed(0) || '-'} mg/kg
                    </td>
                    
                    <td style={{...styles.tableCellCenter, color: '#00796b', fontWeight: 'bold'}}>
                      {row.data.soil_2?.toFixed(1) || '-'}
                    </td>
                    
                    {/* ⭐ NEW: Node 3 Data Cells */}
                    <td style={{...styles.tableCellCenter, color: '#558b2f', fontWeight: 'bold'}}>
                      {row.data.node3_s1_hum?.toFixed(1) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#689f38', fontWeight: 'bold'}}>
                       {/* This is pH, currently 0 */}
                      -
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#689f38', fontWeight: 'bold'}}>
                      {row.data.node3_s2_hum?.toFixed(1) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#7cb342', fontWeight: 'bold'}}>
                      {row.data.node3_s3_hum?.toFixed(1) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#8bc34a', fontWeight: 'bold'}}>
                      {row.data.node3_s4_hum?.toFixed(1) || '-'}
                    </td>
                    
                    <td style={{...styles.tableCellCenter, color: '#f57f17', fontWeight: 'bold'}}>
                      {row.data.lux?.toFixed(0) || '-'}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#7b1fa2', fontWeight: 'bold'}}>
                      {row.data.co2?.toFixed(0) || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Relay Data Table */}
      {!(loading || (filterMode === 'daily' && hourlyLoading) || (filterMode === 'weekly' && weeklyLoading) || (filterMode === 'monthly' && monthlyLoading)) && activeTab === 'relay' && (
        <div style={styles.tableWrapper}>
          {filterMode === 'daily' && hourlyData.filter(d => d.type === 'relay').length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลรีเลย์ใน 24 ชั่วโมงที่ผ่านมา
            </div>
          )}
          {filterMode === 'weekly' && weeklyData.filter(d => d.type === 'relay').length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลรีเลย์สำหรับ 7 วันนี้
            </div>
          )}
          {filterMode === 'monthly' && monthlyData.filter(d => d.type === 'relay').length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลรีเลย์สำหรับเดือนนี้
            </div>
          )}
          {filterMode === 'all' && relayData.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              ไม่มีข้อมูลรีเลย์
            </div>
          )}
          {(filterMode === 'all' ? relayData.length > 0 : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay').length > 0 : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay').length > 0 : monthlyData.filter(d => d.type === 'relay').length > 0) && (
            <table style={styles.table}>
              <thead style={styles.tableHead}>
                <tr>
                  <th style={styles.tableHeadCell}>เวลา {filterMode === 'daily' ? '(รายชั่วโมง)' : filterMode === 'weekly' ? '(รายวัน)' : filterMode === 'monthly' ? '(รายสัปดาห์)' : ''}</th>
                  {(filterMode === 'all' ? relayData : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay') : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay') : monthlyData.filter(d => d.type === 'relay')).length > 0 && 
                    Object.keys((filterMode === 'all' ? relayData[0] : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay')[0] : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay')[0] : monthlyData.filter(d => d.type === 'relay')[0]).data).map(relayName => (
                      <th key={relayName} style={styles.tableHeadCellCenter} title={relayName}>
                        {relayName}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody style={styles.tableBody}>
                {(filterMode === 'all' ? relayData : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay') : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay') : monthlyData.filter(d => d.type === 'relay')).map((row, idx) => (
                  <tr 
                    key={idx}
                    style={{
                      ...styles.tableRow,
                      ...(idx % 2 === 0 ? {} : styles.tableRowAlt)
                    }}
                  >
                    <td style={styles.tableCell}>{row.timestamp}</td>
                    {Object.entries(row.data).map(([relayName, relayInfo]) => (
                      <td 
                        key={relayName} 
                        style={styles.tableCellCenter}
                        title={`${relayName}: ${relayInfo.state} (${relayInfo.mode})`}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
                          <div style={{color: relayInfo.state === 'ON' ? '#d32f2f' : '#388e3c'}}>
                            {relayInfo.state}
                          </div>
                          <div style={{color: relayInfo.mode === 'AUTO' ? '#1976d2' : '#f57f17', fontSize: '11px', marginTop: '2px'}}>
                            {relayInfo.mode}
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div style={styles.paginationContainer}>
          <div style={styles.paginationInfo}>
            หน้า {page + 1} จาก {maxPages} (ทั้งหมด {total} รายการ)
          </div>
          <div style={styles.paginationButtons}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                ...styles.paginationBtn,
                ...(page === 0 ? styles.paginationBtnDisabled : {})
              }}
            >
              <ChevronLeft size={16} /> ก่อนหน้า
            </button>
            <button
              onClick={() => setPage(Math.min(maxPages - 1, page + 1))}
              disabled={page >= maxPages - 1}
              style={{
                ...styles.paginationBtn,
                ...(page >= maxPages - 1 ? styles.paginationBtnDisabled : {})
              }}
            >
              ถัดไป <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
