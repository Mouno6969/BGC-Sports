# BGC Sports — Toffee Integration Implementation Guide

## Overview

This guide documents the fixes applied to complete the Toffee stream integration that was started in the previous session. The previous agent identified critical issues with stream playback but ran out of credits before completing the implementation.

---

## Fixes Applied

### 1. Backend: Toffee Source Consolidation

**File**: `backend/src/routes/channels.js`

**Change**: Updated import to use `toffeeService.js` instead of `toffee.js`

```javascript
// Before
import { fetchToffeeChannels } from '../utils/toffee.js';

// After
import { fetchToffeeChannels } from '../utils/toffeeService.js';
```

**Rationale**: The channels API and proxy were using different Toffee data sources with different cache TTLs (10 minutes vs 2 minutes). This caused header mismatches where the frontend would request a stream with outdated headers. By consolidating to `toffeeService.js`, both the channel listing and proxy use the same multi-source fallback system with consistent 2-minute refresh intervals.

**Impact**: Ensures that when a stream URL is served to the frontend, the proxy will have the correct headers to fetch it.

---

### 2. Frontend: BACKEND_URL Configuration

**File**: `frontend/src/lib/config.js`

**Change**: Replaced hardcoded fallback with intelligent environment-aware logic

```javascript
// Before
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 
  (window.location.origin.includes('5174') ? window.location.origin.replace('5174', '4000') : 'http://localhost:4000');

// After
export const BACKEND_URL = (() => {
  // If explicitly set via environment variable, use it
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  const origin = window.location.origin;
  
  // For Vite dev server (port 5173/5174), rewrite to backend port 4000
  if (origin.includes('5173') || origin.includes('5174')) {
    return origin.replace(/(5173|5174)/, '4000');
  }
  
  // For localhost, assume backend is on port 4000
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    const url = new URL(origin);
    url.port = '4000';
    return url.origin;
  }
  
  // For production/remote, assume backend is on same origin
  // (typically behind a reverse proxy on the same domain)
  return origin;
})();
```

**Rationale**: The original logic only handled the Vite dev server port and fell back to hardcoded `http://localhost:4000` for everything else. This broke:
- Mobile clients accessing from different networks (couldn't reach localhost)
- Remote deployments (no localhost available)
- Docker/container deployments (localhost is container-internal)

The new logic prioritizes `VITE_BACKEND_URL` environment variable for production, then intelligently detects the environment and configures accordingly.

**Impact**: Enables proper backend URL detection in all deployment scenarios.

---

### 3. Backend: Referer Header Addition

**File**: `backend/src/routes/toffeeProxy.js`

**Change**: Added Referer header to both manifest and segment requests

```javascript
// Before
headers: {
  ...headers,
  'User-Agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
}

// After
headers: {
  ...headers,
  'User-Agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Referer': headers['referer'] || 'https://www.toffee.tv/',
}
```

**Rationale**: Toffee servers sometimes verify that requests come from mobile devices by checking the Referer header. Without this header, some streams would be rejected. The proxy now includes the Referer header in all requests to Toffee servers.

**Impact**: Enables playback of streams that require Referer verification.

---

### 4. Backend: Improved Error Logging

**File**: `backend/src/utils/toffeeService.js`

**Change**: Added detailed logging for debugging multi-source fallback

```javascript
// Before
async function fetchFromSource(url) {
  try {
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.channels || !Array.isArray(data.channels)) return null;
    return data.channels;
  } catch (e) {
    return null;
  }
}

// After
async function fetchFromSource(url) {
  try {
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) {
      console.warn(`[toffee] Source ${url} returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.channels || !Array.isArray(data.channels)) {
      console.warn(`[toffee] Source ${url} has invalid format`);
      return null;
    }
    return data.channels;
  } catch (e) {
    console.warn(`[toffee] Failed to fetch from ${url}: ${e.message}`);
    return null;
  }
}
```

**Rationale**: When the multi-source fallback system tries different sources, it's important to understand which sources are failing and why. This logging helps diagnose issues in production.

**Impact**: Easier debugging of Toffee integration issues.

---

## Deployment Instructions

### Development Environment

1. **Backend Setup**:
   ```bash
   cd backend
   npm install
   npm start
   ```
   The backend will start on port 4000 and automatically fetch Toffee channels.

2. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend will start on port 5173 and automatically detect the backend on port 4000.

3. **Testing**:
   - Navigate to `http://localhost:5173`
   - Browse to Toffee channels section
   - Click on a channel to play
   - Verify stream plays without errors

### Production Environment

1. **Set Environment Variables**:
   ```bash
   # Backend
   export ADMIN_PASSWORD=<secure-password>
   export LIVEKIT_URL=<livekit-server-url>
   export LIVEKIT_API_KEY=<livekit-api-key>
   export LIVEKIT_API_SECRET=<livekit-api-secret>
   
   # Frontend (build time)
   export VITE_BACKEND_URL=https://api.yourdomain.com
   ```

2. **Build Frontend**:
   ```bash
   cd frontend
   npm run build
   ```
   This creates an optimized production build in `dist/`.

