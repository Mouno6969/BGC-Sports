// ---------------------------------------------------------------------------
// ProfileSettingsModal — optional profile editor (name, DOB, picture,
// address, bio). Everything is optional; users who skip it keep their
// auto-generated guest name (e.g. "SwiftFalcon42").
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import {
  getProfile,
  saveProfile,
  clearProfile,
  getGuestName,
  fileToCompressedAvatar,
  MAX_NAME_LEN,
  MAX_ADDRESS_LEN,
  MAX_BIO_LEN,
} from '../lib/profile.js';
import UserAvatar from './UserAvatar.jsx';
import { showToast } from './Toast.jsx';

export default function ProfileSettingsModal({ open, onClose }) {
  const [form, setForm] = useState(getProfile);
  const [avatarError, setAvatarError] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const guestName = getGuestName();

  // Reload the saved profile every time the modal opens.
  useEffect(() => {
    if (open) {
      setForm(getProfile());
      setAvatarError(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await fileToCompressedAvatar(file);
      update('avatar', dataUrl);
    } catch (err) {
      setAvatarError(err.message || 'Could not process the image');
    }
  }

  function handleSave(e) {
    e?.preventDefault();
    setSaving(true);
    saveProfile(form);
    setSaving(false);
    showToast('Profile saved', 'success');
    onClose();
  }

  function handleClear() {
    clearProfile();
    setForm(getProfile());
    showToast('Profile cleared — you are back to your guest name', 'success');
    onClose();
  }

  const previewName = (form.displayName || '').trim() || guestName;
  const isGuest = !(form.displayName || '').trim();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Profile settings"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Profile Settings</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Everything is optional. Skip it and you'll appear as{' '}
              <span className="font-semibold text-[var(--accent)]">{guestName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile settings"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Avatar picker + live preview */}
        <div className="mb-5 flex items-center gap-4">
          <div className="relative">
            <UserAvatar name={previewName} avatar={form.avatar} color="#22c55e" size="xl" />
            {form.avatar && (
              <button
                type="button"
                onClick={() => update('avatar', '')}
                aria-label="Remove profile picture"
                title="Remove picture"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{previewName}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {isGuest ? 'Guest (auto-generated name)' : 'Custom profile'}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              {form.avatar ? 'Change picture' : 'Upload picture'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFile}
              className="hidden"
              aria-label="Upload profile picture"
            />
          </div>
        </div>
        {avatarError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
            {avatarError}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label htmlFor="profile-name" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Display name
            </label>
            <input
              id="profile-name"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              placeholder={`Leave empty to stay as ${guestName}`}
              maxLength={MAX_NAME_LEN}
              className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
            />
          </div>

          <div>
            <label htmlFor="profile-dob" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Date of birth
            </label>
            <input
              id="profile-dob"
              type="date"
              value={form.dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => update('dob', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 [color-scheme:dark]"
            />
          </div>

          <div>
            <label htmlFor="profile-address" className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Address
            </label>
            <input
              id="profile-address"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="City, Country"
              maxLength={MAX_ADDRESS_LEN}
              className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="profile-bio" className="block text-xs font-semibold text-[var(--text-secondary)]">
                Bio
              </label>
              <span className="text-[10px] text-[var(--text-muted)]">{form.bio.length}/{MAX_BIO_LEN}</span>
            </div>
            <textarea
              id="profile-bio"
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="Tell people a little about yourself…"
              maxLength={MAX_BIO_LEN}
              rows={3}
              className="w-full resize-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
            />
          </div>

          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            Your name and picture are shown in the live chat, watch party rooms, and calls.
            Date of birth, address, and bio stay private on this device.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.98] disabled:opacity-60"
            >
              Save Profile
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98]"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
