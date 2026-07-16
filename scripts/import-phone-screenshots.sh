#!/usr/bin/env bash
# Import reference screenshots from Android storage into docs/screenshots.
# Run this in Termux on your phone (after termux-setup-storage).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/docs/screenshots"
FILES=(
  "IMG_20260709_211037_349.jpg"
  "grok_image_1783608974560.jpg"
)

mkdir -p "$DEST"

SEARCH_DIRS=(
  "$HOME/storage/shared/Download"
  "$HOME/storage/shared/Downloads"
  "$HOME/storage/shared/Pictures"
  "$HOME/storage/shared/Pictures/Screenshots"
  "$HOME/storage/shared/DCIM/Camera"
  "$HOME/storage/shared/DCIM/Screenshots"
  "$HOME/Download"
  "$HOME/Downloads"
  "$ROOT"
)

found=0
for name in "${FILES[@]}"; do
  if [[ -f "$DEST/$name" ]]; then
    echo "OK already in place: $DEST/$name"
    found=$((found + 1))
    continue
  fi
  hit=""
  for dir in "${SEARCH_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    if [[ -f "$dir/$name" ]]; then
      hit="$dir/$name"
      break
    fi
  done
  if [[ -z "$hit" ]]; then
    hit="$(find "$HOME/storage" -maxdepth 5 -name "$name" 2>/dev/null | head -1 || true)"
  fi
  if [[ -n "$hit" && -f "$hit" ]]; then
    cp "$hit" "$DEST/$name"
    echo "Imported: $hit -> $DEST/$name"
    found=$((found + 1))
  else
    echo "MISSING: $name (not found in phone storage)"
  fi
done

echo ""
echo "Screenshots folder:"
ls -la "$DEST" || true

if [[ "$found" -eq "${#FILES[@]}" ]]; then
  echo ""
  echo "All reference images ready. Tell Grok:"
  echo "  @docs/screenshots/IMG_20260709_211037_349.jpg"
  echo "  @docs/screenshots/grok_image_1783608974560.jpg"
  exit 0
fi

echo ""
echo "Run once: termux-setup-storage"
echo "Then save/download the images on your phone and run this script again."
exit 1