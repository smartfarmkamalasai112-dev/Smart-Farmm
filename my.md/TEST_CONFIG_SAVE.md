# Config Save Fix - Testing Guide

## Latest Changes Applied ✅

1. **AutomationPanel.jsx**:
   - Added `syncLocked` state with 3.5-second timeout
   - Fixed useEffect dependencies (removed local state variables)
   - Added console logging to track sync behavior
   
2. **AutomationPage.jsx**:
   - Increased fetch interval from 3s → 4s
   - This ensures config fetches AFTER the 3.5s lock expires

3. **Build Status**: ✅ Successfully compiled (695 modules)

## How to Test

### Test Procedure
1. Open browser to http://localhost:5173
2. Navigate to **Automation** page
3. Edit any relay config value (e.g., change Pump target from 40 → 45)
4. Click **"บันทึก"** (Save)
5. **CRITICAL OBSERVATION**: Watch the value for next 5 seconds

### Expected Behavior (FIXED)
- ✅ Value shows new value immediately (45)
- ✅ Value stays at 45 for 3.5 seconds (lock period)
- ✅ After 3.5s, fresh fetch occurs (4s)
- ✅ Value remains 45 (no bounce-back!)
- ✅ **Total**: Value persists after save

### How to Monitor (Browser DevTools)

#### Console Tab
Open `Developer Tools → Console` and watch for messages:

**During save**:
```
🔒 Locking sync for relay 0: {target: 45, condition: '>', ...}
```

**Next 3.5 seconds**:
```
⏸️ [Relay 0] Sync blocked: isEditing=false, syncLocked=true
```

**After 3.5s unlock** (when next fetch occurs):
```
⏸️ [Relay 0] Sync blocked: isEditing=false, syncLocked=false
✅ [Relay 0] Syncing from server: target 40 → 45
```

#### Network Tab
1. Click **Network** tab
2. Filter by `relay-configs`
3. Verify:
   - **POST** request succeeds (Status 200) when you save
   - **GET** requests occur every 4 seconds
   - No GET request occurs during 3.5s lock period

### Backend Verification

Watch Flask logs for:

**On save**:
```
🔧 POST /api/relay-configs - Received data: {'index': 0, 'target': 45, ...}
✅ Config saved - relay_configs[0]: {'target': 45, ...}
📡 Sent config to ESP32
```

## What to Report If Still Bouncing

If values still bounce back:

1. **Screenshot of console logs** during the save (paste the messages)
2. **Network tab timing** - Are GETs happening during the 3.5s window?
3. **Exact sequence**:
   - What value did you change?
   - What value did it bounce to?
   - How long before it bounced?

## Technical Details

### Why This Fix Works

**Before (Broken)**:
```
t=0ms: User saves (target: 40 → 45)
t=0-100ms: Local state updates
t=200ms: useEffect dependency triggers (because target in deps)
t=200ms: Infinite loop - keeps trying to sync
t=2000ms: Fetch returns OLD value (40)
Result: Bounce-back to 40 ❌
```

**After (Fixed)**:
```
t=0ms: User saves (target: 40 → 45)
t=0ms: syncLocked = true (IMMEDIATE LOCK)
t=0-3500ms: useEffect SKIPPED because syncLocked=true
t=3500ms: Lock timer expires → syncLocked = false
t=4000ms: Next fetch returns NEW value (45)
t=4000ms: useEffect allows sync ONLY because lock expired
Result: Value persists at 45 ✅
```

### Timing is Critical
- **Lock duration**: 3.5s (covers the save window)
- **Fetch interval**: 4.0s (longer than lock)
- **Gap**: 500ms buffer (ensures fresh data arrives after lock)

## If You Need to Debug Further

Add this to [smart-farm-dashboard/src/components/AutomationPanel.jsx](smart-farm-dashboard/src/components/AutomationPanel.jsx#L40) to see state changes:

```jsx
useEffect(() => {
  console.log(`🔍 [Relay ${index}] State Update:`, {
    target, condition, syncLocked, isEditing, initialConfigTarget: initialConfig.target
  });
}, [target, condition, syncLocked, isEditing, initialConfig]);
```

This will show every state change in the console for detailed analysis.

---

**Status**: Ready for testing  
**Last Build**: 14:39 (2 minutes ago)  
**Backend Status**: Running and operational