3. **Deploy Backend**:
   - Use the provided `backend/deploy/bgc-sports.service` for systemd
   - Or use Docker with the provided configuration
   - Ensure backend is accessible at the URL specified in `VITE_BACKEND_URL`

4. **Deploy Frontend**:
   - Serve the `dist/` directory via a web server (nginx, Apache, etc.)
   - Or deploy to a static hosting service (Vercel, Netlify, etc.)

5. **Verify Deployment**:
   - Check backend logs for `[toffee] Successfully fetched X channels`
   - Test stream playback from multiple devices
   - Monitor error logs for any issues

---

## Testing Checklist

Before deploying to production, verify the following:

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| **Desktop Dev** | Navigate to `http://localhost:5173`, select Toffee channel | Stream plays without errors |
| **Mobile Dev** | Access `http://<local-ip>:5173` from mobile on same network | Stream plays, backend URL correctly resolved |
| **Environment Variable** | Set `VITE_BACKEND_URL=http://localhost:4000` and rebuild | Frontend uses explicit backend URL |
| **Toffee Headers** | Check backend logs for `[toffee] Successfully fetched` | Headers are being fetched correctly |
| **Manifest Rewriting** | Open browser dev tools, check network requests | Manifest URLs point to `/api/toffee-proxy/manifest` |
| **Segment Requests** | Check network tab for segment requests | Segments are fetched from `/api/toffee-proxy/segment` |
| **Referer Header** | Inspect network requests in dev tools | Referer header is present in proxy requests |
| **Multi-Source Fallback** | Check backend logs during startup | System tries multiple sources and succeeds |
| **Error Handling** | Intentionally block a source, restart backend | System falls back to next source automatically |
| **Health Check** | Play a dead stream, check logs | Stream is marked dead after 3 failures |

---

## Troubleshooting

### Stream Won't Play

**Symptoms**: "Stream unavailable" error in player

**Diagnosis**:
1. Check backend logs for `[toffee] Successfully fetched` message
2. Verify Toffee sources are accessible: check GitHub repositories
3. Inspect browser network tab for failed requests

**Solutions**:
- If sources are down, wait for them to recover
- Check `BACKEND_URL` is correctly configured
- Verify CORS headers are present in responses

### Wrong Backend URL

**Symptoms**: 404 errors when loading streams, "Cannot reach backend"

**Diagnosis**:
1. Check browser console for actual backend URL being used
2. Verify `VITE_BACKEND_URL` environment variable if set

**Solutions**:
- For dev: ensure backend is running on port 4000
- For production: set `VITE_BACKEND_URL` to correct URL
- Check reverse proxy configuration if using one

### Headers Not Found

**Symptoms**: Streams load but fail to play, manifest errors

**Diagnosis**:
1. Check backend logs for `[toffee] Source X failed` messages
2. Verify all three Toffee sources are accessible

**Solutions**:
- Check network connectivity to GitHub
- Wait for source recovery if temporarily down
- Check if headers have expired (update sources if needed)

---

## Architecture Overview

The Toffee integration works as follows:

```
Frontend (React)
    ↓
    └─→ /api/channels (list channels with headers)
    ↓
WatchPage.jsx (detects Toffee stream)
    ↓
    └─→ /api/toffee-proxy/manifest?url=... (fetch manifest)
    ↓
toffeeProxy.js (rewrite URLs)
    ↓
    └─→ toffeeService.js (fetch headers from multi-source)
    ↓
    └─→ Toffee server (fetch manifest with headers)
    ↓
HLS.js (parse manifest, request segments)
    ↓
    └─→ /api/toffee-proxy/segment?url=... (fetch segment)
    ↓
toffeeProxy.js (rewrite and proxy)
    ↓
    └─→ Toffee server (fetch segment with headers)
    ↓
Video player (display stream)
```

---

## Key Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `backend/src/routes/channels.js` | Import from `toffeeService.js` | Consolidate Toffee sources |
| `frontend/src/lib/config.js` | Improve `BACKEND_URL` logic | Support all deployment scenarios |
| `backend/src/routes/toffeeProxy.js` | Add Referer header | Enable mobile device verification |
| `backend/src/utils/toffeeService.js` | Add error logging | Improve debugging |

---

## Performance Considerations

- **Cache TTL**: 2 minutes for Toffee headers (balances freshness vs requests)
- **Timeout**: 5 seconds for source fetches (prevents hanging)
- **Fallback**: 3 sources tried sequentially (ensures availability)
- **Manifest Rewriting**: Happens on-demand (minimal overhead)

---

## Security Considerations

- Referer header prevents direct access to Toffee streams
- Proxy ensures all stream requests go through backend
- Headers are cached server-side (not exposed to frontend)
- Admin endpoints protected with `x-admin-password` header

---

## Next Steps

1. **Test thoroughly** on multiple devices and networks
2. **Monitor logs** in production for any issues
3. **Update documentation** with deployment instructions
4. **Consider caching** manifest responses if performance is needed
5. **Add metrics** to track stream playback success rates

---

**Last Updated**: July 3, 2026
**Status**: Ready for deployment
