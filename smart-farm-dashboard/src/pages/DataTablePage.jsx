import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

export default function DataTablePage({ espConnected = true }) {
  const exportBtnRef = useRef(null);
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
  const [pageInput, setPageInput] = useState('');

  const handlePageJump = (e) => {
    e.preventDefault();
    const num = parseInt(pageInput, 10);
    if (!isNaN(num) && num >= 1 && num <= maxPages) {
      setPage(num - 1);
    }
    setPageInput('');
  };

  useEffect(() => {
    if (!espConnected) {
      setData([]); setTotal(0); setLoading(false);
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 60000); // Auto-refresh every 1 minute
    return () => clearInterval(interval);
  }, [page, limit, espConnected]);

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
      const response = await fetch(`http://${window.location.hostname}:5000/api/backup-data/hourly`);
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
      const response = await fetch(`http://${window.location.hostname}:5000/api/backup-data/weekly`);
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
        `http://${window.location.hostname}:5000/api/backup-data?limit=${limit}&offset=${page * limit}`
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

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // Fetch ALL data from backend
      const response = await fetch(`http://${window.location.hostname}:5000/api/backup-data?limit=999999&offset=0`);
      const result = await response.json();
      
      if (result.status === 'success' && result.data) {
        const csv = generateCSV(result.data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `farm-data-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('ไม่มีข้อมูล');
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลด: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const generateCSV = (dataArray = data) => {
    let csv = 'Timestamp,Type,Data\n';
    dataArray.forEach(row => {
      const dataStr = JSON.stringify(row.data).replace(/"/g, '""');
      csv += `${row.timestamp},${row.type},"${dataStr}"\n`;
    });
    return csv;
  };



  const fetchMonthlyData = async () => {
    try {
      setMonthlyLoading(true);
      const response = await fetch(`http://${window.location.hostname}:5000/api/backup-data/monthly`);
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

  // คำนวณช่วงห่างระหว่าง 2 timestamp
  const getInterval = (rows, idx) => {
    if (idx === 0) return null;
    const prev = new Date(rows[idx - 1].timestamp);
    const curr = new Date(rows[idx].timestamp);
    const diffSec = Math.round((curr - prev) / 1000);
    if (isNaN(diffSec) || diffSec < 0) return null;
    if (diffSec < 60) return { label: `${diffSec}s`, real: diffSec > 30 };
    if (diffSec < 3600) return { label: `${Math.round(diffSec / 60)}m`, real: true };
    return { label: `${Math.round(diffSec / 3600)}h`, real: true };
  };

  const styles = {
    container: {
      padding: '6px',
      maxWidth: '100%',
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
      borderBottom: '2px solid #e0e0e0',
      paddingBottom: '6px'
    },
    title: {
      fontSize: '16px',
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
      marginBottom: '10px'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '11px',
      tableLayout: 'auto'
    },
    tableHead: {
      backgroundColor: '#f5f5f5',
      borderBottom: '2px solid #ddd'
    },
    tableHeadCell: {
      padding: '5px 4px',
      textAlign: 'left',
      fontWeight: 'bold',
      color: '#333',
      fontSize: '10px',
      lineHeight: '1.3',
      whiteSpace: 'normal',
      minWidth: '54px'
    },
    tableHeadCellCenter: {
      padding: '5px 4px',
      textAlign: 'center',
      fontWeight: 'bold',
      color: '#333',
      fontSize: '10px',
      lineHeight: '1.3',
      whiteSpace: 'normal',
      minWidth: '54px'
    },
    tableRow: {
      borderBottom: '1px solid #eee'
    },
    tableRowAlt: {
      backgroundColor: '#fafafa'
    },
    tableCell: {
      padding: '5px 4px'
    },
    tableCellCenter: {
      padding: '5px 4px',
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
    },
    pageJumpForm: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    },
    pageJumpLabel: {
      fontSize: '14px',
      color: '#666'
    },
    pageJumpInput: {
      width: '60px',
      padding: '7px 8px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '14px',
      textAlign: 'center',
      outline: 'none'
    },
    pageJumpBtn: {
      padding: '7px 12px',
      backgroundColor: '#2196F3',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold'
    }
  };

  // ── Relay columns (fixed order, ตรงกับหน้าควบคุม) ─────────────────────────
  const RELAY_COLS = [
    { key: 'Fan',         label: 'พัดลม',         group: 'env' },
    { key: 'Mist',        label: 'พ่นหมอก',       group: 'env' },
    { key: 'EvapPump',    label: 'ปั้มEvap',       group: 'env' },
    { key: 'Lamp',        label: 'ไฟส่องสว่าง',    group: 'env' },
    { key: 'Pump',        label: 'ปั้มแปลง1',      group: 'z1'  },
    { key: 'V1-P1',       label: 'วาล์ว1 แปลง1',   group: 'z1'  },
    { key: 'V2-P1',       label: 'วาล์ว2 แปลง1',   group: 'z1'  },
    { key: 'V3-P1',       label: 'วาล์ว3 แปลง1',   group: 'z1'  },
    { key: 'Plot Pump 2', label: 'ปั้มแปลง2',      group: 'z2'  },
    { key: 'V1-P2',       label: 'วาล์ว1 แปลง2',   group: 'z2'  },
    { key: 'V2-P2',       label: 'วาล์ว2 แปลง2',   group: 'z2'  },
    { key: 'V3-P2',       label: 'วาล์ว3 แปลง2',   group: 'z2'  },
  ];

  const renderRelayCell = (data, key, isFresh) => {
    // Show – when row is stale (not fresh from real ESP data)
    if (!isFresh) {
      return <td key={key} style={styles.tableCellCenter}><span style={{ color: '#bbb', fontStyle: 'italic', fontWeight: 'normal' }}>NaN</span></td>;
    }
    const info = data?.[key];
    if (!info) return <td key={key} style={styles.tableCellCenter}><span style={{color:'#bbb'}}>-</span></td>;
    return (
      <td key={key} style={styles.tableCellCenter} title={`${key}: ${info.state} (${info.mode})`}>
        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
          <div style={{ color: info.state === 'ON' ? '#388e3c' : '#d32f2f' }}>{info.state}</div>
          <div style={{ color: info.mode === 'AUTO' ? '#1976d2' : '#f57f17', fontSize: '11px', marginTop: '2px' }}>{info.mode}</div>
        </div>
      </td>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📊 ตารางข้อมูลการทำงาน</h2>
        <button
          ref={exportBtnRef}
          onClick={handleExport}
          disabled={isExporting}
          style={{ ...styles.exportBtn, opacity: isExporting ? 0.7 : 1, cursor: isExporting ? 'wait' : 'pointer' }}
          onMouseOver={(e) => { if (!isExporting) e.currentTarget.style.backgroundColor = '#229954'; }}
          onMouseOut={(e) => { if (!isExporting) e.currentTarget.style.backgroundColor = '#27ae60'; }}
        >
          <Download size={16} />
          {isExporting ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด CSV'}
        </button>
      </div>

      {/* Banner: ESP32 ยังไม่ได้เชื่อมต่อ */}
      {!espConnected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff8e1', border: '1px solid #ffca28', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', color: '#795548' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>ESP32 ยังไม่ได้เชื่อมต่อ</div>
            <div style={{ fontSize: '12px', marginTop: '2px' }}>ข้อมูลที่แสดงอยู่เป็น <strong>ข้อมูลย้อนหลัง</strong> ที่บันทึกไว้ใน database — ระบบจะไม่รับข้อมูลใหม่จนกว่า ESP32 จะเชื่อมต่อ</div>
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
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลเซนเซอร์ใน 24 ชั่วโมงที่ผ่านมา'}
            </div>
          )}
          {filterMode === 'weekly' && weeklyData.filter(d => d.type === 'sensor').length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลเซนเซอร์สำหรับ 7 วันนี้'}
            </div>
          )}          {filterMode === 'monthly' && monthlyData.filter(d => d.type === 'sensor').length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลเซนเซอร์สำหรับเดือนนี้'}
            </div>
          )}          {filterMode === 'all' && sensorData.length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลเซนเซอร์'}
            </div>
          )}
          {(filterMode === 'all' ? sensorData.length > 0 : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'sensor').length > 0 : weeklyData.filter(d => d.type === 'sensor').length > 0) && (
            <table style={styles.table}>
              <thead style={styles.tableHead}>
                {/* แถวที่ 1 — กลุ่มโซน */}
                <tr>
                  <th rowSpan={2} style={{...styles.tableHeadCell, verticalAlign: 'middle', borderRight: '2px solid #bbb'}}>
                    เวลา {filterMode === 'daily' ? '(รายชั่วโมง)' : filterMode === 'weekly' ? '(รายวัน)' : ''}
                  </th>
                  <th rowSpan={2} style={{...styles.tableHeadCellCenter, verticalAlign: 'middle', borderRight: '2px solid #bbb', background: '#f5f5f5', minWidth: '60px'}}>
                    ⏱ ช่วงห่าง
                  </th>
                  <th colSpan={4} style={{...styles.tableHeadCellCenter, background: '#e3f2fd', color: '#1565c0', borderBottom: '1px solid #90caf9', borderRight: '2px solid #90caf9'}}>
                    🌡️ สภาพแวดล้อม
                  </th>
                  <th colSpan={7} style={{...styles.tableHeadCellCenter, background: '#e8f5e9', color: '#2e7d32', borderBottom: '1px solid #a5d6a7', borderRight: '2px solid #a5d6a7'}}>
                    🌱 แปลง 1
                  </th>
                  <th colSpan={7} style={{...styles.tableHeadCellCenter, background: '#f1f8e9', color: '#558b2f', borderBottom: '1px solid #c5e1a5'}}>
                    🌿 แปลง 2
                  </th>
                </tr>
                {/* แถวที่ 2 — ชื่อคอลัมน์ */}
                <tr>
                  {/* สภาพแวดล้อม */}
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #90caf9'}}>อุณหภูมิ (°C)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #90caf9'}}>ความชื้น (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #90caf9'}}>แสง (lux)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '2px solid #90caf9'}}>CO2 (ppm)</th>
                  {/* แปลง 1 */}
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #a5d6a7'}}>ดิน 1 (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #a5d6a7'}}>ดิน 2 (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #a5d6a7'}}>ดิน 3 (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #a5d6a7'}}>pH</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #a5d6a7'}}>N</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #a5d6a7'}}>P</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '2px solid #a5d6a7'}}>K</th>
                  {/* แปลง 2 */}
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #c5e1a5'}}>ดิน 1 (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #c5e1a5'}}>ดิน 2 (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #c5e1a5'}}>ดิน 3 (%)</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #c5e1a5'}}>pH</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #c5e1a5'}}>N</th>
                  <th style={{...styles.tableHeadCellCenter, borderRight: '1px solid #c5e1a5'}}>P</th>
                  <th style={styles.tableHeadCellCenter}>K</th>
                </tr>
              </thead>
              <tbody style={styles.tableBody}>
                {(() => {
                  const rows = filterMode === 'all' ? sensorData : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'sensor') : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'sensor') : monthlyData.filter(d => d.type === 'sensor');
                  return rows.map((row, idx) => {
                  const gap = getInterval(rows, idx);
                  // 'all' mode: gap-based detection (5s duplicates = stale)
                  // hourly/weekly/monthly: use _fresh flag from API ([FRESH] marker in backup file)
                  // row._fresh === undefined (old data) → treat as real; false → stale → NaN
                  const isReal = filterMode === 'all'
                    ? (gap === null || gap.real)
                    : row._fresh !== false;
                  const nanStyle = { color: '#bbb', fontStyle: 'italic', fontWeight: 'normal' };
                  const v = (val, decimals = 1) => isReal
                    ? (val != null ? val.toFixed(decimals) : '-')
                    : <span style={nanStyle}>NaN</span>;
                  return (
                  <tr 
                    key={idx} 
                    style={{
                      ...styles.tableRow,
                      ...(idx % 2 === 0 ? {} : styles.tableRowAlt)
                    }}
                  >
                    <td style={styles.tableCell}>{row.timestamp}</td>
                    <td style={{...styles.tableCellCenter, borderRight: '2px solid #bbb'}}>
                      {gap === null ? (
                        <span style={{ color: '#aaa', fontSize: '11px' }}>–</span>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          background: gap.real ? '#e8f5e9' : '#ffebee',
                          color: gap.real ? '#2e7d32' : '#c62828'
                        }}>
                          {gap.real ? '✅' : '⚠️'} {gap.label}
                        </span>
                      )}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#d32f2f', fontWeight: 'bold'}}>
                      {v(row.data.temp, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#1976d2', fontWeight: 'bold'}}>
                      {v(row.data.humidity, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#f57f17', fontWeight: 'bold'}}>
                      {v(row.data.lux, 0)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#7b1fa2', fontWeight: 'bold'}}>
                      {v(row.data.co2, 0)}
                    </td>
                    {/* แปลง 1 — ความชื้นดิน 1, 2, 3 */}
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold'}}>
                      {v(row.data.soil_1, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#00796b', fontWeight: 'bold'}}>
                      {v(row.data.soil_2, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#689f38', fontWeight: 'bold'}}>
                      {v(row.data.node3_s2_hum, 1)}
                    </td>
                    {/* แปลง 1 — pH, N, P, K */}
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold'}}>
                      {v(row.data.soil_1_ph, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold'}}>
                      {v(row.data.soil_1_n, 0)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold'}}>
                      {v(row.data.soil_1_p, 0)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#388e3c', fontWeight: 'bold'}}>
                      {v(row.data.soil_1_k, 0)}
                    </td>
                    {/* แปลง 2 */}
                    <td style={{...styles.tableCellCenter, color: '#558b2f', fontWeight: 'bold'}}>
                      {v(row.data.node3_s1_hum, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#7cb342', fontWeight: 'bold'}}>
                      {v(row.data.node3_s3_hum, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#8bc34a', fontWeight: 'bold'}}>
                      {v(row.data.node3_s4_hum, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#558b2f', fontWeight: 'bold', fontSize: '12px'}}>
                      {v(row.data.node3_s1_ph, 1)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#558b2f', fontWeight: 'bold', fontSize: '12px'}}>
                      {v(row.data.node3_s1_n, 0)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#558b2f', fontWeight: 'bold', fontSize: '12px'}}>
                      {v(row.data.node3_s1_p, 0)}
                    </td>
                    <td style={{...styles.tableCellCenter, color: '#558b2f', fontWeight: 'bold', fontSize: '12px'}}>
                      {v(row.data.node3_s1_k, 0)}
                    </td>
                  </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Relay Data Table */}
      {!(loading || (filterMode === 'daily' && hourlyLoading) || (filterMode === 'weekly' && weeklyLoading) || (filterMode === 'monthly' && monthlyLoading)) && activeTab === 'relay' && (
        <div style={styles.tableWrapper}>
          {filterMode === 'daily' && hourlyData.filter(d => d.type === 'relay').length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลรีเลย์ใน 24 ชั่วโมงที่ผ่านมา'}
            </div>
          )}
          {filterMode === 'weekly' && weeklyData.filter(d => d.type === 'relay').length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลรีเลย์สำหรับ 7 วันนี้'}
            </div>
          )}
          {filterMode === 'monthly' && monthlyData.filter(d => d.type === 'relay').length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลรีเลย์สำหรับเดือนนี้'}
            </div>
          )}
          {filterMode === 'all' && relayData.length === 0 && (
            <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px' }}>
              {!espConnected ? '– – – – –' : 'ไม่มีข้อมูลรีเลย์'}
            </div>
          )}
          {(filterMode === 'all' ? relayData.length > 0 : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay').length > 0 : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay').length > 0 : monthlyData.filter(d => d.type === 'relay').length > 0) && (
            <table style={styles.table}>
              <thead style={styles.tableHead}>
                {/* แถวที่ 1 — กลุ่มโซน */}
                <tr>
                  <th rowSpan={2} style={{...styles.tableHeadCell, verticalAlign: 'middle', borderRight: '2px solid #bbb'}}>
                    เวลา {filterMode === 'daily' ? '(รายชั่วโมง)' : filterMode === 'weekly' ? '(รายวัน)' : filterMode === 'monthly' ? '(รายสัปดาห์)' : ''}
                  </th>
                  <th colSpan={4} style={{...styles.tableHeadCellCenter, background: '#e3f2fd', color: '#1565c0', borderBottom: '1px solid #90caf9', borderRight: '2px solid #90caf9'}}>
                    🌡️ สภาพแวดล้อม
                  </th>
                  <th colSpan={4} style={{...styles.tableHeadCellCenter, background: '#e8f5e9', color: '#2e7d32', borderBottom: '1px solid #a5d6a7', borderRight: '2px solid #a5d6a7'}}>
                    🌱 แปลง 1
                  </th>
                  <th colSpan={4} style={{...styles.tableHeadCellCenter, background: '#f1f8e9', color: '#558b2f', borderBottom: '1px solid #c5e1a5'}}>
                    🌿 แปลง 2
                  </th>
                </tr>
                {/* แถวที่ 2 — ชื่อรีเลย์ */}
                <tr>
                  {RELAY_COLS.map((col, i) => {
                    const bgMap = { env: '#e3f2fd', z1: '#e8f5e9', z2: '#f1f8e9' };
                    const borderRight = (i === 3 || i === 7) ? '2px solid #bbb' : '1px solid #ddd';
                    return (
                      <th key={col.key} style={{...styles.tableHeadCellCenter, background: bgMap[col.group], borderRight, fontSize: '10px'}}>
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody style={styles.tableBody}>
                {(filterMode === 'all' ? relayData : filterMode === 'daily' ? hourlyData.filter(d => d.type === 'relay') : filterMode === 'weekly' ? weeklyData.filter(d => d.type === 'relay') : monthlyData.filter(d => d.type === 'relay')).map((row, idx) => {
                  // Same _fresh logic as sensor rows: undefined = old data = treat as real
                  const isFresh = row._fresh !== false;
                  return (
                  <tr
                    key={idx}
                    style={{...styles.tableRow, ...(idx % 2 === 0 ? {} : styles.tableRowAlt)}}
                  >
                    <td style={{...styles.tableCell, borderRight: '2px solid #bbb'}}>{row.timestamp}</td>
                    {RELAY_COLS.map(col => renderRelayCell(row.data, col.key, isFresh))}
                  </tr>
                  );
                })}
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
          <form onSubmit={handlePageJump} style={styles.pageJumpForm}>
            <span style={styles.pageJumpLabel}>ไปหน้า</span>
            <input
              type="number"
              min={1}
              max={maxPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              placeholder="#"
              style={styles.pageJumpInput}
            />
            <button type="submit" style={styles.pageJumpBtn}>ไป</button>
          </form>
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
