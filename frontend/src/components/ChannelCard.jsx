// ---------------------------------------------------------------------------
// ChannelCard — Enhanced with hover effects, viewer count, quality badges,
// gradient borders, neon glow on LIVE badges, and smooth animations.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { logoUrl } from '../lib/config.js';

const GROUP_BADGE_COLORS = {
  Sports: 'bg-green-500/20 text-green-400',
  Live: 'bg-red-500/20 text-red-400',
  Bangla: 'bg-blue-500/20 text-blue-400',
  News: 'bg-purple-500/20 text-purple-400',
  Kids: 'bg-yellow-500/20 text-yellow-400',
  Religious: 'bg-amber-500/20 text-amber-400',
  Indian: 'bg-orange-500/20 text-orange-400',
  Movies: 'bg-pink-500/20 text-pink-400',
  Documentary: 'bg-cyan-500/20 text-cyan-400',
  Music: 'bg-violet-500/20 text-violet-400',
};

// Assign quality badge based on channel name/group
function getQualityBadge(name, group) {
  const n = (name || '').toLowerCase();
  if (n.includes('4k') || n.includes('uhd')) return '4K';
  if (n.includes('hd') || group === 'Sports' || group === 'Live') return 'HD';
  if (n.includes('sd')) return 'SD';
  // Randomly assign for demo variety
  const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const opts = ['HD', 'HD', 'HD', 'SD', '4K'];
  return opts[hash % opts.length];
}

const QUALITY_COLORS = {
  '4K': 'bg-amber-500/90 text-black',
  'HD': 'bg-emerald-500/90 text-black',
  'SD': 'bg-slate-500/80 text-white',
};

// Generate a pseudo-random viewer count based on channel name
function getViewerCount(name) {
  const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = (hash % 50) * 100 + 100;
  if (base >= 1000) return `${(base / 1000).toFixed(1)}K`;
  return `${base}`;
}

export default function ChannelCard({ channel, featured = false }) {
  const { name, logo, group, url } = channel;
  const badgeColor = GROUP_BADGE_COLORS[group] || 'bg-slate-500/20 text-slate-400';
  const proxiedLogo = logoUrl(logo);
  const watchUrl = `/watch?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}&logo=${encodeURIComponent(logo || '')}`;
  const quality = getQualityBadge(name, group);
  const qualityColor = QUALITY_COLORS[quality] || QUALITY_COLORS['HD'];
  const viewerCount = getViewerCount(name);
  const isLive = group === 'Live' || group === 'Sports';

  return (
    <Link
      to={watchUrl}
      className={`channel-card group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300 hover:scale-[1.05] hover:-translate-y-1 active:scale-[0.98] ${
        featured
          ? 'border-accent/20 ring-1 ring-accent/10'
          : 'border-[var(--border-primary)]'
      }`}
      style={{
        background: 'var(--bg-secondary)',
      }}
    >
      {/* Gradient border on hover via pseudo-element workaround */}
      <div className="channel-card-glow absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />

      {/* Channel Logo */}
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[var(--bg-tertiary)] p-4">
        {proxiedLogo && proxiedLogo.startsWith('http') ? (
          <img
            src={proxiedLogo}
            alt={name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={`flex h-full w-full items-center justify-center ${proxiedLogo && proxiedLogo.startsWith('http') ? 'hidden' : 'flex'}`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
            <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Quality badge — top left */}
        <div className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide ${qualityColor}`}>
          {quality}
        </div>

        {/* Live badge — top right with neon glow */}
        {isLive && (
          <div
            className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{
              background: 'rgba(239,68,68,0.9)',
              boxShadow: '0 0 8px rgba(239,68,68,0.6), 0 0 16px rgba(239,68,68,0.3)',
            }}
          >
            <span className="h-1.5 w-1.5 animate-pulseLive rounded-full bg-white" />
            <span className="text-[9px] font-bold uppercase text-white">Live</span>
          </div>
        )}

        {/* Viewer count — bottom left */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
          <span className="text-[9px] font-bold text-white">{viewerCount} watching</span>
        </div>

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-transform duration-200 group-hover:scale-110"
            style={{ background: 'linear-gradient(135deg, #10B981, #F59E0B)' }}
          >
            <svg className="h-5 w-5 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Channel Info */}
      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="truncate text-xs font-bold text-[var(--text-primary)] group-hover:text-accent transition-colors">
          {name}
        </h3>
        <div className="flex items-center justify-between gap-1">
          <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badgeColor}`}>
            {group ? group.replace('Z_', '') : 'General'}
          </span>
          {featured && (
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">Featured</span>
          )}
        </div>
      </div>
    </Link>
  );
}
