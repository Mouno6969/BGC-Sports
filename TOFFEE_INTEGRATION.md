# Toffee Stream Integration — Complete Implementation

## Overview

This document describes the complete Toffee stream integration for BGC-Sports. Toffee streams are protected by dynamic headers and cookies that expire frequently. The solution uses a backend proxy to handle these authentication requirements.

## Architecture

### Problem Statement
Toffee live streams (HLS format) require specific headers for each request:
- `Host`: CDN hostname
- `cookie`: Edge-Cache-Cookie with time-limited signature
- `user-agent`: Specific Toffee user agent string
- `client-api-header`: Encrypted authentication token

Browsers cannot set all these headers directly due to security restrictions (e.g., Host header). Additionally, headers expire frequently and must be refreshed from the Toffee bypass data source.

### Solution: Backend Proxy

The solution implements a backend proxy that:
1. Fetches Toffee channel data with headers from a public bypass repository
2. Intercepts HLS manifest and segment requests from the frontend
3. Adds required headers server-side before forwarding to Toffee CDN
4. Rewrites manifest URLs to route all requests through the proxy

## Implementation Details

### Backend Changes

#### 1. New Route: `/api/toffee-proxy`
**File**: `backend/src/routes/toffeeProxy.js`

Two endpoints:
- `GET /api/toffee-proxy/manifest?url=<url>&headers=<encoded>`
  - Fetches HLS manifest from Toffee CDN with required headers
  - Rewrites all segment/sub-manifest URLs to proxy through `/api/toffee-proxy/segment`
  - Returns modified manifest to frontend

- `GET /api/toffee-proxy/segment?url=<url>&headers=<encoded>`
  - Fetches individual segments with required headers
  - Streams response directly to frontend
  - Includes caching headers

**Header Encoding**: Headers are base64-encoded in query params to avoid URL length issues.

#### 2. Server Integration
**File**: `backend/src/server.js`

Added import and route registration:
```javascript
import toffeeProxyRoute from './routes/toffeeProxy.js';
app.use('/api/toffee-proxy', toffeeProxyRoute);
```

### Frontend Changes

#### 1. WatchPage Component
**File**: `frontend/src/pages/WatchPage.jsx`

When Toffee stream headers are available:
- Encode headers as base64
- Route manifest through `/api/toffee-proxy/manifest` instead of direct URL
- HLS.js automatically fetches segments through rewritten URLs

```javascript
let sourceUrl = url;
if (streamHeaders) {
  const encodedHeaders = btoa(JSON.stringify(streamHeaders));
  sourceUrl = `/api/toffee-proxy/manifest?url=${encodeURIComponent(url)}&headers=${encodedHeaders}`;
}
hls.loadSource(sourceUrl);
```

#### 2. Player Component
**File**: `frontend/src/components/Player.jsx`

Same proxy routing applied to the generic Player component for consistency.

### Channel Data Flow

1. **Fetch**: Backend fetches Toffee channels from public bypass repo via `toffeeService.js`
2. **Store**: Channels include `headers` object with required authentication
3. **Serve**: `/api/channels` endpoint returns channels with headers
4. **Frontend**: WatchPage fetches channels and extracts headers for the selected stream
5. **Proxy**: Frontend routes manifest through proxy, which adds headers server-side

## Data Sources

### Toffee Channel Bypass Repository
- **URL**: `https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/main/toffee_channel_data.json`
- **Update Frequency**: Regular updates (maintained by community)
- **Format**: JSON with channels array containing `name`, `link`, `headers`, `logo`

### Backend Caching
- **TTL**: 5 minutes (configurable in `toffeeService.js`)
- **Fallback**: Returns stale cache if fetch fails
- **Refresh**: Automatic on cache expiry

## Testing

### Manual Testing

1. **Start Backend**:
   ```bash
   cd backend
   npm install
   npm start
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Test Toffee Channels**:
   - Navigate to homepage
   - Look for "Toffee" section
   - Click on a Toffee channel
   - Verify stream plays in watch page

4. **Verify Proxy**:
   - Open browser DevTools (Network tab)
   - Look for requests to `/api/toffee-proxy/manifest` and `/api/toffee-proxy/segment`
   - Verify no CORS errors

### Debugging

**Enable Verbose Logging**:
```javascript
// In toffeeProxy.js
console.log('[toffee-proxy] manifest request:', url);
console.log('[toffee-proxy] segment request:', url);
```

**Check Headers**:
```bash
# Verify headers are being sent
curl -v "http://localhost:3001/api/toffee-proxy/manifest?url=<encoded-url>&headers=<encoded-headers>"
```

## Limitations & Future Improvements

### Current Limitations
1. **Header Expiry**: Headers expire after ~24 hours. Cache TTL is 5 minutes, so stale headers may be used for up to 5 minutes after expiry.
2. **Manifest Rewriting**: Simple regex-based rewriting. Complex manifests with comments may need refinement.
3. **No Segment Caching**: Segments are streamed directly without caching. Consider adding segment cache for popular streams.

### Future Improvements
1. **Adaptive Header Refresh**: Detect 401/403 errors and force refresh headers immediately
2. **Segment Cache**: Implement segment caching with LRU eviction
3. **Monitoring**: Add metrics for proxy usage, error rates, and header expiry
4. **Fallback**: Implement fallback to direct playback if proxy fails
5. **Rate Limiting**: Add rate limiting to prevent abuse

## Troubleshooting

### Issue: "Stream unavailable" error
**Cause**: Headers expired or Toffee CDN blocked request
**Solution**: 
- Check backend logs for error details
- Force refresh headers: `GET /api/toffee/channels?force=true` (if implemented)
- Verify Toffee bypass repo is still accessible

### Issue: CORS errors in browser console
**Cause**: Proxy not setting CORS headers
**Solution**: Verify `res.set('Access-Control-Allow-Origin', '*')` in toffeeProxy.js

### Issue: Segments fail to load
**Cause**: Manifest rewriting not working correctly
**Solution**: 
- Check manifest format in browser DevTools
- Verify segment URLs are correctly rewritten to `/api/toffee-proxy/segment`
- Check backend logs for segment fetch errors

## Files Modified

1. `backend/src/routes/toffeeProxy.js` (NEW)
2. `backend/src/server.js` (MODIFIED - added route)
3. `frontend/src/pages/WatchPage.jsx` (MODIFIED - proxy routing)
4. `frontend/src/components/Player.jsx` (MODIFIED - proxy routing)

## Deployment Notes

### Environment Variables
No new environment variables required. Existing config should work.

### CORS Configuration
Ensure `config.clientOrigin` includes your frontend domain. The proxy sets `Access-Control-Allow-Origin: *` for maximum compatibility.

### Performance Considerations
- Proxy adds minimal latency (typically <100ms per request)
- Manifest requests are small (~10-50KB)
- Segment requests are large (1-5MB) but streamed directly
- Consider using CDN in front of proxy for production

## References

- [HLS Specification](https://tools.ietf.org/html/draft-pantos-http-live-streaming)
- [Toffee Bypass Repository](https://github.com/Gtajisan/Toffee-Auto-Update-Playlist)
- [Express.js Proxy Pattern](https://expressjs.com/)
- [HLS.js Documentation](https://github.com/video-dev/hls.js)
