export function sanitizeManifest(manifest) {
  const cleaned = [];
  let inJsonBlock = false;

  for (const rawLine of manifest.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      cleaned.push('');
      continue;
    }
    if (line.startsWith('{') || line.startsWith('[')) {
      inJsonBlock = true;
      continue;
    }
    if (inJsonBlock) {
      if (line.endsWith('}') || line.endsWith(']')) inJsonBlock = false;
      continue;
    }
    if (line.includes('"playbakcs_url"')) continue;
    cleaned.push(rawLine);
  }

  return cleaned.join('\n');
}

function isHlsTagLine(line) {
  return line.startsWith('#');
}

function isStreamUrlLine(line) {
  if (!line || isHlsTagLine(line)) return false;
  if (line.startsWith('{') || line.startsWith('[') || line.includes('"playbakcs_url"')) return false;
  // Absolute URLs, relative playlist/segment paths, and disguised TS (.jpg/.png/bin)
  return (
    line.startsWith('http://')
    || line.startsWith('https://')
    || line.startsWith('/')
    || line.endsWith('.m3u8')
    || line.endsWith('.ts')
    || line.endsWith('.m4s')
    || line.endsWith('.jpg')
    || line.endsWith('.jpeg')
    || line.endsWith('.png')
    || line.endsWith('.bin')
    || line.includes('.m3u8?')
    || line.includes('.ts?')
    || line.includes('tracks-')
    || line.includes('chunklist')
    || line.includes('media_')
    || line.includes('mono.m3u8')
  );
}

export function rewriteManifest(manifest, baseUrl, toProxyUrl) {
  const lines = sanitizeManifest(manifest).split('\n');

  return lines
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return '';

      if (isHlsTagLine(line)) {
        if (line.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
            let absoluteUrl = uri;
            if (!uri.startsWith('http')) absoluteUrl = new URL(uri, baseUrl).href;
            return `URI="${toProxyUrl(absoluteUrl)}"`;
          });
        }
        return rawLine;
      }

      if (!isStreamUrlLine(line)) return '';

      let absoluteUrl = line;
      try {
        if (!line.startsWith('http')) absoluteUrl = new URL(line, baseUrl).href;
      } catch {
        return '';
      }

      return toProxyUrl(absoluteUrl);
    })
    .filter((line, index, arr) => line !== '' || (index > 0 && arr[index - 1] !== ''))
    .join('\n');
}