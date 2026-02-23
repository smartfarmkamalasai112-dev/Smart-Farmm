# Control Page Design - Option 1 (Independent Relay Control)

## 🎯 Concept: แต่ละ Relay มี Mode ของตัวเอง

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTROL PAGE (ควบคุม)                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   💧 ปั๊มน้ำ (Pump)  │  │   🌀 พัดลม (Fan)    │  │   💡 ไฟส่อง (Lamp)  │  │   🌫️ พ่นหมอก (Mist) │
│                      │  │                      │  │                      │  │                      │
│  Current: 88.2 %     │  │  Current: 27.5°C     │  │  Current: 132.5 Lux  │  │  Current: 35.4 %     │
│  Rule: INACTIVE      │  │  Rule: ACTIVE        │  │  Rule: INACTIVE      │  │  Rule: ACTIVE        │
│                      │  │  CO2: 747 ppm        │  │                      │  │                      │
│                      │  │                      │  │                      │  │                      │
│  Mode: ┌─────────┐   │  │  Mode: ┌─────────┐   │  │  Mode: ┌─────────┐   │  │  Mode: ┌─────────┐   │
│        │ MANUAL ⚙│◀──┼──┼─ AUTO  │⚙ MANUAL │ ◀─┼──┼─ MANUAL│⚙ AUTO  │◀──┼──┼─ AUTO  │⚙ MANUAL│
│        └─────────┘   │  │  └─────────┘   │  │  │        └─────────┘   │  │        └─────────┘
│                      │  │                │  │  │                      │  │
│  Status:             │  │  Status:       │  │  │  Status:             │  │  Status:
│  ┌─ MANUAL MODE ────┐│  │  ┌─ AUTO MODE ─┐  │  │  ┌─ MANUAL MODE ────┐│  │  ┌─ AUTO MODE ──┐
│  │ [  ON / OFF  ]   ││  │  │ IF < 40 %    │  │  │  │ [  ON / OFF  ]   ││  │  │ IF < 60 %    │
│  │                  ││  │  │ THEN TURN ON │  │  │  │                  ││  │  │ THEN TURN ON │
│  │                  ││  │  │              │  │  │  │ [⚙️ EDIT]        ││  │  │ [⚙️ EDIT]    │
│  │ Current: ⏻ OFF   ││  │  │ Current: ◆ ON│  │  │  │ Current: ⏻ OFF   ││  │  │ Current: ◆ ON│
│  └───────────────────┘│  │  └──────────────┘  │  │  └───────────────────┘│  │  └────────────┘
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘  └──────────────────┘

    ◆ = ON  (Green)
    ⏻ = OFF (Red)
