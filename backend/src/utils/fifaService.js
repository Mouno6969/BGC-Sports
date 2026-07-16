// ---------------------------------------------------------------------------
// World Cup live channel catalog + deep health probe.
//
// Only channels that return a valid HLS playlist AND a real media segment
// (via /api/hls-proxy) are exposed to the UI. Playback is always on-site.
// Catalog is tuned for India (Hyderabad) server egress.
// ---------------------------------------------------------------------------
import fetch from 'node-fetch';
import https from 'https';
import http from 'http';

const FIFA_LOGO = 'https://i.ibb.co.com/vnbkF0r/fifa-world-cup-2026-logo-png-seeklogo-665644.png';
const BEIN_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/BeIN_Sports_logo_%28vertical_version%29.svg/500px-BeIN_Sports_logo_%28vertical_version%29.svg.png';
const FOX_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/FOX_Sports_logo.svg/960px-FOX_Sports_logo.svg.png';
const GOLTV_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Gol.svg/960px-Gol.svg.png';
const CAZE_LOGO = 'https://upload.wikimedia.org/wikipedia/en/thumb/6/64/Caz%C3%A9TV_logo.svg/500px-Caz%C3%A9TV_logo.svg.png';
const ITV_LOGO = 'https://upload.wikimedia.org/wikipedia/en/thumb/9/92/ITV_logo_2013.svg/500px-ITV_logo_2013.svg.png';
const TYC_LOGO = 'https://ui-avatars.com/api/?name=TyC&background=e30613&color=fff&size=256&bold=true&format=png';
// Avoid i.imgur.com — rate-limits datacenter IPs (HTTP 429) so logos vanish site-wide.
const TSN_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/TSN2.svg/960px-TSN2.svg.png';
const TUDN_LOGO = 'https://ui-avatars.com/api/?name=TUDN&background=00a651&color=fff&size=256&bold=true&format=png';
const CBS_SPORTS_LOGO = 'https://ui-avatars.com/api/?name=CBS+Sports&background=0033a0&color=fff&size=256&bold=true&format=png';
const TELEMUNDO_LOGO =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Telemundo_logo_2018.svg/960px-Telemundo_logo_2018.svg.png';
const PREMIER_LOGO = FIFA_LOGO;
const BTV_LOGO = 'https://d38ll44lbmt52p.cloudfront.net/cms/channel_poster/1677040358634_BTVogo.png';
const BTV_NEWS_LOGO = 'https://d38ll44lbmt52p.cloudfront.net/cms/channel_poster/1735648543857_Poster.jpg';
const BTV_CTG_LOGO = 'https://d38ll44lbmt52p.cloudfront.net/cms/channel_poster/1676193167149_3.png';

// Prefer IPv4 — some BD CDNs hang on broken IPv6 paths from this host
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  family: 4,
});
const httpAgent = new http.Agent({ keepAlive: true, family: 4 });

/**
 * Catalog of free/public HLS feeds. Many "rights" channels (FOX, BeIN) only
 * work when their upstream is up; deep probe filters dead ones every few min.
 * Prioritize feeds that often carry live football / WC coverage.
 */
