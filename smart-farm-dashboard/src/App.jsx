import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
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
import DataTablePage from './pages/DataTablePage';
import GraphPage from './pages/GraphPage';

// ⚠️ CONFIGURATION: Flask backend URL
// Socket.IO connects directly to Flask on port 5000
// Auto-detect host so it works on both localhost and Tailscale/LAN access
const SOCKET_URL = `http://${window.location.hostname}:5000`;
const MAX_HISTORY_POINTS = 50;

// Relay indices that use dual-sensor AUTO mode (Fan=1 only)
const DUAL_SENSOR_RELAYS = [1];

// Sensor param labels/icons/units for display
const PARAM_INFO = {
  soil_hum:        { label: 'ดิน 2 แปลง 1 (SN-3002)',   unit: '%',   icon: '🌱' },
  soil_2_hum:      { label: 'ความชื้นดิน2',             unit: '%',   icon: '🌱' },
  soil_moisture_1: { label: 'ดิน 1 แปลง 1 (SN-300SD)', unit: '%',   icon: '🌱' },
  temp:       { label: 'อุณหภูมิ',       unit: '°C',  icon: '🌡️' },
  hum:        { label: 'ความชื้นอากาศ', unit: '%',   icon: '💧' },
  lux:        { label: 'แสง',           unit: 'lux', icon: '☀️' },
  co2:        { label: 'CO₂',           unit: 'ppm', icon: '🌫️' },
  s1_hum:     { label: 'ดิน S1',        unit: '%',   icon: '🌱' },
  s2_hum:     { label: 'ดิน S2',        unit: '%',   icon: '🌱' },
  s3_hum:     { label: 'ดิน S3',        unit: '%',   icon: '🌱' },
  s4_hum:     { label: 'ดิน S4',        unit: '%',   icon: '🌱' },
};
const getParamInfo = (param) => PARAM_INFO[param] || { label: param, unit: '', icon: '📡' };

// 🔒 Locked sensor mapping for valve relays (6-11) — ไม่อนุญาตให้เปลี่ยน sensor
const VALVE_SENSOR_LOCK = {
  6:  'soil_moisture_1',  // วาล์ว 1 แปลง 1 → ดิน 1 แปลง 1 (SN-300SD)
  7:  'soil_hum',         // วาล์ว 2 แปลง 1 → ดิน 2 แปลง 1 (SN-3002)
  8:  's2_hum',           // วาล์ว 3 แปลง 1 → ดิน 3 แปลง 1 (Node3 S2)
  9:  's3_hum',           // วาล์ว 1 แปลง 2 → ดิน 1 แปลง 2 (Node3 S3)
  10: 's1_hum',           // วาล์ว 2 แปลง 2 → ดิน 2 แปลง 2 (Node3 S1)
  11: 's4_hum',           // วาล์ว 3 แปลง 2 → ดิน 3 แปลง 2 (Node3 S4)
};

/**
 * Main Smart Farm Dashboard Component
 * Original Design - ออกแบบดั้งเดิม
 */

// Context for ESP32 sensor freshness — used by SensorCard and MetricCard
const SensorFreshContext = React.createContext(true);

