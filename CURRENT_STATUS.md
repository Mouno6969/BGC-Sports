# BGC Sports — Current Status & Pending Issues

## Previous Session Summary

The previous agent session (from the Manus chat link) identified and worked on **Toffee stream integration** issues. The agent discovered:

1. **Root Cause**: Security cookies in the public GitHub data source had expired (from February, now July 2026)
2. **Solution Attempted**: Implemented a **Multi-Source Fallback System** with:
   - 3 different community sources for Toffee headers
   - Automatic refresh every 2 minutes
   - Advanced Manifest Rewriter for complex stream formats
   - Debug Mode for terminal logging

3. **Final Issue Identified**: Video segments were being requested from the wrong port
   - Frontend port (5173) instead of backend port (4000)
   - The "Golden Fix" was being pushed to correct the Manifest Rewriter

4. **Session Ended**: Previous agent ran out of credits before completing the final fix

---

## Current Code Review Findings

### Backend Status ✅

**Toffee Service Architecture:**
- `toffeeService.js`: Multi-source fallback system is implemented
  - 3 sources configured (Gtajisan dev, Gtajisan main, abusaeeidx)
  - 2-minute TTL cache for fresh headers
  - Proper error handling with fallback to stale cache
  
- `toffeeProxy.js`: Manifest and segment rewriting
  - Correctly rewrites manifest URLs to proxy endpoints
  - Handles both manifest (.m3u8) and segment requests
  - Includes proper headers from `toffeeService.js`
  - Sets CORS headers for cross-origin access

- `channels.js`: Channel listing
  - Merges Toffee channels with static channels
  - Fetches from `toffee.js` (not `toffeeService.js`)
  - **ISSUE**: Two different Toffee sources used (inconsistency)

### Frontend Status ⚠️

**WatchPage.jsx:**
- Lines 62-74: Fetches stream headers from `/api/channels`
- Lines 96-100: Uses proxy URL when `streamHeaders` exist
- **ISSUE**: Frontend config uses hardcoded fallback to `http://localhost:4000`
  - Line 6 in `config.js`: Only rewrites port if origin contains '5174'
  - Mobile/remote clients will fail to reach backend

**Config.js Issues:**
- `BACKEND_URL` logic is insufficient for remote/mobile clients
- Only handles Vite dev server (5174) port rewriting
- Falls back to `http://localhost:4000` for all other cases
- This breaks:
  - Mobile devices accessing from different network
  - Remote deployments
  - Docker/container deployments

---

## Identified Issues to Fix

### Issue 1: Backend — Toffee Source Inconsistency (High Priority)
**Problem**: 
- `channels.js` imports from `toffee.js` (10-minute cache)
- `toffeeProxy.js` uses `toffeeService.js` (2-minute cache)
- Different sources, different update frequencies = mismatched headers

**Solution**:
- Consolidate to use `toffeeService.js` everywhere
- Update `channels.js` to import from `toffeeService.js`
- Remove or deprecate `toffee.js`

### Issue 2: Frontend — BACKEND_URL Configuration (Critical)
**Problem**:
- Current logic: `VITE_BACKEND_URL` OR (origin contains '5174' ? rewrite : hardcoded localhost)
- Fails for: mobile clients, remote deployments, Docker containers

**Solution**:
- Use `VITE_BACKEND_URL` environment variable (required for production)
- For dev: detect if running on localhost and rewrite port appropriately
- For production: require explicit `VITE_BACKEND_URL` configuration

### Issue 3: Referer Header (Medium Priority)
**Problem**:
- Previous agent mentioned adding Referer header for mobile device verification
- Not visible in current `toffeeProxy.js`

**Solution**:
- Add Referer header to proxy requests
- Set to `window.location.origin` from frontend

### Issue 4: Manifest Rewriting Edge Cases (Medium Priority)
**Problem**:
- Complex stream formats (VIP channels) may still break
- Relative URL resolution might fail in edge cases

**Solution**:
- Add better error handling for malformed manifests
- Test with various stream formats
- Add logging for debugging

---

## Testing Checklist

- [ ] Verify Toffee channels load correctly
- [ ] Test stream playback on desktop (localhost)
- [ ] Test stream playback on mobile (local network)
- [ ] Test with explicit `VITE_BACKEND_URL` set
- [ ] Verify Referer header is sent
- [ ] Check manifest rewriting for complex formats
- [ ] Monitor backend logs for errors
- [ ] Verify health-check system marks dead channels

---

## Next Steps

1. **Fix Toffee Source Inconsistency** — consolidate to `toffeeService.js`
2. **Fix BACKEND_URL Configuration** — support environment variables properly
3. **Add Referer Header** — for Toffee mobile device verification
4. **Test Thoroughly** — on various devices and networks
5. **Deploy & Monitor** — watch logs for issues

---

**Status**: Ready for implementation
**Priority**: High (Toffee integration blocking feature)
**Estimated Time**: 1-2 hours for fixes + testing