const FIFA_CHANNELS = [
  // ── Canada rights (TSN) — iptv-org index.m3u ────────────────────────────
  {
    id: 'wc-tsn1',
    name: 'TSN 1',
    url: 'http://40.160.24.55/TSN_1/index.m3u8',
    logo: TSN_LOGO,
    provider: 'tsn',
    priority: 0.1,
    tags: ['world-cup', 'tsn', 'canada', 'live', 'iptv-org'],
  },
  {
    id: 'wc-tsn2',
    name: 'TSN 2',
    url: 'http://40.160.24.55/TSN_2/index.m3u8',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/TSN2.svg/960px-TSN2.svg.png',
    provider: 'tsn',
    priority: 0.2,
    tags: ['world-cup', 'tsn', 'canada', 'live', 'iptv-org'],
  },
  {
    id: 'wc-tsn3',
    name: 'TSN 3',
    url: 'http://40.160.24.55/TSN_3/index.m3u8',
    logo: TSN_LOGO,
    provider: 'tsn',
    priority: 0.3,
    tags: ['world-cup', 'tsn', 'canada', 'live', 'iptv-org'],
  },
  {
    id: 'wc-tsn4',
    name: 'TSN 4',
    url: 'http://40.160.24.55/TSN_4/index.m3u8',
    logo: TSN_LOGO,
    provider: 'tsn',
    priority: 0.4,
    tags: ['world-cup', 'tsn', 'canada', 'live', 'iptv-org'],
  },
  {
    id: 'wc-tsn5',
    name: 'TSN 5',
    url: 'http://40.160.24.55/TSN_5/index.m3u8',
    logo: TSN_LOGO,
    provider: 'tsn',
    priority: 0.5,
    tags: ['world-cup', 'tsn', 'canada', 'live', 'iptv-org'],
  },
  {
    id: 'wc-tsn-ocho',
    name: 'TSN The Ocho',
    url: 'https://d3pnbvng3bx2nj.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-rds8g35qfqrnv/TSN_The_Ocho.m3u8',
    logo: 'https://ui-avatars.com/api/?name=Ocho&background=ff6b00&color=fff&size=256&bold=true&format=png',
    provider: 'tsn',
    priority: 0.6,
    tags: ['world-cup', 'tsn', 'canada', 'iptv-org'],
  },
  // ── Mexico / US Spanish (TUDN) — iptv-org index.m3u ─────────────────────
  {
    id: 'wc-tudn',
    name: 'TUDN',
    url: 'https://streaming.alwaysdata.net/tudn.php',
    logo: TUDN_LOGO,
    provider: 'tudn',
    priority: 0.7,
    tags: ['world-cup', 'tudn', 'spanish', 'mexico', 'live', 'iptv-org'],
  },
  {
    id: 'wc-tudn-univision',
    name: 'TUDN (Univision)',
    url: 'https://streaming-live-fcdn.api.prd.univisionnow.com/tudn/tudn.isml/hls/tudn.m3u8',
    logo: TUDN_LOGO,
    provider: 'tudn',
    priority: 0.75,
    tags: ['world-cup', 'tudn', 'spanish', 'usa', 'iptv-org'],
  },
  // BeIN family — often carry live football
  {
    id: 'wc-bein-usa',
    name: 'BeIN Sports USA',
    url: 'http://23.237.104.106:8080/USA_BEIN/index.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    priority: 1,
    tags: ['world-cup', 'bein', 'live'],
  },
  {
    id: 'wc-bein-africa1',
    name: 'BeIN Sports 1',
    url: 'http://41.205.70.146/BEINSPORT1/index.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    priority: 2,
    tags: ['world-cup', 'bein', 'live'],
  },
  {
    id: 'wc-bein-xtra',
    name: 'BeIN Sports XTRA',
    url: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    priority: 3,
    tags: ['world-cup', 'bein'],
  },
  {
    id: 'wc-bein-hd',
    name: 'BeIN Sports HD',
    url: 'https://bein-esp-xumo.amagi.tv/playlistR1080p.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    priority: 4,
    tags: ['world-cup', 'bein'],
  },
  {
    id: 'wc-bein-fr',
    name: 'BeIN Sports France',
    url: 'http://145.239.5.177:80/559/index.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    priority: 5,
    tags: ['world-cup', 'bein', 'france'],
  },
  {
    id: 'wc-bein-xtra-es',
    name: 'BeIN Sports XTRA Español',
    url: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    priority: 6,
    tags: ['world-cup', 'bein', 'spanish'],
  },
  // Fox (US WC English rights on FOX / Fox Deportes Spanish)
  {
    id: 'wc-fox-deportes',
    name: 'Fox Deportes',
    url: 'http://23.237.104.106:8080/USA_FOX_DEPORTES/index.m3u8',
    logo: FOX_LOGO,
    provider: 'fox',
    priority: 7,
    tags: ['world-cup', 'fox', 'spanish', 'live'],
  },
  {
    id: 'wc-espn-deportes',
    name: 'ESPN Deportes',
    url: 'http://40.160.24.58/ESPN_DEPORTES/index.m3u8',
    logo: 'https://ui-avatars.com/api/?name=ESPN&background=d00027&color=fff&size=256&bold=true&format=png',
    provider: 'international',
    priority: 7.2,
    tags: ['world-cup', 'espn', 'spanish', 'live', 'iptv-org'],
  },
  {
    id: 'wc-fox-sports',
    name: 'Fox Sports',
    url: 'https://d1jzu95oc8fgt3.cloudfront.net/FOX_Sports.m3u8',
    logo: FOX_LOGO,
    provider: 'fox',
    priority: 7.5,
    tags: ['world-cup', 'fox', 'live', 'iptv-org'],
  },
  {
    id: 'wc-fox1',
    name: 'Fox Sports 1',
    url: 'http://85.237.89.160:9590/usa-s/FOX-SPORTS-1/index.m3u8',
    logo: FOX_LOGO,
    provider: 'fox',
    priority: 7.6,
    tags: ['world-cup', 'fox', 'live', 'iptv-org'],
  },
  {
    id: 'wc-espnu',
    name: 'ESPNU',
    url: 'http://23.237.104.106:8080/USA_ESPNU/index.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    priority: 7.7,
    tags: ['world-cup', 'espn', 'iptv-org'],
  },
  {
    id: 'wc-telemundo-int',
    name: 'Telemundo Internacional',
    url: 'http://177.234.249.178:8888/TELEMUNDO/index.m3u8',
    logo: TELEMUNDO_LOGO,
    provider: 'international',
    priority: 7.8,
    tags: ['world-cup', 'telemundo', 'spanish', 'iptv-org'],
  },
  {
    id: 'wc-telemundo',
    name: 'Telemundo',
    url: 'https://streamvidex.qzz.io/videx/telemundo/index.m3u8',
    logo: TELEMUNDO_LOGO,
    provider: 'international',
    priority: 7.85,
    tags: ['world-cup', 'telemundo', 'spanish', 'live', 'iptv-org'],
  },
  {
    id: 'wc-cbs-sports',
    name: 'CBS Sports Network',
    url: 'http://40.160.24.52/CBS_SPORTS_NETWORK/index.m3u8',
    logo: CBS_SPORTS_LOGO,
    provider: 'international',
    priority: 7.9,
    tags: ['world-cup', 'cbs', 'live', 'iptv-org'],
  },
  {
    id: 'wc-fox1-videx',
    name: 'Fox Sports 1 (HD)',
    url: 'https://streamvidex.qzz.io/videx/fox1usa/index.m3u8',
    logo: FOX_LOGO,
    provider: 'fox',
    priority: 7.55,
    tags: ['world-cup', 'fox', 'live', 'iptv-org'],
  },
  {
    id: 'wc-fubo-sports',
    name: 'fubo Sports Network',
    url: 'https://dnf08l6u6uxnz.cloudfront.net/master.m3u8',
    logo: 'https://ui-avatars.com/api/?name=fubo&background=1a1a2e&color=f5a623&size=256&bold=true&format=png',
    provider: 'international',
    priority: 7.95,
    tags: ['world-cup', 'fubo', 'sports', 'iptv-org'],
  },
  {
    id: 'wc-nbc-sports-now',
    name: 'NBC Sports NOW',
    url: 'https://d4whmvwm0rdvi.cloudfront.net/10007/99993008/hls/master.m3u8?ads.xumo_channelId=99993008',
    logo: 'https://ui-avatars.com/api/?name=NBC&background=f2c300&color=111&size=256&bold=true&format=png',
    provider: 'international',
    priority: 7.96,
    tags: ['world-cup', 'nbc', 'sports', 'iptv-org'],
  },
  // GolTV
  {
    id: 'wc-goltv',
    name: 'GolTV',
    url: 'http://23.237.104.106:8080/USA_GOLTV/index.m3u8',
    logo: GOLTV_LOGO,
    provider: 'goltv',
    priority: 8,
    tags: ['world-cup', 'goltv', 'soccer'],
  },
  {
    id: 'wc-goltv-la',
    name: 'GolTV Latin America',
    url: 'http://177.234.249.178:8888/GOLTV/index.m3u8',
    logo: GOLTV_LOGO,
    provider: 'goltv',
    priority: 9,
    tags: ['world-cup', 'goltv'],
  },
  // CazeTV / ITV
  {
    id: 'wc-cazetv',
    name: 'CazeTV',
    url: 'https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8',
    logo: CAZE_LOGO,
    provider: 'cazetv',
    priority: 10,
    tags: ['world-cup', 'caze', 'brazil'],
  },
  // ── ITV family (World Cup coverage on ITV / ITV Deportes feeds) ──────────
  // Verified via on-site HLS proxy: master + media playlist + real TS segment.
  {
    id: 'wc-itv-deportes',
    name: 'ITV Deportes',
    url: 'https://thm-it-roku.otteravision.com/thm/it/it.m3u8',
    logo: ITV_LOGO,
    provider: 'itv',
    priority: 0.9,
    tags: ['world-cup', 'itv', 'spanish', 'live', 'iptv-org'],
  },
  {
    id: 'wc-itv-sports-hd',
    name: 'ITV Sports HD',
    url: 'https://cdn10.live-tv.cloud/itvrv/abr/playlist.m3u8',
    logo: ITV_LOGO,
    provider: 'itv',
    priority: 0.91,
    tags: ['world-cup', 'itv', 'live', 'iptv-org'],
  },
  {
    id: 'wc-itv-sports',
    name: 'ITV Sports',
    url: 'http://cdn10.live-tv.od.ua:8081/itvrv/abr/playlist.m3u8',
    logo: ITV_LOGO,
    provider: 'itv',
    priority: 0.92,
    tags: ['world-cup', 'itv', 'live', 'iptv-org'],
  },
  {
    id: 'wc-itv-sports-lq',
    name: 'ITV Sports (Mobile)',
    url: 'https://cdn10.live-tv.cloud/itvrv/abr-lq/playlist.m3u8',
    logo: ITV_LOGO,
    provider: 'itv',
    priority: 0.93,
    tags: ['world-cup', 'itv', 'mobile', 'iptv-org'],
  },
  // FIFA+ / TYC / Match (often show football)
  {
    id: 'wc-fifa-plus-en',
    name: 'FIFA+ English',
    url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8',
    logo: FIFA_LOGO,
    provider: 'fifa',
    priority: 13,
    tags: ['world-cup', 'fifa'],
  },
  {
    id: 'wc-fifa-plus-us',
    name: 'FIFA+ United States',
    url: 'https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8',
    logo: FIFA_LOGO,
    provider: 'fifa',
    priority: 14,
    tags: ['world-cup', 'fifa', 'usa'],
  },
  {
    id: 'wc-tyc',
    name: 'TYC Sports',
    url: 'https://amg26268-amg26268c14-freelivesports-emea-10267.playouts.now.amagi.tv/ts-us-e2-n2/playlist/amg26268-sportsstudio-tycsports-freelivesportsemea/playlist.m3u8',
    logo: TYC_LOGO,
    provider: 'international',
    priority: 15,
    tags: ['world-cup', 'tyc', 'argentina'],
  },
  {
    id: 'wc-match-strana',
    name: 'Match! Strana',
    url: 'http://31.148.48.15/Match_Strana/index.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    priority: 16,
    tags: ['world-cup', 'match', 'football'],
  },
  {
    id: 'wc-match-arena',
    name: 'Match! Arena',
    url: 'http://31.148.48.15/Match_Arena_HD/index.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    priority: 17,
    tags: ['world-cup', 'match', 'football'],
  },
  {
    id: 'wc-toursport',
    name: 'Tour Sport TV',
    url: 'https://fox.hostlagarto.com:8081/toursporttv/playlist.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    priority: 18,
    tags: ['world-cup', 'sports'],
  },
  {
    id: 'wc-premier1',
    name: 'Premier Sports 1',
    url: 'https://amg19223-amg19223c3-amgplt0351.playout.now3.amagi.tv/playlist/amg19223-amg19223c3-amgplt0351/playlist.m3u8',
    logo: PREMIER_LOGO,
    provider: 'international',
    priority: 19,
    tags: ['world-cup', 'premier'],
  },
  {
    id: 'wc-premier2',
    name: 'Premier Sports 2',
    url: 'https://amg19223-amg19223c4-amgplt0351.playout.now3.amagi.tv/playlist/amg19223-amg19223c4-amgplt0351/playlist.m3u8',
    logo: PREMIER_LOGO,
    provider: 'international',
    priority: 20,
    tags: ['world-cup', 'premier'],
  },
  // ── BTV Bangladesh (WC 2026 free-to-air) ───────────────────────────────────
  // Official player embeds (btvlive.gov.bd) — streams are CloudFront geo-gated
  // from this server, but the viewer's browser loads the official player with
  // their own IP (works for BD/IN and other allowed regions).
  // Secondary: bozztv HLS (AES-128; server decrypts when key is available).
  {
    id: 'wc-btv-national',
    name: 'BTV',
    url: 'https://www.btvlive.gov.bd/channel/BTV',
    logo: BTV_LOGO,
    provider: 'btv',
    type: 'embed',
    priority: 0.84,
    tags: ['world-cup', 'btv', 'bangladesh', 'live', 'official', 'embed'],
  },
  {
    id: 'wc-btv-news',
    name: 'BTV News',
    url: 'https://www.btvlive.gov.bd/channel/BTV-News',
    logo: BTV_NEWS_LOGO,
    provider: 'btv',
    type: 'embed',
    priority: 0.85,
    tags: ['world-cup', 'btv', 'bangladesh', 'news', 'official', 'embed'],
  },
  {
    id: 'wc-btv-chattogram-official',
    name: 'BTV Chattogram',
    url: 'https://www.btvlive.gov.bd/channel/BTV-Chattogram',
    logo: BTV_CTG_LOGO,
    provider: 'btv',
    type: 'embed',
    priority: 0.86,
    tags: ['world-cup', 'btv', 'bangladesh', 'live', 'official', 'embed'],
  },
  {
    id: 'wc-btv-chattogram',
    name: 'BTV Chattogram HD',
    url: 'https://bozztv.com/rongo/rongo-BTVChattagram/index.m3u8',
    logo: BTV_CTG_LOGO,
    provider: 'btv',
    type: 'hls',
    priority: 0.87,
    tags: ['world-cup', 'btv', 'bangladesh', 'live', 'iptv-org', 'bozztv'],
  },
  {
    id: 'wc-btv-world',
    name: 'BTV World',
    url: 'https://bozztv.com/rongo/rongo-BTVWorld/index.m3u8',
    logo: BTV_LOGO,
    provider: 'btv',
    type: 'hls',
    priority: 0.88,
    tags: ['world-cup', 'btv', 'bangladesh', 'live', 'iptv-org', 'bozztv'],
  },
  {
    id: 'wc-euro-bd',
    name: 'Euro Sports HD (BD)',
    url: 'https://stream.ottplus.bd/live/euro_sports_hd_abr/live/euro_sports_hd/chunks.m3u8',
    logo: FIFA_LOGO,
    provider: 'bdix',
    priority: 21,
    tags: ['world-cup', 'bangladesh'],
  },
  {
    id: 'wc-trace',
    name: 'Trace Sport Stars',
    url: 'https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    priority: 22,
    tags: ['world-cup', 'sports'],
  },
  {
    id: 'wc-free-sports',
    name: 'World of Free Sports',
    url: 'https://mainstreammedia-worldoffreesportsintl-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-mainstreammediafreesportsintl-rakuten/CDN/master.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    priority: 23,
    tags: ['world-cup', 'sports'],
  },
];

