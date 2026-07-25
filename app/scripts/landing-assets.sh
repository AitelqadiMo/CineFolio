#!/usr/bin/env bash
# Generates the landing page's self-hosted image assets (they are derived
# artifacts, not sources, so they are built rather than committed):
#   public/reel/cut{1..4}.jpg   posters for the four reel videos (first frames)
#   public/img/bento-{edge,engine}.jpg  compressed tile art (~80KB each; the
#     old hot-linked originals were ~2.5MB PNGs on a third-party host)
# Needs: curl, ffmpeg, python3 with Pillow. Run from app/: bash scripts/landing-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/reel public/img
CDN="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy"
VIDS="hf_20260704_212954_8600e4c3-1335-4834-92f3-59c79847edca.mp4 hf_20260704_212957_b65bc691-59f0-4da6-be3a-0e33f63a2fd3.mp4 hf_20260704_213719_17a92337-a259-4517-b389-46e2e81637d9.mp4 hf_20260704_144445_9a107d74-7c29-43d9-99b0-5b9fbb397144.mp4"
n=1
for v in $VIDS; do
  echo "==> poster $n"
  curl -sf -o "/tmp/cf-cut$n.mp4" "$CDN/$v"
  ffmpeg -y -loglevel error -ss 0.5 -i "/tmp/cf-cut$n.mp4" -frames:v 1 -vf "scale=720:-2" -q:v 3 "public/reel/cut$n.jpg"
  rm -f "/tmp/cf-cut$n.mp4"
  n=$((n+1))
done
echo "==> bento tiles"
curl -sf -o /tmp/cf-bento1.png "https://pub.hyperagent.com/api/published/pbf01KWSRVRQD_0M8HZ70MCMA3Y4X7/50e7a154-67fa-478b-b4b7-74fe378b3dc4.png"
curl -sf -o /tmp/cf-bento2.png "https://pub.hyperagent.com/api/published/pbf01KWSRW0ED_ZR9N5ZQNE3HG4577/dde0b377-b779-4c7b-a448-88f1e8d57626.png"
python3 - <<'PY'
from PIL import Image
for src, dst in [("/tmp/cf-bento1.png", "public/img/bento-edge.jpg"), ("/tmp/cf-bento2.png", "public/img/bento-engine.jpg")]:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if w > 1200:
        im = im.resize((1200, int(h * 1200 / w)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=78, optimize=True, progressive=True)
    print("wrote", dst)
PY
ls -la public/reel public/img
echo "done: 6 assets in public/"
