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

The repository keeps the interface, metadata, and thumbnails in GitHub Pages. MP4 files are served from Cloudflare R2 or Backblaze B2 through Cloudflare CDN for fast range requests and stable video scrubbing.

## Current archive size

- 648 archive items
- 648 MP4 clips across Cloudflare R2 and Backblaze B2
- 648 JPEG thumbnails

## Usage

Open the live site, choose a category filter, then select a clip. Clip detail pages scrub through CDN-hosted video using page scroll.

## GitHub Pages note

The empty `.nojekyll` file tells GitHub Pages to bypass Jekyll processing and serve this repository as a plain static site. It is intentionally kept so assets and routes are published exactly as committed.

## Performance note

MP4 delivery uses object storage instead of GitHub Pages. Cloudflare R2 and Backblaze B2 keep video files outside the GitHub Pages build, support byte-range requests, and let the archive page stay small while scroll-scrubbing video.

Current media bases:

```txt
https://source-media.oosu.dev/media/
https://source-media-b2.oosu.dev/media/
```