const PROVIDER_LABELS = {
  tsn: 'TSN Canada',
  tudn: 'TUDN',
  btv: 'BTV Bangladesh',
  bein: 'BeIN Sports',
  fox: 'Fox Sports',
  goltv: 'GolTV',
  cazetv: 'CazeTV',
  itv: 'ITV',
  fifa: 'FIFA+',
  international: 'International',
  bdix: 'BDIX / BD',
  toffee: 'Toffee BD',
};

// Serve immediately; refresh in the background. Deep-probing every request
// made the World Cup tab hang for minutes.
let cache = { channels: null, checkedAt: 0, ttl: 5 * 60 * 1000 };
let refreshInFlight = null;
const PROBE_BASE = process.env.FIFA_PROBE_BASE || 'http://127.0.0.1:4000';

export function getFifaChannelCatalog() {
  return FIFA_CHANNELS.map((ch) => {
    const type = ch.type || 'hls';
    const isEmbed = type === 'embed';
    return {
      ...ch,
      source: 'fifa',
      type,
      // Official embeds play in-browser iframe (not via HLS proxy)
      proxied: !isEmbed,
      group: 'World Cup',
      providerLabel: PROVIDER_LABELS[ch.provider] || 'World Cup Live',
      logo: ch.logo || FIFA_LOGO,
      status: 'live',
    };
  }).sort((a, b) => (a.priority || 99) - (b.priority || 99));
}

