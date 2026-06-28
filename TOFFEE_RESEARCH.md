# Toffee Stream Integration Research

## Stream Structure
Toffee live streams use the HLS protocol (`.m3u8`). However, they are protected by:
1. **Specific Headers**: Each request must include headers like `Host`, `cookie`, `user-agent`, and `client-api-header`.
2. **Dynamic Cookies**: The `Edge-Cache-Cookie` appears to be time-limited and contains a signature.
3. **Client-API-Header**: A long, encrypted-looking string that is likely required for authentication.

## Integration Strategy
To integrate these streams into BGC-Sports, we need a way to dynamically fetch the latest valid headers and stream URLs. 

### Data Source
The repository `Gtajisan/Toffee-channel-bypass` provides a regularly updated JSON file:
`https://raw.githubusercontent.com/Gtajisan/Toffee-channel-bypass/main/toffee_channel_data.json`

### Implementation Plan
1. **Backend Fetcher**: Create a utility in the BGC-Sports backend to fetch this JSON.
2. **Channel Mapping**: Map Toffee channels to the BGC-Sports channel format.
3. **Proxy/Relay**: Since the streams require specific headers, a direct link in the frontend player might fail if the browser doesn't send the required headers. We may need a small backend proxy or ensure the player (Hls.js) is configured to send these headers.
4. **Automatic Updates**: Use the backend to periodically refresh the Toffee channel data.

## Sample Channel Data
```json
{
  "name": "Zee Bangla",
  "link": "https://bldcmprod-cdn.toffeelive.com/cdn/live/zee_bangla/playlist.m3u8",
  "headers": {
    "Host": "bldcmprod-cdn.toffeelive.com",
    "cookie": "Edge-Cache-Cookie=...",
    "user-agent": "Toffee (Linux;Android 14) ...",
    "client-api-header": "...",
    "accept-encoding": "gzip"
  },
  "logo": "https://images.toffeelive.com/..."
}
```
