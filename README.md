# Source Archive

A static source archive for reviewing, filtering, and scroll-scrubbing curated visual reference clips.

## Live site

https://oosuhada.github.io/source-archive/

## Structure

```txt
index.html
styles/
data/
assets/thumbs/
```

- `index.html` — the archive interface
- `styles/` — archive and detail-page styling
- `data/` — archive metadata and manifest files
- `assets/thumbs/` — JPEG thumbnails referenced by the archive

The repository keeps the interface, metadata, and thumbnails in GitHub Pages. MP4 files are served from Cloudflare R2 for faster range requests and more stable video scrubbing.

## Current archive size

- 274 archive items
- 274 MP4 clips in Cloudflare R2
- 274 JPEG thumbnails

## Usage

Open the live site, choose a category filter, then select a clip. Clip detail pages scrub through R2-hosted video using page scroll.

## GitHub Pages note

The empty `.nojekyll` file tells GitHub Pages to bypass Jekyll processing and serve this repository as a plain static site. It is intentionally kept so assets and routes are published exactly as committed.

## Performance note

MP4 delivery uses Cloudflare R2 instead of GitHub Pages. R2 keeps the video files outside the GitHub Pages build, supports byte-range requests, and lets the archive page stay small while scroll-scrubbing video from object storage.

Current R2 media base:

```txt
https://source-media.oosu.dev/media/
```