/** Instant list — no network probe (used for first paint). */
export function getInstantFifaChannels() {
  if (cache.channels?.length) return withoutToffee(cache.channels);
  return withoutToffee(getFifaChannelCatalog());
}

export function buildUpstreamHeaders(targetUrl = '') {
  let host = '';
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    /* ignore */
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
  };

  if (host.includes('andro.226503.xyz') || host.includes('fastly.net')) {
    headers.Referer = 'https://andro.226503.xyz/';
    headers.Origin = 'https://andro.226503.xyz';
  } else if (host.includes('online24.pm')) {
    headers.Referer = `http://${host}/`;
  } else if (host.includes('amagi.tv') || host.includes('xumo') || host.includes('playout.now') || host.includes('playouts.now')) {
    headers.Referer = host.includes('rakuten')
      ? 'https://www.rakuten.tv/'
      : 'https://www.xumo.tv/';
  } else if (host.includes('145.239.5.177')) {
    headers.Referer = 'http://145.239.5.177/';
  } else if (host.includes('wurl.com') || host.includes('wurl.tv')) {
    headers.Referer = 'https://www.rakuten.tv/';
  } else if (host.includes('ottplus.bd')) {
    headers.Referer = 'https://ottplus.bd/';
  } else if (host.includes('cloudfront.net')) {
    headers.Referer = 'https://www.samsung.com/';
  } else if (host.includes('23.237.104.106')) {
    headers.Referer = 'http://23.237.104.106:8080/';
  } else if (host.includes('otteravision')) {
    headers.Referer = 'https://www.roku.com/';
    headers.Origin = 'https://www.roku.com';
  } else if (host.includes('ottera.tv') || host.includes('ads.ottera')) {
    headers.Referer = 'https://www.xumo.tv/';
    headers.Origin = 'https://www.xumo.tv';
  } else if (host.includes('live-tv.od.ua') || host.includes('live-tv.cloud')) {
    headers.Referer = `https://${host}/`;
    headers.Origin = `https://${host}`;
  } else if (host.includes('aynaott.com')) {
    headers.Referer = 'https://tvsen6.aynaott.com/';
    headers.Origin = 'https://tvsen6.aynaott.com';
    headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  } else if (host.includes('bozztv.com')) {
    headers.Referer = 'https://bozztv.com/';
    headers.Origin = 'https://bozztv.com';
  } else if (host.includes('gia.tv')) {
    // RongoTV AES key host (used by bozztv BTV streams)
    headers.Referer = 'https://bozztv.com/';
    headers.Origin = 'https://bozztv.com';
    headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  } else if (host.includes('btvlive.gov.bd') || host.includes('streams.btvlive')) {
    headers.Referer = 'https://www.btvlive.gov.bd/';
    headers.Origin = 'https://www.btvlive.gov.bd';
  } else if (host.includes('hostlagarto')) {
    headers.Referer = 'https://fox.hostlagarto.com/';
  } else if (host.includes('41.205.70.146')) {
    headers.Referer = 'http://41.205.70.146/';
  } else if (host.includes('31.148.48.15')) {
    headers.Referer = 'http://31.148.48.15/';
  } else if (host.includes('40.160.24.')) {
    // TSN / CBS Sports Network / SNY family on this host
    headers.Referer = `http://${host}/`;
    headers.Origin = `http://${host}`;
  } else if (host.includes('alwaysdata.net')) {
    // TUDN PHP → HLS gateway
    headers.Referer = 'https://streaming.alwaysdata.net/';
    headers.Origin = 'https://streaming.alwaysdata.net';
  } else if (host.includes('univisionnow.com') || host.includes('univision.com')) {
    headers.Referer = 'https://www.tudn.com/';
    headers.Origin = 'https://www.tudn.com';
  } else if (host.includes('streamvidex') || host.includes('qzz.io')) {
    headers.Referer = 'https://streamvidex.qzz.io/';
    headers.Origin = 'https://streamvidex.qzz.io';
  } else if (host.includes('jmp2.uk')) {
    headers.Referer = 'https://jmp2.uk/';
  } else if (host.includes('nbcuni.com')) {
    headers.Referer = 'https://www.xumo.tv/';
  }

  return headers;
}

