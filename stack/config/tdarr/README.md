# Tdarr on the DS920+

UI: http://192.168.3.100:8265 (LAN only, authentication enabled). Server API and node ports are not published. Persistent state is under `/volume1/dkrcfg/tdarr`. The Intel render group is 937 on this NAS.

One QSV worker, two CPU cores and 4 GiB RAM limit impact on Plex. Workers start paused for commissioning. Cache is `/volume1/tdarr-cache`; do not put cache in a watched library. Automatic image updates are disabled; test upgrades before resuming jobs.

Import `sdr-hevc-flow.json` into Tdarr Flows. Start with a library rooted at `/pilot`, containing copies of representative files. Use `/temp` for transcode cache. Only assign the flow to `/tv` and `/movies` after the pilot passes and playback quality is reviewed. Do not use Tdarr's default conversion stack alongside this flow.

The flow converts progressive SDR H.264 MKV up to 1080p to HEVC Main10, Intel QSV quality 22, slow preset. It copies audio, subtitles and attachments and preserves metadata and chapters. HEVC, HDR/Dolby Vision, unknown transfer characteristics, interlaced material, hardlinks and recently modified library files are skipped. HDR acquisition remains managed by Recyclarr's DV-without-fallback rejection rule.

Replacement requires 10–90% of original size, duration within 0.1%, a full decode health check, matching streams, dimensions, languages and track dispositions, and an unchanged source. Errors stop before replacement. The flow reserves 500 GiB plus twice the source size on cache and source filesystems. Successful replacement is lossy and removes the old file; validation cannot prove visual quality or replace a backup. Keep pilot originals outside the watched pilot directory for comparison.

Run safety tests with `node --test stack/config/tdarr/safety.test.cjs`. The JSON embeds the JavaScript source; regenerate embedded code when editing a script. Tests detect drift.