const App = () => {
  // Connection state
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting', 'connected', 'disconnected', 'error'
  const [connectionMessage, setConnectionMessage] = useState('Connecting to server...');
  const socketRef = useRef(null);

  // ESP32 sensor freshness — separate tracking for each node
  const [node1Connected, setNode1Connected] = useState(false);  // Node 1: main sensors
  const [node3Connected, setNode3Connected] = useState(false);  // Node 3: Plot 2 soil
  const [lastNode1Update, setLastNode1Update] = useState(Date.now());
  const [lastNode3Update, setLastNode3Update] = useState(Date.now());
  
  // Delay banner: don't show ESP warning for first 4s after page load (cold-start)
  const [espReady, setEspReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEspReady(true), 4000); return () => clearTimeout(t); }, []);

  // Tab state
  const [activeTab, setActiveTab] = useState('monitor');

  // Sensor data state - matches backend structure exactly
  const [sensorData, setSensorData] = useState({
    air: { temp: 0.0, hum: 0.0 },
    soil_1: { hum: 0.0, ph: 0.0, n: 0.0, p: 0.0, k: 0.0 },
    soil_2: { hum: 0.0 },
    env: { lux: 0.0, co2: 0.0 }
  });

  // ⭐ NEW: Soil Sensors from Node 3
  const [soilSensors, setSoilSensors] = useState({
    soil_1: 0.0,
    soil_2: 0.0,
    soil_3: 0.0,
    soil_4: 0.0
  });

  // Status state
  const [statusData, setStatusData] = useState({
    mode: "MANUAL",
    relays: [false, false, false, false, false, false, false, false, false, false, false, false],
    last_update: null
  });

  // Relay modes - independent per relay (restore from localStorage if available)
  const [relayModes, setRelayModes] = useState(() => {
    try {
      const saved = localStorage.getItem('smartfarm_relay_modes');
      return saved ? JSON.parse(saved) : {
        0: 'MANUAL', // Pump
        1: 'MANUAL', // Fan
        2: 'MANUAL', // Lamp
        3: 'MANUAL', // Mist
        4: 'MANUAL', // Plot Pump 2
        5: 'MANUAL', // EvapPump
        6: 'MANUAL', // Valve1 P1
        7: 'MANUAL', // Valve2 P1
        8: 'MANUAL', // Valve3 P1
        9: 'MANUAL', // Valve1 P2
        10: 'MANUAL', // Valve2 P2
        11: 'MANUAL'  // Valve3 P2
      };
    } catch (e) {
      return {
        0: 'MANUAL', 1: 'MANUAL', 2: 'MANUAL', 3: 'MANUAL',
        4: 'MANUAL', 5: 'MANUAL', 6: 'MANUAL', 7: 'MANUAL',
        8: 'MANUAL', 9: 'MANUAL', 10: 'MANUAL', 11: 'MANUAL'
      };
    }
  });

  // Relay configurations for AUTO mode (restore from localStorage if available)
  const [relayConfigs, setRelayConfigs] = useState(() => {
    try {
      const saved = localStorage.getItem('smartfarm_relay_configs');
      return saved ? JSON.parse(saved) : {
        0: { target: 40, condition: '<', param: 'soil_hum' },
        1: { target1: 30, condition1: '>', param1: 'temp', target2: 80, condition2: '>', param2: 'hum' },
        2: { target: 200, condition: '<', param: 'lux' },
        3: { target: 60, condition: '<', param: 'soil_hum' },
        4: { target: 40, condition: '<', param: 'soil_hum' },
        5: { target: 40, condition: '<', param: 'soil_hum' },
        6: { target1: 30, condition1: '>', param1: 'temp', target2: 80, condition2: '>', param2: 'hum' },
        7: { target: 200, condition: '<', param: 'lux' },
        8: { target: 60, condition: '<', param: 'soil_hum' },
        9: { target1: 30, condition1: '>', param1: 'temp', target2: 80, condition2: '>', param2: 'hum' },
        10: { target: 200, condition: '<', param: 'lux' },
        11: { target: 60, condition: '<', param: 'soil_hum' }
      };
    } catch (e) {
      return {
        0: { target: 40, condition: '<', param: 'soil_hum' },
        1: { target1: 30, condition1: '>', param1: 'temp', target2: 80, condition2: '>', param2: 'hum', logic: 'OR' },
        2: { target: 200, condition: '<', param: 'lux' },
        3: { target: 60, condition: '<', param: 'soil_hum' },
        4: { target: 40, condition: '<', param: 'soil_hum' },
        5: { target: 40, condition: '<', param: 'soil_hum' },
        6: { target1: 30, condition1: '>', param1: 'temp', target2: 80, condition2: '>', param2: 'hum', logic: 'OR' },
        7: { target: 200, condition: '<', param: 'lux' },
        8: { target: 60, condition: '<', param: 'soil_hum' },
        9: { target1: 30, condition1: '>', param1: 'temp', target2: 80, condition2: '>', param2: 'hum', logic: 'OR' },
        10: { target: 200, condition: '<', param: 'lux' },
        11: { target: 60, condition: '<', param: 'soil_hum' }
      };
    }
  });

  // Graph history
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // AUTO activation modal state
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [pendingAutoRelayIndex, setPendingAutoRelayIndex] = useState(null);
  const [tempAutoConfig, setTempAutoConfig] = useState({});
  const [currentSensorValues, setCurrentSensorValues] = useState({});

  // ⭐ DISABLED: Removed aggressive sync loop that was causing slow loading
  // Syncing now only happens when user explicitly saves (via API calls in handlers)
  // useEffect(() => { ... }, [relayModes, relayConfigs]);

  // Update current sensor values when sensorData changes (real-time update in modal)
  useEffect(() => {
    if (showAutoModal && pendingAutoRelayIndex !== null) {
      // Helper function to get sensor value
      const getSensorValue = (param) => {
        switch(param) {
          case 'soil_hum':
            return sensorData.soil_1?.hum || 0;  // ดิน 2 แปลง 1 (SN-3002)
          case 'soil_moisture_1':
            return sensorData.soil_2?.hum || 0;  // ดิน 1 แปลง 1 (SN-300SD)
          case 'soil_2_hum':
            return sensorData.soil_2?.hum || 0;
          case 's1_hum':
            return typeof soilSensors.soil_1 === 'object' ? (soilSensors.soil_1?.hum || 0) : (soilSensors.soil_1 || 0);
          case 's2_hum':
            return typeof soilSensors.soil_2 === 'object' ? (soilSensors.soil_2?.hum || 0) : (soilSensors.soil_2 || 0);
          case 's3_hum':
            return typeof soilSensors.soil_3 === 'object' ? (soilSensors.soil_3?.hum || 0) : (soilSensors.soil_3 || 0);
          case 's4_hum':
            return typeof soilSensors.soil_4 === 'object' ? (soilSensors.soil_4?.hum || 0) : (soilSensors.soil_4 || 0);
          case 'temp':
            return sensorData.air?.temp || 0;
          case 'hum':
            return sensorData.air?.hum || 0;
          case 'lux':
            return sensorData.env?.lux || 0;
          case 'co2':
            return sensorData.env?.co2 || 0;
          default:
            return 0;
        }
      };

      // Update sensor values object - use tempAutoConfig for current modal values
      const newValues = {};
      const idx = pendingAutoRelayIndex;
      
      if (DUAL_SENSOR_RELAYS.includes(idx) || !!(relayConfigs[idx]?.target1)) {
        // Dual sensor - use tempAutoConfig values
        newValues[idx] = {
          current_value1: parseFloat((getSensorValue(tempAutoConfig.param1 || relayConfigs[idx]?.param1 || 'temp')).toFixed(2)),
          sensor1_name: tempAutoConfig.param1 || relayConfigs[idx]?.param1 || 'temp',
          current_value2: parseFloat((getSensorValue(tempAutoConfig.param2 || relayConfigs[idx]?.param2 || 'hum')).toFixed(2)),
          sensor2_name: tempAutoConfig.param2 || relayConfigs[idx]?.param2 || 'hum'
        };
      } else {
        // Single sensor - use tempAutoConfig values
        const param = tempAutoConfig.param || relayConfigs[idx]?.param || 'soil_hum';
        newValues[idx] = {
          current_value: parseFloat((getSensorValue(param)).toFixed(2)),
          sensor_name: param
        };
      }
      setCurrentSensorValues(newValues);
    }
  }, [sensorData, soilSensors, showAutoModal, pendingAutoRelayIndex, tempAutoConfig]);

  // ⭐ Monitor Node timeouts (30s) and set disconnected state
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Node 1 timeout check
      if (now - lastNode1Update > 30000 && node1Connected) {
        console.warn('⚠️ Node 1 timeout');
        setNode1Connected(false);
      }
      
      // Node 3 timeout check (90s - Node 3 reads 4 sensors slowly)
      if (now - lastNode3Update > 90000 && node3Connected) {
        console.warn('⚠️ Node 3 timeout');
        setNode3Connected(false);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lastNode1Update, lastNode3Update, node1Connected, node3Connected]);

  // Initialize SocketIO connection
  useEffect(() => {
    console.log('🔌 Attempting to connect to:', SOCKET_URL || 'current origin (dev mode)');
    setConnectionStatus('connecting');
    setConnectionMessage('Connecting to server...');
    
    // Socket.IO connection options
    const socketOptions = {
      transports: ['polling', 'websocket'],  // Try polling first (more reliable), then websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      forceNew: true,
      rejectUnauthorized: false,
      path: '/socket.io/'
    };
    
    // In dev mode (SOCKET_URL is empty), connect to current origin with path
    // Vite proxy will intercept /socket.io requests and forward to backend
    const socket = SOCKET_URL 
      ? io(SOCKET_URL, socketOptions)
      : io(socketOptions);

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected to Server');
      setConnected(true);
      setConnectionStatus('connected');
      setConnectionMessage('Connected to server');
      setError(null);
      setLoading(false);
      
      // Auto-dismiss connection message after 3 seconds
      const messageTimer = setTimeout(() => {
        setConnectionMessage('');
      }, 3000);
      
      // Fetch initial status from backend to sync UI with actual relay states
      console.log('📥 Fetching initial status from backend...');
      fetch(`${SOCKET_URL}/api/status`)
        .then(res => res.json())
        .then(data => {
          console.log('📥 Initial status received:', data);
          setStatusData({
            mode: data.mode || "MANUAL",
            relays: data.relays || [false, false, false, false],
            last_update: data.last_update || new Date().toISOString()
          });
          // ⭐ Set ESP freshness immediately from status (no need to wait for socket event)
          if (typeof data.sensor_fresh === 'boolean') {
            setNode1Connected(data.sensor_fresh);
            setLastNode1Update(Date.now());
          }
        })
        .catch(err => console.error('❌ Failed to fetch initial status:', err));
      
      // Fetch initial relay modes
      console.log('📥 Fetching initial relay modes...');
      fetch(`${SOCKET_URL}/api/relay-modes`)
        .then(res => res.json())
        .then(data => {
          console.log('📥 Initial relay modes received:', data);
          const modesObj = {};
          Object.keys(data).forEach(key => {
            modesObj[parseInt(key)] = data[key];
          });
          setRelayModes(modesObj);
          // Also save to localStorage for persistence
          localStorage.setItem('smartfarm_relay_modes', JSON.stringify(modesObj));
        })
        .catch(err => console.error('❌ Failed to fetch initial relay modes:', err));
      
      // Fetch initial relay configs
      console.log('📥 Fetching initial relay configs...');
      fetch(`${SOCKET_URL}/api/relay-configs`)
        .then(res => res.json())
        .then(data => {
          console.log('📥 Initial relay configs received:', data);
          const configsObj = {};
          Object.keys(data).forEach(key => {
            configsObj[parseInt(key)] = data[key];
          });
          setRelayConfigs(configsObj);
          // Also save to localStorage for persistence
          localStorage.setItem('smartfarm_relay_configs', JSON.stringify(configsObj));
        })
        .catch(err => console.error('❌ Failed to fetch initial relay configs:', err));
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from Server:', reason);
      setConnected(false);
      setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        setConnectionMessage('Server disconnected. Reconnecting...');
      } else if (reason === 'io client namespace disconnect') {
        setConnectionMessage('Namespace disconnected. Reconnecting...');
      } else {
        setConnectionMessage('Disconnected from server. Attempting to reconnect...');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('🔥 Connection Error:', error);
      setConnectionStatus('error');
      setConnectionMessage(`Connection Error: ${error.message || 'Unable to connect to server'}`);
      setError(`Connection Error: ${error.message}`);
    });

    socket.on('reconnect_attempt', () => {
      console.log('🔄 Attempting to reconnect...');
      setConnectionStatus('connecting');
      setConnectionMessage('Reconnecting to server...');
    });

    socket.on('reconnect', () => {
      console.log('✅ Reconnected to server');
      setConnectionStatus('connected');
      setConnectionMessage('Reconnected to server');
      
      // Auto-dismiss reconnection message after 3 seconds
      const messageTimer = setTimeout(() => {
        setConnectionMessage('');
      }, 3000);
    });

    socket.on('reconnect_error', (error) => {
      console.error('🔥 Reconnection Error:', error);
      setConnectionStatus('error');
      setConnectionMessage('Reconnection failed. Retrying...');
    });

    // Sensor data real-time update (zero latency)
    socket.on('sensor_update', (newData) => {
      console.log('📡 Sensor Update:', newData);

      // Update Node 1 freshness flag
      setNode1Connected(newData._fresh !== false);
      setLastNode1Update(Date.now());
      
      // Validate and update sensor data with fallbacks
      setSensorData(prev => ({
        air: {
          temp: newData.air?.temp ?? prev.air.temp,
          hum: newData.air?.hum ?? prev.air.hum
        },
        soil_1: {
          hum: newData.soil_1?.hum ?? prev.soil_1.hum,
          ph: newData.soil_1?.ph ?? prev.soil_1.ph,
          n: newData.soil_1?.n ?? prev.soil_1.n,
          p: newData.soil_1?.p ?? prev.soil_1.p,
          k: newData.soil_1?.k ?? prev.soil_1.k
        },
        soil_2: {
          hum: newData.soil_2?.hum ?? prev.soil_2.hum
        },
        env: {
          lux: newData.env?.lux ?? prev.env.lux,
          co2: newData.env?.co2 ?? prev.env.co2
        }
      }));

      // Add point to graph
      setHistory(prevHistory => {
        const newPoint = {
          time: new Date().toLocaleTimeString('en-US'),
          temp: newData.air?.temp ?? 0,
          hum: newData.air?.hum ?? 0,
          soil_1_hum: newData.soil_1?.hum ?? 0,
          soil_2_hum: newData.soil_2?.hum ?? 0
        };

        const updated = [...prevHistory, newPoint];
        // Keep only last MAX_HISTORY_POINTS
        if (updated.length > MAX_HISTORY_POINTS) {
          updated.shift();
        }
        return updated;
      });
    });

    // ⭐ NEW: Soil Sensors from Node 3 (real-time update)
    socket.on('soil_sensors_update', (newSoilData) => {
      console.log('🌱 Soil Sensors Update:', newSoilData);
      setNode3Connected(true);
      setLastNode3Update(Date.now());
      setSoilSensors(prev => ({
        soil_1: newSoilData.soil_1 ?? prev.soil_1,
        soil_2: newSoilData.soil_2 ?? prev.soil_2,
        soil_3: newSoilData.soil_3 ?? prev.soil_3,
        soil_4: newSoilData.soil_4 ?? prev.soil_4
      }));
    });

    // Relay status update
    socket.on('status_update', (newStatus) => {
      console.log('💡 Status Update:', newStatus);
      setStatusData(prev => ({
        mode: newStatus.mode ?? prev.mode,
        relays: newStatus.relays ?? prev.relays,
        last_update: newStatus.last_update ?? new Date().toISOString()
      }));
      
      // ⭐ Update Node 1 connected state from status_update's sensor_fresh field
      if (typeof newStatus.sensor_fresh === 'boolean') {
        setNode1Connected(newStatus.sensor_fresh);
        setLastNode1Update(Date.now());
      }

      // Update relay modes if received from backend
      if (newStatus.relay_modes) {
        console.log('📋 Relay Modes Updated:', newStatus.relay_modes);
        setRelayModes(newStatus.relay_modes);
      }
    });

    // ⚡ REAL-TIME: relay_update fires instantly when ONE relay changes (faster than status_update)
    socket.on('relay_update', (data) => {
      const { relay_index, state, mode } = data;
      console.log(`⚡ Relay Update: relay_${relay_index} = ${state} (${mode})`);
      // Update single relay state immediately
      setStatusData(prev => {
        const newRelays = [...prev.relays];
        newRelays[relay_index] = state;
        return { ...prev, relays: newRelays };
      });
      // Update mode if provided
      if (mode) {
        setRelayModes(prev => ({ ...prev, [relay_index]: mode }));
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('reconnect_attempt');
      socket.off('reconnect');
      socket.off('reconnect_error');
      socket.off('sensor_update');
      socket.off('soil_sensors_update');
      socket.off('status_update');
      socket.off('relay_update');
      socket.close();
    };
  }, []);

  /**
   * Toggle relay state via REST API
   * @param {number} index - Relay index (0-11)
   */
  const toggleRelay = (index) => {
    try {
      const currentState = statusData.relays[index];
      const newState = !currentState;
      
      console.log(`🔘 [RELAY ${index}] Toggle requested: ${currentState} → ${newState}`);

      // Check connection status before sending
      if (!connected) {
        setError('Cannot control relay: Server connection lost. Please wait for reconnection.');
        console.warn('❌ Cannot send command, server not connected');
        return;
      }

      // Send to backend
      fetch(`${SOCKET_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index: index,
          state: newState
        })
      })
      .then(res => res.json())
      .then(data => {
        console.log(`✅ [RELAY ${index}] Response:`, data);
        // Update UI with response
        setStatusData(prev => {
          const newRelays = [...prev.relays];
          newRelays[index] = data.value;
          return { ...prev, relays: newRelays };
        });
      })
      .catch(err => {
        console.error(`❌ [RELAY ${index}] Error:`, err);
        setError(`Error: ${err.message}`);
      });
    } catch (err) {
      console.error('❌ Relay Toggle Error:', err);
      setError(`Control Error: ${err.message}`);
    }
  };

  /**
   * Change relay mode (MANUAL/AUTO)
   */
  const changeRelayMode = async (index, mode) => {
    const newModes = { ...relayModes, [index]: mode };
    setRelayModes(newModes);
    
    // Explicitly save to localStorage immediately
    try {
      localStorage.setItem('smartfarm_relay_modes', JSON.stringify(newModes));
      console.log(`💾 Saved relay mode to localStorage - Relay ${index} → ${mode}`);
    } catch (e) {
      console.warn(`⚠️ Failed to save mode to localStorage:`, e);
    }
    
    // Send mode change to backend
    try {
      const response = await fetch(`${SOCKET_URL}/api/relay-modes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index: index,
          mode: mode
        })
      });
      
      if (response.ok) {
        const relayNames = ['Pump', 'Fan', 'Lamp', 'Mist', 'Plot Pump 2', 'EvapPump', 'Valve1 P1', 'Valve2 P1', 'Valve3 P1', 'Valve1 P2', 'Valve2 P2', 'Valve3 P2'];
        console.log(`✅ Relay ${index} (${relayNames[index]}) mode changed to ${mode}`);
      } else {
        console.error('❌ Failed to change relay mode');
      }
    } catch (error) {
      console.error('❌ Error changing relay mode:', error);
    }
  };

  // Handle clicking AUTO button - if already AUTO → switch to MANUAL, else open config modal
  const handleAutoClick = (index) => {
    if (relayModes[index] === 'AUTO') {
      changeRelayMode(index, 'MANUAL');
      return;
    }
    const currentConfig = relayConfigs[index] || {};
    // 🔒 ถ้าเป็น valve relay (6-11) ให้ lock sensor ตายตัว
    const lockedParam = VALVE_SENSOR_LOCK[index];
    setTempAutoConfig({
      param1: currentConfig.param1 || 'temp',
      condition1: currentConfig.condition1 || '>',
      target1: currentConfig.target1 != null ? String(currentConfig.target1) : '30',
      logic: currentConfig.logic || '&&',
      param2: currentConfig.param2 || 'hum',
      condition2: currentConfig.condition2 || '>',
      target2: currentConfig.target2 != null ? String(currentConfig.target2) : '80',
      param: lockedParam || currentConfig.param || 'soil_hum',
      condition: currentConfig.condition || '<',
      target: currentConfig.target != null ? String(currentConfig.target) : '50',
    });
    setPendingAutoRelayIndex(index);
    setShowAutoModal(true);
  };

  // Handle saving config and activating AUTO
  const handleSaveAndActivateAuto = async () => {
    if (pendingAutoRelayIndex !== null) {
      try {
        console.log(`🔍 [Relay ${pendingAutoRelayIndex}] Sending config from App.jsx:`, tempAutoConfig);
        
        // Build clean config (dual or single) — avoid sending mixed fields
        const isDual = DUAL_SENSOR_RELAYS.includes(pendingAutoRelayIndex) || !!(relayConfigs[pendingAutoRelayIndex]?.target1);
        const cleanConfig = isDual ? {
          index: pendingAutoRelayIndex,
          param1: tempAutoConfig.param1,
          condition1: tempAutoConfig.condition1,
          target1: parseFloat(tempAutoConfig.target1) || 0,
          param2: tempAutoConfig.param2,
          condition2: tempAutoConfig.condition2,
          target2: parseFloat(tempAutoConfig.target2) || 0,
          logic: tempAutoConfig.logic || 'OR'
        } : {
          index: pendingAutoRelayIndex,
          param: tempAutoConfig.param,
          condition: tempAutoConfig.condition,
          target: parseFloat(tempAutoConfig.target) || 0
        };

        // First save the config to backend
        const configResponse = await fetch(`${SOCKET_URL}/api/relay-configs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanConfig)
        });
        
        if (!configResponse.ok) {
          const errText = await configResponse.text();
          throw new Error(`Failed to save config: ${errText}`);
        }
        
        console.log(`✅ Config saved for relay ${pendingAutoRelayIndex}:`, tempAutoConfig);
        
        // Update local relayConfigs with clean config only (no mixed dual/single fields)
        setRelayConfigs({
          ...relayConfigs,
          [pendingAutoRelayIndex]: cleanConfig
        });
        
        // Then activate AUTO mode
        await changeRelayMode(pendingAutoRelayIndex, 'AUTO');
        
        // Close modal and reset states
        setShowAutoModal(false);
        setPendingAutoRelayIndex(null);
        setTempAutoConfig({});
      } catch (error) {
        console.error('❌ Error saving config:', error);
        alert('Failed to save configuration. Please try again.');
      }
    }
  };

  // Handle canceling config modal - Ensure relay stays in MANUAL mode
  const handleCancelAutoModal = () => {
    // Make absolutely sure relay stays in MANUAL mode when canceled
    if (pendingAutoRelayIndex !== null && relayModes[pendingAutoRelayIndex] !== 'MANUAL') {
      console.log(`🚫 Cancel clicked - Keeping Relay ${pendingAutoRelayIndex} in MANUAL mode`);
      changeRelayMode(pendingAutoRelayIndex, 'MANUAL');
    }
    
    setShowAutoModal(false);
    setPendingAutoRelayIndex(null);
    setTempAutoConfig({});
  };

  /**
   * Get current sensor value for a parameter
   */
  const getCurrentSensorValue = (param) => {
    if (param === 'soil_hum') {
      return (sensorData.soil_1?.hum || 0).toFixed(1);  // ดิน 2 แปลง 1 (SN-3002)
    } else if (param === 'soil_moisture_1') {
      return (sensorData.soil_2?.hum || 0).toFixed(1);  // ดิน 1 แปลง 1 (SN-300SD)
    } else if (param === 'soil_2_hum') {
      return (sensorData.soil_2?.hum || 0).toFixed(1);
    } else if (param === 'temp') {
      return sensorData.air?.temp?.toFixed(1) || '-';
    } else if (param === 'hum') {
      return sensorData.air?.hum?.toFixed(1) || '-';
    } else if (param === 'lux') {
      return sensorData.env?.lux?.toFixed(1) || '-';
    } else if (param === 'co2') {
      return sensorData.env?.co2?.toFixed(0) || '-';
    } else if (param === 's1_hum') {
      const v = typeof soilSensors.soil_1 === 'object' ? (soilSensors.soil_1?.hum || 0) : (soilSensors.soil_1 || 0);
      return Number(v).toFixed(1);
    } else if (param === 's2_hum') {
      const v = typeof soilSensors.soil_2 === 'object' ? (soilSensors.soil_2?.hum || 0) : (soilSensors.soil_2 || 0);
      return Number(v).toFixed(1);
    } else if (param === 's3_hum') {
      const v = typeof soilSensors.soil_3 === 'object' ? (soilSensors.soil_3?.hum || 0) : (soilSensors.soil_3 || 0);
      return Number(v).toFixed(1);
    } else if (param === 's4_hum') {
      const v = typeof soilSensors.soil_4 === 'object' ? (soilSensors.soil_4?.hum || 0) : (soilSensors.soil_4 || 0);
      return Number(v).toFixed(1);
    }
    return '-';
  };

  const relayNames = ['💧 ปั้มแปลง1 (Pump)', '🌀 พัดลม (Fan)', '💡 ไฟส่อง (Lamp)', '🌫️ พ่นหมอก (Mist)', '💨 ปั้มแปลง2 (Pump 2)', '🔄 ปั้ม Evap', '🚰 วาล์ว1 (Plot1)', '🚰 วาล์ว2 (Plot1)', '🚰 วาล์ว3 (Plot1)', '🚰 วาล์ว1 (Plot2)', '🚰 วาล์ว2 (Plot2)', '🚰 วาล์ว3 (Plot2)'];

  return (
    <div style={styles.container}>
      {/* Connection Status Indicator */}
      {connectionMessage && (
        <div style={{
          ...styles.connectionIndicator,
          backgroundColor: connectionStatus === 'connected' ? '#4caf50' : 
                          connectionStatus === 'connecting' ? '#ff9800' :
                          connectionStatus === 'error' ? '#f44336' : '#9e9e9e',
          animation: connectionStatus !== 'connected' ? 'pulse 1s infinite' : 'none'
        }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'white' }}>
            {connectionMessage}
          </span>
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>🌱 Smart Farm Dashboard</h1>
        <div style={{
          ...styles.statusBadge,
          backgroundColor: connected ? '#4caf50' : '#f44336'
        }}>
          <span style={styles.statusDot}></span>
          {connected ? 'ONLINE 🟢' : 'OFFLINE 🔴'}
        </div>
      </header>

      {/* Tab Navigation */}
      <div style={styles.tabNav}>
        <button
          onClick={() => setActiveTab('monitor')}
          style={{
            ...styles.tabButton,
            ...( activeTab === 'monitor' ? styles.tabButtonActive : styles.tabButtonInactive)
          }}
        >
          📊 Monitor (ติดตามสถานะ)
        </button>
        <button
          onClick={() => setActiveTab('control')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'control' ? styles.tabButtonActive : styles.tabButtonInactive)
          }}
        >
          🎮 Control (ควบคุม)
        </button>
        <button
          onClick={() => setActiveTab('data')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'data' ? styles.tabButtonActive : styles.tabButtonInactive)
          }}
        >
          📈 Data (ตารางข้อมูล)
        </button>
        <button
          onClick={() => setActiveTab('graph')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'graph' ? styles.tabButtonActive : styles.tabButtonInactive)
          }}
        >
          📊 Graph (กราฟ)
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={styles.errorBox}>
          ⚠️ {error}
        </div>
      )}

      {/* MONITOR TAB */}
      {activeTab === 'monitor' && (
        <SensorFreshContext.Provider value={node1Connected}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', background: '#f4f6f8', padding: '20px', borderRadius: '12px' }}>

          {/* ===== Banner: Node 1 ไม่ตอบสนอง ===== */}
          {espReady && !node1Connected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#ffebee', border: '1px solid #ef5350', borderRadius: '10px', padding: '12px 18px', color: '#c62828' }}>
              <span style={{ fontSize: '22px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Node 1 ไม่ตอบสนอง</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>เซนเซอร์อากาศและดินแปลง 1 ไม่มีสัญญาณ กรุณาตรวจสอบการเชื่อมต่อ ESP32 Node 1</div>
              </div>
            </div>
          )}

          {/* ===== Banner: Node 3 ไม่ตอบสนอง ===== */}
          {espReady && !node3Connected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff3e0', border: '1px solid #fb8c00', borderRadius: '10px', padding: '12px 18px', color: '#e65100' }}>
              <span style={{ fontSize: '22px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Node 3 (แปลง 2) ไม่ตอบสนอง</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>เซนเซอร์ดินแปลง 2 ไม่มีสัญญาณ กรุณาตรวจสอบการเชื่อมต่อ ESP32 Node 3</div>
              </div>
            </div>
          )}

          {/* ===== ZONE 1: โรงเรือน ===== */}
          <div style={{ border: '1px solid #e0e0e0', background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#2c3e50', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ecf0f1', paddingBottom: '12px' }}>
              🏠 โซนโรงเรือน
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              <SensorCard title="🌡️ Temperature"   value={sensorData.air.temp}  unit="°C"  color="#e67e22" />
              <SensorCard title="💧 Air Humidity"   value={sensorData.air.hum}   unit="%"   color="#3498db" />
              <SensorCard title="☀️ Light (Lux)"    value={sensorData.env.lux}   unit="lx"  color="#f1c40f" textColor="#333" />
              <SensorCard title="💨 CO₂ Level"      value={sensorData.env.co2}   unit="ppm" color="#1abc9c" />
            </div>
          </div>

          {/* ===== ZONE 2: แปลง 1 ===== */}
          <div style={{ border: '1px solid #e0e0e0', background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#5d4037', fontSize: '18px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🌱 โซนแปลง 1
              <span style={{ fontSize: '11px', fontWeight: 'normal', background: '#efebe9', padding: '2px 8px', borderRadius: '10px', color: '#795548' }}>Node 1</span>
            </h3>
            <p style={{ color: '#8d6e63', fontSize: '12px', marginBottom: '16px' }}>ความชื้นดิน · ค่า pH · ธาตุอาหาร NPK</p>

            <p style={{ color: '#6d4c41', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px', borderBottom: '1px solid #efebe9', paddingBottom: '6px' }}>💧 ความชื้นดิน</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <SensorCard title="💧 Sensor ดิน 1 แปลง 1"     value={sensorData.soil_2.hum}  unit="%" color="#bcaaa4" textColor="#333"/>
              <SensorCard title="💧 Sensor ดิน 2 แปลง 1"     value={sensorData.soil_1.hum}  unit="%" color="#a1887f" />
              <SensorCard title="💧 Sensor ดิน 3 แปลง 1"     value={typeof soilSensors.soil_2 === 'object' ? soilSensors.soil_2?.hum ?? 0.0 : soilSensors.soil_2 ?? 0.0} unit="%" color="#d7ccc8" textColor="#333"/>
            </div>

            <p style={{ color: '#6d4c41', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px', borderBottom: '1px solid #efebe9', paddingBottom: '6px' }}>🧪 ธาตุอาหารและค่าความเป็นกรด-ด่าง</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <MetricCard title="🧫 ค่า pH ดิน แปลง 1"      value={sensorData.soil_1.ph}   unit=""      color="#9b59b6" />
              <MetricCard title="🌿 ไนโตรเจน (N) แปลง 1"    value={sensorData.soil_1.n}    unit="mg/kg" color="#27ae60" />
              <MetricCard title="🔴 ฟอสฟอรัส (P) แปลง 1"    value={sensorData.soil_1.p}    unit="mg/kg" color="#d35400" />
              <MetricCard title="🟡 โพแทสเซียม (K) แปลง 1"  value={sensorData.soil_1.k}    unit="mg/kg" color="#f39c12" textColor="#333" />
            </div>
          </div>

          {/* ===== ZONE 3: แปลง 2 ===== */}
          <div style={{ border: '1px solid #e0e0e0', background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#2e7d32', fontSize: '18px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🌿 โซนแปลง 2
              <span style={{ fontSize: '11px', fontWeight: 'normal', background: '#e8f5e9', padding: '2px 8px', borderRadius: '10px', color: '#388e3c' }}>Node 3</span>
            </h3>
            <p style={{ color: '#4caf50', fontSize: '12px', marginBottom: '16px' }}>ความชื้นดิน · ค่า pH · ธาตุอาหาร NPK</p>

            <p style={{ color: '#388e3c', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px', borderBottom: '1px solid #e8f5e9', paddingBottom: '6px' }}>💧 ความชื้นดิน</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <SensorCard title="💧 Sensor ดิน 1 แปลง 2" value={typeof soilSensors.soil_3 === 'object' ? soilSensors.soil_3?.hum ?? 0.0 : soilSensors.soil_3 ?? 0.0} unit="%" color="#81c784" textColor="#333"/>
              <SensorCard title="💧 Sensor ดิน 2 แปลง 2" value={typeof soilSensors.soil_1 === 'object' ? soilSensors.soil_1?.hum ?? 0.0 : soilSensors.soil_1 ?? 0.0} unit="%" color="#66bb6a" />
              <SensorCard title="💧 Sensor ดิน 3 แปลง 2" value={typeof soilSensors.soil_4 === 'object' ? soilSensors.soil_4?.hum ?? 0.0 : soilSensors.soil_4 ?? 0.0} unit="%" color="#a5d6a7" textColor="#333"/>
            </div>

            <p style={{ color: '#388e3c', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px', borderBottom: '1px solid #e8f5e9', paddingBottom: '6px' }}>🧪 ธาตุอาหารและค่าความเป็นกรด-ด่าง</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <MetricCard title="🧫 ค่า pH ดิน แปลง 2"      value={typeof soilSensors.soil_1 === 'object' ? soilSensors.soil_1?.ph ?? 0.0 : 0.0}  unit=""      color="#8e44ad" />
              <MetricCard title="🌿 ไนโตรเจน (N) แปลง 2"    value={typeof soilSensors.soil_1 === 'object' ? soilSensors.soil_1?.n ?? 0 : 0}        unit="mg/kg" color="#27ae60" />
              <MetricCard title="🔴 ฟอสฟอรัส (P) แปลง 2"    value={typeof soilSensors.soil_1 === 'object' ? soilSensors.soil_1?.p ?? 0 : 0}        unit="mg/kg" color="#d35400" />
              <MetricCard title="🟡 โพแทสเซียม (K) แปลง 2"  value={typeof soilSensors.soil_1 === 'object' ? soilSensors.soil_1?.k ?? 0 : 0}        unit="mg/kg" color="#f39c12" textColor="#333" />
            </div>
          </div>

        </div>
        </SensorFreshContext.Provider>
      )}

      {/* CONTROL TAB */}
      {activeTab === 'control' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Banner: Node 1 ไม่ตอบสนอง (สำหรับควบคุม) */}
          {espReady && !node1Connected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffebee', border: '1px solid #ef5350', borderRadius: '8px', padding: '10px 16px', color: '#c62828' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Node 1 ไม่ตอบสนอง</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>สถานะรีเลย์ที่แสดงคือ <strong>สถานะล่าสุดที่บันทึกไว้</strong> — อาจไม่ตรงกับสถานะจริงของอุปกรณ์</div>
              </div>
            </div>
          )}

          {/* Zone: โรงเรือน */}
          <div style={{ border: '1px solid #e0e0e0', background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#2c3e50', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ecf0f1', paddingBottom: '12px' }}>
              🏠 โซนโรงเรือน
            </h3>
            <div style={styles.relayCardsContainer}>
              {[1, 3, 5, 2].map((index) => (
                <RelayCard
                  key={index}
                  index={index}
                  relayNames={relayNames}
                  relayModes={relayModes}
                  statusData={statusData}
                  changeRelayMode={changeRelayMode}
                  handleAutoClick={handleAutoClick}
                  toggleRelay={toggleRelay}
                  relayConfigs={relayConfigs}
                  espConnected={node1Connected}
                />
              ))}
            </div>
          </div>

          {/* Zone: แปลง 1 */}
          <div style={{ border: '1px solid #e0e0e0', background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#5d4037', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ecf0f1', paddingBottom: '12px' }}>
              🌱 โซนแปลง 1
            </h3>
            <div style={styles.relayCardsContainer}>
              {[0, 6, 7, 8].map((index) => (
                <RelayCard
                  key={index}
                  index={index}
                  relayNames={relayNames}
                  relayModes={relayModes}
                  statusData={statusData}
                  changeRelayMode={changeRelayMode}
                  handleAutoClick={handleAutoClick}
                  toggleRelay={toggleRelay}
                  relayConfigs={relayConfigs}
                  espConnected={node1Connected}
                />
              ))}
            </div>
          </div>

          {/* Zone: แปลง 2 */}
          <div style={{ border: '1px solid #e0e0e0', background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ color: '#2e7d32', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ecf0f1', paddingBottom: '12px' }}>
              🌿 โซนแปลง 2
            </h3>
            <div style={styles.relayCardsContainer}>
              {[4, 9, 10, 11].map((index) => (
                <RelayCard
                  key={index}
                  index={index}
                  relayNames={relayNames}
                  relayModes={relayModes}
                  statusData={statusData}
                  changeRelayMode={changeRelayMode}
                  handleAutoClick={handleAutoClick}
                  toggleRelay={toggleRelay}
                  relayConfigs={relayConfigs}
                  espConnected={node1Connected}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUTO MODE CONFIG MODAL */}
      {showAutoModal && pendingAutoRelayIndex !== null && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>⚙️ ตั้งค่าโหมดอัตโนมัติ</h2>
            <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px', fontSize: '14px' }}>
              รีเลย์: <strong>{relayNames[pendingAutoRelayIndex]}</strong>
            </p>

            {/* Current Sensor Values Display */}
            {currentSensorValues[pendingAutoRelayIndex] && (
              (DUAL_SENSOR_RELAYS.includes(pendingAutoRelayIndex) || !!(relayConfigs[pendingAutoRelayIndex]?.target1)) ? (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { val: currentSensorValues[pendingAutoRelayIndex]?.current_value1, param: currentSensorValues[pendingAutoRelayIndex]?.sensor1_name },
                    { val: currentSensorValues[pendingAutoRelayIndex]?.current_value2, param: currentSensorValues[pendingAutoRelayIndex]?.sensor2_name }
                  ].map((s, i) => {
                    const info = getParamInfo(s.param);
                    return (
                      <div key={i} style={{ flex: 1, background: '#e3f2fd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px' }}>{info.icon}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{info.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1565c0' }}>
                          {s.val ?? '-'} <span style={{ fontSize: '11px' }}>{info.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background: '#e3f2fd', borderRadius: '8px', padding: '12px', textAlign: 'center', marginBottom: '16px' }}>
                  {(() => {
                    const info = getParamInfo(currentSensorValues[pendingAutoRelayIndex]?.sensor_name);
                    return (
                      <>
                        <div style={{ fontSize: '24px' }}>{info.icon}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{info.label}</div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#1565c0' }}>
                          {currentSensorValues[pendingAutoRelayIndex]?.current_value ?? '-'}
                          <span style={{ fontSize: '13px' }}> {info.unit}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )
            )}

            {(DUAL_SENSOR_RELAYS.includes(pendingAutoRelayIndex) || !!(relayConfigs[pendingAutoRelayIndex]?.target1)) ? (
              // Fan: Dual sensor config
              <>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={styles.label}>เซ็นเซอร์ 1</label>
                    <select style={styles.input} value={tempAutoConfig.param1 || 'temp'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, param1: e.target.value })}>
                      <option value="temp">🌡️ อุณหภูมิ (°C)</option>
                      <option value="hum">💨 ความชื้นอากาศ (%)</option>
                      <option value="lux">☀️ แสง (lx)</option>
                      <option value="co2">🌬️ CO₂ (ppm)</option>
                    </select>
                  </div>
                  <div style={{ flex: 0.7, minWidth: '100px' }}>
                    <label style={styles.label}>เงื่อนไข</label>
                    <select style={styles.input} value={tempAutoConfig.condition1 || '>'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, condition1: e.target.value })}>
                      <option value=">">&gt; มากกว่า</option>
                      <option value="<">&lt; น้อยกว่า</option>
                    </select>
                  </div>
                  <div style={{ flex: 0.7, minWidth: '80px' }}>
                    <label style={styles.label}>ค่า</label>
                    <input type="number" style={styles.input} value={tempAutoConfig.target1 ?? ''} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, target1: e.target.value })} />
                  </div>
                </div>
                <div style={{ textAlign: 'center', margin: '8px 0' }}>
                  <select style={{ ...styles.input, width: 'auto', padding: '8px 16px', fontWeight: 'bold' }} value={tempAutoConfig.logic || '&&'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, logic: e.target.value })}>
                    <option value="&&">AND (และ)</option>
                    <option value="||">OR (หรือ)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={styles.label}>เซ็นเซอร์ 2</label>
                    <select style={styles.input} value={tempAutoConfig.param2 || 'hum'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, param2: e.target.value })}>
                      <option value="temp">🌡️ อุณหภูมิ (°C)</option>
                      <option value="hum">💨 ความชื้นอากาศ (%)</option>
                      <option value="lux">☀️ แสง (lx)</option>
                      <option value="co2">🌬️ CO₂ (ppm)</option>
                    </select>
                  </div>
                  <div style={{ flex: 0.7, minWidth: '100px' }}>
                    <label style={styles.label}>เงื่อนไข</label>
                    <select style={styles.input} value={tempAutoConfig.condition2 || '>'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, condition2: e.target.value })}>
                      <option value=">">&gt; มากกว่า</option>
                      <option value="<">&lt; น้อยกว่า</option>
                    </select>
                  </div>
                  <div style={{ flex: 0.7, minWidth: '80px' }}>
                    <label style={styles.label}>ค่า</label>
                    <input type="number" style={styles.input} value={tempAutoConfig.target2 ?? ''} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, target2: e.target.value })} />
                  </div>
                </div>
                <div style={styles.conditionPreview}>
                  เปิดเมื่อ: ({tempAutoConfig.param1} {tempAutoConfig.condition1} {tempAutoConfig.target1}) {tempAutoConfig.logic} ({tempAutoConfig.param2} {tempAutoConfig.condition2} {tempAutoConfig.target2})
                </div>
              </>
            ) : (
              // Single sensor config
              <>
                <div style={styles.formGroup}>
                  <label style={styles.label}>เซ็นเซอร์</label>
                  {VALVE_SENSOR_LOCK[pendingAutoRelayIndex] ? (
                    // 🔒 Locked: valve relay ใช้ sensor ตายตัว
                    <div style={{ ...styles.input, background: '#f5f5f5', color: '#555', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'not-allowed', userSelect: 'none' }}>
                      <span>🔒</span>
                      <span style={{ fontWeight: 'bold' }}>{getParamInfo(VALVE_SENSOR_LOCK[pendingAutoRelayIndex]).icon} {getParamInfo(VALVE_SENSOR_LOCK[pendingAutoRelayIndex]).label}</span>
                      <span style={{ fontSize: '11px', color: '#999', marginLeft: 'auto' }}>ล็อคอัตโนมัติ</span>
                    </div>
                  ) : (
                    <select style={styles.input} value={tempAutoConfig.param || 'temp'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, param: e.target.value })}>
                      <option value="temp">🌡️ อุณหภูมิ (°C)</option>
                      <option value="hum">💨 ความชื้นอากาศ (%)</option>
                      <option value="lux">☀️ แสง (lx)</option>
                      <option value="co2">🌬️ CO₂ (ppm)</option>
                    </select>
                  )}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>เงื่อนไข</label>
                  <select style={styles.input} value={tempAutoConfig.condition || '<'} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, condition: e.target.value })}>
                    <option value=">">&gt; มากกว่า</option>
                    <option value="<">&lt; น้อยกว่า</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>ค่า</label>
                  <input type="number" style={styles.input} value={tempAutoConfig.target ?? ''} onChange={(e) => setTempAutoConfig({ ...tempAutoConfig, target: e.target.value })} />
                </div>
                <div style={styles.conditionPreview}>
                  เปิดเมื่อ: {tempAutoConfig.param} {tempAutoConfig.condition === '>' ? 'มากกว่า' : 'น้อยกว่า'} {tempAutoConfig.target}
                </div>
              </>
            )}

            <div style={styles.buttonGroup}>
              <button onClick={handleSaveAndActivateAuto} style={{ ...styles.saveButton, backgroundColor: '#4caf50' }}>💾 บันทึก & เปิด Auto</button>
              <button onClick={handleCancelAutoModal} style={{ ...styles.saveButton, backgroundColor: '#f44336' }}>✖ ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* DATA TABLE TAB */}
      {activeTab === 'data' && (
        <DataTablePage espConnected={node1Connected} />
      )}

      {/* GRAPH TAB */}
      {activeTab === 'graph' && (
        <GraphPage espConnected={node1Connected} />
      )}
    </div>
  );
};

/**
 * Sensor Card Component
 */
const SensorCard = ({ title, value, unit, color, textColor = 'white' }) => {
  const fresh = React.useContext(SensorFreshContext);
  return (
    <div style={{ ...styles.card, backgroundColor: color, color: textColor }}>
      <h4 style={styles.cardTitle}>{title}</h4>
      <h2 style={styles.cardValue}>
        {fresh ? (typeof value === 'number' ? value.toFixed(1) : value) : '–'}
        {fresh && <span style={styles.unit}> {unit}</span>}
      </h2>
    </div>
  );
};

/**
 * Metric Card Component for NPK and advanced metrics
 */
const MetricCard = ({ title, value, unit = '', range = '', color, textColor = 'white' }) => {
  const fresh = React.useContext(SensorFreshContext);
  return (
    <div style={{ ...styles.metricCard, backgroundColor: color, color: textColor }}>
      <h4 style={styles.metricTitle}>{title}</h4>
      <h3 style={styles.metricValue}>
        {fresh ? (typeof value === 'number' ? value.toFixed(1) : value) : '–'}
        {fresh && unit && <span style={styles.metricUnit}> {unit}</span>}
      </h3>
      {range && <p style={styles.metricRange}>{range}</p>}
    </div>
  );
};

// --- STYLES ---
const styles = {
  container: {
    padding: '1.5rem 2rem',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    backgroundColor: '#f5f7fa',
    minHeight: '100vh',
    maxWidth: '1800px',
    margin: '0 auto',
    boxSizing: 'border-box'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '3px solid #2196f3'
  },
  title: {
    margin: 0,
    fontSize: '2rem',
    color: '#1a1a1a'
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '20px',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '14px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'white',
    animation: 'pulse 2s infinite'
  },

  // Tab Navigation Styles
  tabNav: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    borderBottom: '2px solid #e0e0e0'
  },
  tabButton: {
    padding: '0.75rem 1.25rem',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    borderRadius: '8px 8px 0 0',
    outline: 'none'
  },
  tabButtonActive: {
    backgroundColor: '#2196f3',
    color: 'white',
    borderBottom: '3px solid #1976d2'
  },
  tabButtonInactive: {
    backgroundColor: '#e0e0e0',
    color: '#666',
    opacity: 0.6,
    borderBottom: '3px solid transparent'
  },

  // Error Box
  errorBox: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #ef5350'
  },

  // Sensor Cards
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  card: {
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    textAlign: 'center'
  },
  cardTitle: {
    margin: 0,
    opacity: 0.9,
    fontSize: '1rem',
    fontWeight: '600'
  },
  cardValue: {
    margin: '12px 0 0 0',
    fontSize: '2.2rem',
    fontWeight: 'bold'
  },
  unit: {
    fontSize: '1rem',
    opacity: 0.8
  },

  // Metrics Grid
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    marginBottom: '24px'
  },
  metricCard: {
    padding: '16px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    textAlign: 'center'
  },
  metricTitle: {
    margin: 0,
    fontSize: '0.9rem',
    opacity: 0.9,
    fontWeight: '600'
  },
  metricValue: {
    margin: '8px 0',
    fontSize: '1.6rem'
  },
  metricUnit: {
    fontSize: '0.8rem',
    opacity: 0.8
  },
  metricRange: {
    margin: '4px 0 0 0',
    fontSize: '11px',
    opacity: 0.7
  },

  // Graph Container
  graphContainer: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px'
  },
  graphTitle: {
    margin: '0 0 16px 0',
    color: '#1a1a1a'
  },
  graphWrapper: {
    width: '100%',
    minHeight: '300px'
  },
  loadingText: {
    textAlign: 'center',
    color: '#999',
    padding: '40px 20px'
  },

  // Control Section
  controlSectionTitle: {
    marginTop: 0,
    marginBottom: '20px',
    color: '#1a1a1a',
    fontSize: '1.5rem'
  },
  relayCardsWrapper: {
    padding: '20px',
    border: '3px solid #1976d2',
    borderRadius: '12px',
    backgroundColor: '#f9f9f9'
  },
  wrapperTitle: {
    margin: '0 0 15px 0',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#1976d2'
  },
  relayCardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1.2rem',
    marginBottom: '20px'
  },
  relayCard: {
    backgroundColor: 'white',
    padding: '1.2rem',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    border: '3px solid #1976d2'
  },
  relayHeader: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '15px',
    paddingBottom: '10px',
    borderBottom: '2px solid #e0e0e0',
    gap: '10px'
  },
  relayName: {
    margin: 0,
    fontSize: '1.05rem',
    color: '#1a1a1a',
    flex: 1
  },
  relayModeSelector: {
    display: 'flex',
    gap: '8px'
  },
  modeBtn: {
    padding: '0.4rem 0.75rem',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    transition: 'all 0.2s ease'
  },
  modeBtnActive: {
    backgroundColor: '#2196f3',
    color: 'white'
  },
  modeBtnInactive: {
    backgroundColor: '#e0e0e0',
    color: '#666'
  },

  // Relay Status
  relayStatus: {
    marginBottom: '15px',
    padding: '10px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px'
  },
  statusLabel: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#666'
  },
  onLabel: {
    color: '#4caf50',
    fontWeight: 'bold',
    fontSize: '1rem'
  },
  offLabel: {
    color: '#f44336',
    fontWeight: 'bold',
    fontSize: '1rem'
  },

  // Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    maxWidth: '900px',
    width: '95%'
  },
  modalTitle: {
    margin: '0 0 20px 0',
    color: '#1a1a1a',
    fontSize: '1.3rem',
    textAlign: 'center'
  },
  formGroup: {
    marginBottom: '10px'
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: 'bold',
    color: '#333',
    fontSize: '0.95rem'
  },
  input: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '0.95rem',
    boxSizing: 'border-box'
  },
  conditionPreview: {
    padding: '12px',
    backgroundColor: '#e3f2fd',
    borderRadius: '6px',
    color: '#1976d2',
    fontSize: '13px',
    margin: '12px 0',
    textAlign: 'center',
    fontWeight: 'bold'
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px'
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  },

  // Manual Mode
  manualMode: {
    textAlign: 'center'
  },
  modeLabel: {
    margin: '0 0 10px 0',
    color: '#666',
    fontSize: '12px'
  },
  toggleButton: {
    padding: '0.9rem 1.5rem',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    width: '100%'
  },

  // Auto Mode
  autoMode: {
    padding: '10px',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px'
  },
  autoConfig: {
    fontSize: '13px',
    color: '#666'
  },
  configText: {
    margin: '8px 0',
    fontWeight: 'bold'
  },
  editButton: {
    marginTop: '10px',
    padding: '8px 16px',
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    width: '100%'
  },

  // Timestamp
  timestamp: {
    textAlign: 'right',
    fontSize: '12px',
    color: '#999',
    marginTop: '20px'
  },

  // Connection indicator
  connectionIndicator: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    padding: '8px 16px',
    zIndex: 10000,
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 'bold',
    color: 'white',
    minHeight: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};

// CSS animation for status dot
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(styleSheet);

export default App;

const RelayCard = ({ index, relayNames, relayModes, statusData, changeRelayMode, handleAutoClick, toggleRelay, relayConfigs, espConnected = true }) => (
  <div style={styles.relayCard}>
    {/* Relay Header */}
    <div style={styles.relayHeader}>
      <h3 style={styles.relayName}>{relayNames[index]}</h3>
      <div style={styles.relayModeSelector}>
        <button
          onClick={() => changeRelayMode(index, 'MANUAL')}
          style={{
            ...styles.modeBtn,
            ...(relayModes[index] === 'MANUAL'
              ? styles.modeBtnActive
              : styles.modeBtnInactive)
          }}
        >
          ⚙️ MANUAL
        </button>
        {/* ⭐ PUMP (0) & PLOT PUMP 2 (4): MANUAL ONLY */}
        {(index !== 0 && index !== 4) && (
          <button
            onClick={() => handleAutoClick(index)}
            style={{
              ...styles.modeBtn,
              ...(relayModes[index] === 'AUTO'
                ? styles.modeBtnActive
                : styles.modeBtnInactive)
            }}
          >
            🤖 AUTO
          </button>
        )}
      </div>
    </div>

    {/* Relay Status */}
    <div style={styles.relayStatus}>
      <p style={styles.statusLabel}>
        Status: {espConnected ? (
          <span style={statusData.relays[index] ? styles.onLabel : styles.offLabel}>
            {statusData.relays[index] ? '◆ ON' : '⏻ OFF'}
          </span>
        ) : (
          <span style={{ color: '#bbb', fontStyle: 'italic' }}>– ? (ไม่ทราบ)</span>
        )}
      </p>
    </div>

    {/* Mode-specific Content */}
    {relayModes[index] === 'MANUAL' ? (
      <div style={styles.manualMode}>
        <p style={styles.modeLabel}>Manual Control (ควบคุมเอง)</p>
        <button
          onClick={() => toggleRelay(index)}
          style={{
            ...styles.toggleButton,
            backgroundColor: !espConnected ? '#bdbdbd' : statusData.relays[index] ? '#f44336' : '#4caf50',
            color: 'white',
            opacity: espConnected ? 1 : 0.6,
          }}
        >
          {!espConnected ? '⏻ ไม่ทราบสถานะ' : statusData.relays[index] ? '🔴 Turn OFF' : '🟢 Turn ON'}
        </button>
      </div>
    ) : (
      <div style={styles.autoMode}>
        <p style={styles.modeLabel}>Auto Mode (อัตโนมัติ)</p>
        <div style={styles.autoConfig}>
          <p>IF Condition Triggered → Relay ON</p>
          {index === 1 && relayConfigs[index].target1 !== undefined ? (
            // Dual sensor config for Fan
            <p style={styles.configText}>
              ({relayConfigs[index].param1} {relayConfigs[index].condition1} {relayConfigs[index].target1}) {relayConfigs[index].logic} ({relayConfigs[index].param2} {relayConfigs[index].condition2} {relayConfigs[index].target2})
            </p>
          ) : (
            // Single sensor config for other relays
            <p style={styles.configText}>
              Target: {relayConfigs[index].target} {relayConfigs[index].param}
            </p>
          )}
        </div>
      </div>
    )}
  </div>
);