function agentFor(url) {
  try {
    return new URL(url).protocol === 'http:' ? httpAgent : insecureAgent;
  } catch {
    return insecureAgent;
  }
}

/**
 * Deep probe: master playlist → (optional) media playlist → first segment.
 * Requires a non-HTML body with real bytes (MPEG-TS sync or large payload).
 */
async function deepProbeChannel(channel) {
  try {
    const masterUrl = `${PROBE_BASE}/api/hls-proxy/manifest?url=${encodeURIComponent(channel.url)}`;
    const mr = await fetch(masterUrl, { timeout: 14_000 });
    if (!mr.ok) return false;
    const master = await mr.text();
    if (!master.includes('#EXTM3U')) return false;

    const lines = master.split('\n').map((l) => l.trim()).filter(Boolean);
    let mediaOrSeg = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1] && !lines[i + 1].startsWith('#')) {
        mediaOrSeg = lines[i + 1];
        break;
      }
    }
    if (!mediaOrSeg) {
      mediaOrSeg = lines.find((l) => !l.startsWith('#'));
    }
    if (!mediaOrSeg) return false;

    const abs = mediaOrSeg.startsWith('/')
      ? `${PROBE_BASE}${mediaOrSeg}`
      : mediaOrSeg.startsWith('http')
        ? mediaOrSeg
        : null;
    if (!abs) return false;

    // If it's a media playlist, resolve first segment
    if (abs.includes('hls-proxy/manifest') || abs.includes('.m3u8')) {
      const pr = await fetch(abs, { timeout: 14_000 });
      if (!pr.ok) return false;
      const playlist = await pr.text();
      if (!playlist.includes('#EXTM3U')) return false;
      const segLine = playlist.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
      if (!segLine) return false;
      const segUrl = segLine.startsWith('/')
        ? `${PROBE_BASE}${segLine}`
        : segLine.startsWith('http')
          ? segLine
          : null;
      if (!segUrl) return false;
      const sr = await fetch(segUrl, { timeout: 14_000 });
      if (!sr.ok) return false;
      const buf = Buffer.from(await sr.arrayBuffer());
      if (buf.length < 8_000) return false;
      // Reject HTML error pages
      if (buf[0] === 0x3c) return false;
      return true;
    }

    // Direct segment from master (media playlist style)
    const sr = await fetch(abs, { timeout: 14_000 });
    if (!sr.ok) return false;
    const buf = Buffer.from(await sr.arrayBuffer());
    if (buf.length < 8_000) return false;
    if (buf[0] === 0x3c) return false;
    return true;
  } catch {
    return false;
  }
}