```

---

## 📐 Card Structure Detail

### Card Layout:
```
┌────────────────────────────────────────┐
│ Header:                                │
│ [Icon + Name]    Mode: [MANUAL ⚙ AUTO]│  ← Tab buttons to switch mode
├────────────────────────────────────────┤
│ Current Value Display:                 │
│ "Current: 88.2 %"                      │
│ "Rule: INACTIVE / ACTIVE"              │
├────────────────────────────────────────┤
│ Content (Changes based on Mode):       │
│                                        │
│ IF MANUAL MODE:                        │
│  • Large ON/OFF Toggle Button          │
│  • Shows current relay state           │
│  • Direct control                      │
│                                        │
│ IF AUTO MODE:                          │
│  • Condition display: "IF < 40 % ..."  │
│  • [⚙️ EDIT] button to open Modal      │
│  • Condition status indicator          │
├────────────────────────────────────────┤
│ Footer:                                │
│ Current State: ◆ ON / ⏻ OFF            │
└────────────────────────────────────────┘
```

---

## 🔄 Mode System (Independent per Relay)

### State Management:
```javascript
// Each relay has independent state
{
  relayStates: [
    { 
      index: 0,
      name: "ปั๊มน้ำ",
      isOn: false,
      mode: "MANUAL",      // Each relay has own mode
      config: { target: 40, condition: "<" }
    },
    {
      index: 1,
      name: "พัดลม",
      isOn: true,
      mode: "AUTO",        // Independent!
      config: { target: 32, condition: ">", co2_target: 600, co2_condition: ">" }
    },
    ...
  ]
}
```

---

## 🖱️ User Interactions

### Scenario 1: Switch Pump to AUTO Mode
```
1. User clicks "AUTO" tab on Pump card
2. Card shows Automation settings
3. Displays current condition
4. User clicks [⚙️ EDIT]
5. Modal opens for editing
```

### Scenario 2: Turn on Fan Manually
```
1. User is on Fan card (already in MANUAL mode)
2. User clicks [ON] button
3. Relay turns ON immediately
4. Status shows "◆ ON"
5. No AUTO rules affect it
```

### Scenario 3: Switch back to MANUAL
```
1. User clicks "MANUAL" tab on Auto-controlled relay
2. Card switches to MANUAL mode
3. AUTO rules stop applying
4. Shows ON/OFF buttons instead
5. User can manually control
```

---

## 📱 Responsive Design

### Desktop (4 columns):
```
[Card] [Card] [Card] [Card]
```

### Tablet (2 columns):
```
[Card] [Card]
[Card] [Card]
```

### Mobile (1 column):
```
[Card]
[Card]
[Card]
[Card]
```

---

## 🎨 Color Scheme

| State | Color | Icon |
|-------|-------|------|
| ON | 🟢 Green (#10B981) | ◆ |
| OFF | 🔴 Red (#EF4444) | ⏻ |
| AUTO Mode Active | 🔵 Blue (#3B82F6) | ⚙️ |
| MANUAL Mode | ⚪ Gray (#6B7280) | 🎛️ |
| Rule Inactive | ⚪ Gray | - |
| Rule Active | 🟡 Yellow/Orange | ⚡ |

---

## 🔧 Modal Design (Automation Editor)

```
╔═══════════════════════════════════════════════════╗
║  Automation for ปั๊มน้ำ (Pump)                    ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Current Value: 88.2 %                            ║
║  Status: [RULE INACTIVE]                          ║
║  (Rule not triggering because 88.2 > 40)          ║
║                                                   ║
║  ┌───────────────────────────────────────────┐   ║
║  │ IF Moisture [ < ▾ ] is [ 40 ] %           │   ║
║  │ THEN Turn [ON ▾]                          │   ║
║  │                                           │   ║
║  │ [+ Add CO2 Condition]  (if Fan)           │   ║
║  └───────────────────────────────────────────┘   ║
║                                                   ║
║  ✓ Enable this automation                        ║
║                                                   ║
║  [ Cancel ]              [ Save Settings ]       ║
╚═══════════════════════════════════════════════════╝
```

---

## 📊 Data Flow

```
┌─────────────────┐
│   Dashboard     │
│   loads page    │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ API: /api/data       │
│ Returns:             │
│ - sensors data       │
│ - relay status       │
│ - mode per relay     │
│ - config per relay   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────────┐
│ ControlPage Component        │
│ - Render 4 Device Cards      │
│ - Each card independent      │
│ - Manage mode per card       │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ User Interactions:           │
│ 1. Click Mode Tab (AUTO/MAN) │
│ 2. Edit Automation (Modal)   │
│ 3. Toggle ON/OFF (Manual)    │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Send to Backend:             │
│ - POST /api/mode (if needed) │
│ - POST /api/relay (toggle)   │
│ - POST /api/config (settings)│
└──────────────────────────────┘
```

---

## ✅ Key Features Summary

✅ **Independent Relay Control**
- Each relay has separate mode (AUTO/MANUAL)
- No interference between relays
- User can set Pump=AUTO, Fan=MANUAL simultaneously

✅ **Two Control Modes per Relay**
- **MANUAL**: Direct ON/OFF button
- **AUTO**: Rule-based automation

✅ **Visual Clarity**
- Color-coded status (ON/OFF/RULE)
- Mode indicator on each card
- Current value always visible

✅ **Responsive Layout**
- 4-column desktop
- 2-column tablet
- 1-column mobile

✅ **Interaction Options**
- Tab switching (MANUAL ↔ AUTO)
- Direct toggle (MANUAL mode)
- Edit rules (AUTO mode)
- Modal for detailed settings

---

## 🚀 Implementation Phases

### Phase 1: Component Structure
- Create `DeviceCard.jsx` (independent component)
- Create `AutomationModal.jsx` (modal editor)
- Update `ControlPage.jsx` (grid layout)

### Phase 2: State Management
- Track mode per relay (not global)
- Track relay state per relay
- Support independent config per relay

### Phase 3: UI Styling
- Tailwind CSS styling
- Responsive grid
- Color coding

### Phase 4: API Integration
- Send relay-specific commands
- Support independent save per relay
- Error handling

