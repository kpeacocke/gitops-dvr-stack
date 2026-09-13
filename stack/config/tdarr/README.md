# Tdarr on the DS920+

UI: http://192.168.3.100:8265 (LAN only, authentication enabled). Server API and node ports are not published. Persistent state is under `/volume1/dkrcfg/tdarr`. The Intel render group is 937 on this NAS.

Synology requires bind source directories to exist before container startup. On a new NAS installation, create `server`, `configs`, `logs` and `pilot` inside `/volume1/dkrcfg/tdarr`, plus `/volume1/tdarr-cache`, owned by the stack's PUID/PGID (1027:100 here). Do not recursively change ownership of the media libraries. DSM does not support NanoCPUs/CFS quotas on this host; `TDARR_CPUSET=2,3` provides CPU affinity instead.

One QSV worker, two CPU cores and 4 GiB RAM limit impact on Plex. Libraries control processing schedules; workers can resume after restart. Cache is `/volume1/tdarr-cache`; do not put cache in a watched library. The tested image is pinned by digest and automatic image updates are disabled; test upgrades before resuming jobs.

With authentication enabled, the internal node needs a service API key too. Keep a randomly generated `tapi_` key in the server config's `seededApiKey` and the node config's `apiKey`; restrict both config files to the service owner. These persistent files are not committed. Set the human login separately in the UI.

Import `sdr-hevc-flow.json` into Tdarr Flows. Start with a library rooted at `/pilot`, containing copies of representative files. Use `/temp` for transcode cache. Only assign the flow to `/tv` and `/movies` after the pilot passes and playback quality is reviewed. Do not use Tdarr's default conversion stack alongside this flow.

`configure.cjs` reapplies this deployment's managed flow, TV/movie libraries and node worker limits through the authenticated API. Copy it beside the flow JSON in `/app/configs` and run `node /app/configs/configure.cjs` inside the container to configure paused libraries. After the pilot, `--enable-libraries` enables them for 01:00–06:00 Australia/Sydney, with hourly folder checks and a 24-hour hold on new files. Separate library health-check queues are disabled because every conversion already receives a strict full decode check. Keep a backup of settings before reapplying if they have been customized in the UI.

The flow converts progressive SDR H.264 MKV up to 1080p to HEVC Main10, Intel QSV quality 22, slow preset. It copies audio, subtitles and attachments and preserves metadata and chapters. HEVC, HDR/Dolby Vision, unknown transfer characteristics, interlaced material, hardlinks and recently modified library files are skipped. HDR acquisition remains managed by Recyclarr's DV-without-fallback rejection rule.

Replacement requires 10–90% of original size, duration within 0.1%, a full decode health check, matching streams, dimensions, languages and track dispositions, and an unchanged source. Errors stop before replacement. The flow reserves 500 GiB plus twice the source size on cache and source filesystems. Successful replacement is lossy and removes the old file; validation cannot prove visual quality or replace a backup. Keep pilot originals outside the watched pilot directory for comparison.

Run safety tests with `node --test stack/config/tdarr/safety.test.cjs`. The JSON embeds the JavaScript source; regenerate embedded code when editing a script. Tests detect drift.
