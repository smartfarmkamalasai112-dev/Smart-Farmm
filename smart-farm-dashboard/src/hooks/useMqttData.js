import { useState, useEffect } from 'react';

export function useMqttData() {
  // State เก็บข้อมูล Sensor
  // 🎯 โหลดค่าเก่าจาก localStorage หรือใช้ค่าเริ่มต้นใหม่
  const getInitialSensorData = () => {
    try {
      const cached = localStorage.getItem('smartfarm_sensors');
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.error('Error loading cached sensor data:', e);
    }
    return {
      air: { temp: 0, hum: 0 },
      soil: { temp: 0, hum: 0, ph: 0, n: 0, p: 0, k: 0 },
      env: { lux: 0, co2: 0 }
    };
  };

  const getInitialControlStatus = () => {
    try {
      const cached = localStorage.getItem('smartfarm_control');
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.error('Error loading cached control status:', e);
    }
    return {
      mode: 'UNKNOWN',
      relays: [false, false, false, false],
      config: []
    };
  };

  const [data, setData] = useState(getInitialSensorData());
  const [controlStatus, setControlStatus] = useState(getInitialControlStatus());

  const [connectionStatus, setConnectionStatus] = useState('Connecting...');

  // 🎯 บันทึก Sensor Data ลง localStorage เมื่ออัปเดต
  useEffect(() => {
    try {
      localStorage.setItem('smartfarm_sensors', JSON.stringify(data));
    } catch (e) {
      console.error('Error saving sensor data to localStorage:', e);
    }
  }, [data]);

  // 🎯 บันทึก Control Status ลง localStorage เมื่ออัปเดต
  useEffect(() => {
    try {
      localStorage.setItem('smartfarm_control', JSON.stringify(controlStatus));
    } catch (e) {
      console.error('Error saving control status to localStorage:', e);
    }
  }, [controlStatus]);

  // --- 1. ระบบดึงข้อมูลอัตโนมัติ (Polling API) ---
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('Network response was not ok');
        
        const json = await res.json();
        
        // อัปเดต State
        if (isMounted) {
          if (json.sensors) setData(json.sensors);
          if (json.status) setControlStatus(json.status);
          setConnectionStatus('Connected (API)');
        }
      } catch (err) {
        console.error("API Fetch Error:", err);
        if (isMounted) setConnectionStatus('Error / Offline');
      }
    };

    // 🎯 ดึงข้อมูลทันทีเมื่อเปิดหน้า (ไม่รอ 1 วินาทีแรก)
    fetchData();
    
    // 🎯 Polling ด่วนในช่วงแรก (500ms) เพื่อโหลดข้อมูลเร็ว
    let fastInterval = setInterval(fetchData, 500);
    
    // หลังจาก 3 วินาที เปลี่ยนเป็น polling ปกติ (1000ms)
    const slowTimeout = setTimeout(() => {
      clearInterval(fastInterval);
      fastInterval = setInterval(fetchData, 1000);
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(fastInterval);
      clearTimeout(slowTimeout);
    };
  }, []);

  // --- 2. ฟังก์ชันส่งคำสั่ง ---
  const sendCommand = async (payload) => {
    try {
      if (payload.type === 'MODE') {
        await fetch('/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: payload.value })
        });
      } else if (payload.type === 'RELAY') {
        await fetch('/api/relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: payload.index, value: payload.value })
        });
      }
    } catch (err) {
      console.error("Send Command Error:", err);
    }
  };

  const sendConfig = async (index, rule) => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          index: index, 
          target: rule.target, 
          condition: rule.condition 
        })
      });
      // เอา Alert ออกแล้ว เปลี่ยนเป็น log แทน
      console.log(`Saved config for Relay ${index + 1}`);
    } catch (err) {
      console.error("Send Config Error:", err);
    }
  };

  return { 
    data, 
    controlStatus, 
    sendCommand, 
    sendConfig, 
    connectionStatus 
  };
}