/** Toffee streams disabled — CDN is geo-blocked / unreliable for this host. */
async function loadToffeeSportsChannels() {
  return [];
}

function isToffeeChannel(ch = {}) {
  const src = String(ch.source || '').toLowerCase();
  const prov = String(ch.provider || '').toLowerCase();
  const url = String(ch.url || '').toLowerCase();
  return (
    src === 'toffee'
    || prov === 'toffee'
    || url.includes('toffeelive.com')
    || url.includes('cdn-tt.pages.dev')
  );
}

function withoutToffee(channels = []) {
  return (channels || []).filter((ch) => !isToffeeChannel(ch));
}

/**
 * Fast path for the homepage:
 *  - Always return immediately (cache or curated catalog)
 *  - Kick off a background refresh when stale (never blocks the request)
 *
 * This fixes the World Cup tab spinning forever while deep-probes run.
 */
export async function fetchLiveFifaChannels({ refresh = false } = {}) {
  const now = Date.now();
  const fresh = cache.channels && now - cache.checkedAt < cache.ttl;

  if (fresh && !refresh) {
    return withoutToffee(cache.channels);
  }

  // Start background refresh if not already running
  if (!refreshInFlight) {
    refreshInFlight = refreshLiveCatalog()
      .catch((err) => {
        console.warn('[fifa] background refresh failed:', err.message);
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  // If we have any previous result, serve it now
  if (cache.channels?.length) {
    return withoutToffee(cache.channels);
  }

  // Cold start: seed cache with curated list immediately (no probe wait)
  const instant = withoutToffee(getFifaChannelCatalog());
  cache = { channels: instant, checkedAt: 0, ttl: cache.ttl }; // checkedAt=0 → keep refreshing
  return instant;
}

/** Full probe + iptv-org merge — runs in background only. */
async function refreshLiveCatalog() {
  const started = Date.now();
  console.log('[fifa] background catalog refresh starting…');

  const catalog = getFifaChannelCatalog();
  const live = [];
  // Fast probe: only check master playlist (not full segment chain) for speed
  const batchSize = 8;
  for (let i = 0; i < catalog.length; i += batchSize) {
    const batch = catalog.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (channel) => ({
        channel,
        ok: await quickProbeChannel(channel),
      }))
    );
    for (const r of results) {
      if (r.ok) live.push({ ...r.channel, status: 'live' });
    }
  }

  // If probes wiped almost everything (proxy cold / network blip), keep catalog
  const base = live.length >= 4 ? live : catalog.map((c) => ({ ...c, status: 'live', probeSkipped: true }));

  let iptvOrg = [];
  try {
    const { fetchLiveIptvOrgChannels } = await import('./iptvOrgService.js');
    // Don't force full re-download every time
    iptvOrg = await fetchLiveIptvOrgChannels({ refresh: false });
  } catch (err) {
    console.warn('[fifa] iptv-org merge failed:', err.message);
  }

  // Toffee intentionally not merged (streams offline / geo-blocked)

  const merged = [...base];
  const seen = new Set(merged.map((c) => c.url));
  const seenNames = new Set(merged.map((c) => c.name.toLowerCase()));

  for (const ch of iptvOrg) {
    if (isToffeeChannel(ch)) continue;
    if (seen.has(ch.url)) continue;
    const key = ch.name.toLowerCase();
    if (seenNames.has(key)) continue;
    merged.push({ ...ch, status: 'live' });
    seen.add(ch.url);
    seenNames.add(key);
  }

  const clean = withoutToffee(merged).sort(
    (a, b) => (a.priority || 99) - (b.priority || 99)
  );
  cache = { channels: clean, checkedAt: Date.now(), ttl: cache.ttl };
  console.log(
    `[fifa] background refresh done in ${Date.now() - started}ms → ${clean.length} channels (toffee excluded)`
  );
  return clean;
}

/** Fast probe: only requires a valid m3u8 via our proxy (≤6s). */
async function quickProbeChannel(channel) {
  try {
    // Official embeds (btvlive channel pages) always pass — no m3u8 to probe.
    if (channel?.type === 'embed' || /btvlive\.gov\.bd\/channel\//i.test(channel?.url || '')) {
      return true;
    }
    const masterUrl = `${PROBE_BASE}/api/hls-proxy/manifest?url=${encodeURIComponent(channel.url)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const mr = await fetch(masterUrl, { signal: controller.signal, timeout: 6000 });
    clearTimeout(timer);
    if (!mr.ok) return false;
    const master = await mr.text();
    return master.includes('#EXTM3U');
  } catch {
    return false;
  }
}

// Kick off a non-blocking warm-up shortly after the module loads
setTimeout(() => {
  fetchLiveFifaChannels({ refresh: true }).catch(() => {});
}, 3000);

export function getFifaChannelsByProvider(channels = []) {
  const groups = new Map();
  const order = [
    'tsn',
    'tudn',
    'btv',
    'bein',
    'fox',
    'goltv',
    'cazetv',
    'itv',
    'fifa',
    'bdix',
    'international',
  ];

  for (const channel of withoutToffee(channels)) {
    const key = channel.provider || 'other';
    if (key === 'toffee') continue;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: channel.providerLabel || PROVIDER_LABELS[key] || 'World Cup Live',
        channels: [],
      });
    }
    groups.get(key).channels.push(channel);
  }

  const ordered = [];
  for (const key of order) {
    if (groups.has(key)) ordered.push(groups.get(key));
  }
  for (const [key, group] of groups) {
    if (!order.includes(key)) ordered.push(group);
  }
  return ordered;
}

export function isProxiedPlaybackUrl(url = '') {
  const lower = String(url).toLowerCase();
  // Proxy virtually all remote HLS for World Cup / iptv-org so playback stays on-site.
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    // Skip same-origin already-proxied URLs
    if (lower.includes('/api/hls-proxy/')) return false;
    return true;
  }
  return false;
}
