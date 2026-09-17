# Tdarr on the DS920+

UI: https://tdarr.ambitiouscake.com through the DSM reverse proxy, with Tdarr authentication enabled. Configure the DSM destination as HTTP `127.0.0.1:8265` and enable WebSocket headers. Port 8265 is published only on host loopback, matching the other DVR services; direct LAN access is not published. The former `TDARR_BIND_IP` setting is no longer used. Server API and node ports are not published. Persistent state is under `/volume1/dkrcfg/tdarr`. The Intel render group is 937 on this NAS.

Synology requires bind source directories to exist before container startup. On a new NAS installation, create `server`, `configs`, `logs` and `pilot` inside `/volume1/dkrcfg/tdarr`, plus `/volume1/tdarr-cache`, owned by the stack's PUID/PGID (1027:100 here). Do not recursively change ownership of the media libraries. DSM does not support NanoCPUs/CFS quotas on this host; `TDARR_CPUSET=2,3` provides CPU affinity instead.

One QSV worker, two CPU cores and 4 GiB RAM limit impact on Plex. Libraries control processing schedules; workers can resume after restart. Cache is `/volume1/tdarr-cache`; do not put cache in a watched library. The tested image is pinned by digest and automatic image updates are disabled; test upgrades before resuming jobs.

With authentication enabled, the internal node needs a service API key too. Keep a randomly generated `tapi_` key in the server config's `seededApiKey` and the node config's `apiKey`; restrict both config files to the service owner. These persistent files are not committed. Set the human login separately in the UI.

Import `sdr-hevc-flow.json` into Tdarr Flows. Start with a library rooted at `/pilot`, containing copies of representative files. Use `/temp` for transcode cache. Only assign the flow to `/tv` and `/movies` after the pilot passes and playback quality is reviewed. Do not use Tdarr's default conversion stack alongside this flow.

`configure.cjs` reapplies this deployment's managed flow, TV/movie libraries and node worker limits through the authenticated API. Copy it beside the flow JSON in `/app/configs` and run `node /app/configs/configure.cjs` inside the container to configure paused libraries. After the pilot, `--enable-libraries` enables them for 01:00–06:00 Australia/Sydney, with hourly folder checks and a 24-hour hold on new files. Separate library health-check queues are disabled because every conversion already receives a strict full decode check. Keep a backup of settings before reapplying if they have been customized in the UI.

The flow converts progressive SDR H.264 MKV up to 1080p to HEVC Main10, Intel QSV quality 22, slow preset. It copies audio, subtitles and attachments and preserves metadata and chapters. HEVC, HDR/Dolby Vision, unknown transfer characteristics, interlaced material, hardlinks and recently modified library files are skipped. HDR acquisition remains managed by Recyclarr's DV-without-fallback rejection rule.

Replacement requires 10–90% of original size, duration within 0.1%, a full decode health check, matching streams, dimensions, languages and track dispositions, and an unchanged source. Errors stop before replacement. The flow reserves 500 GiB plus twice the source size on cache and source filesystems. Successful replacement is lossy and removes the old file; validation cannot prove visual quality or replace a backup. Keep pilot originals outside the watched pilot directory for comparison.

Run safety tests with `node --test stack/config/tdarr/safety.test.cjs`. The JSON embeds the JavaScript source; regenerate embedded code when editing a script. Tests detect drift.

## Backlog operation and assessment

Run `node stack/config/tdarr/build-flows.cjs` after editing a script. The encoder
explicitly copies each stream's disposition flags, including `0` when no flags
are set. This prevents FFmpeg from automatically making an audio/subtitle track
default. Final validation still rejects changed default/forced flags and now
identifies the offending stream and flag.

For a temporary 24/7 catch-up window, run `configure.cjs --enable-libraries --backlog`
inside the container. The single QSV worker, CPU affinity, memory limit, 24-hour
new-file hold and replacement checks remain unchanged. Restore overnight operation
with `configure.cjs --enable-libraries` (omit `--backlog`). Library names retain
their existing identity. The schedule does not automatically revert when the
queue empties. Observe Plex playback before leaving continuous processing enabled.

The Home queue excludes libraries outside their schedules. Use **Stats → All
Libraries → Transcode → Queued** for the full pending inventory; queued does not
mean eligible for conversion.

`backlog-audit-flow.json` is an isolated, non-replacing pilot flow. Import it,
temporarily assign it to the `/pilot` library, enable pilot transcodes and requeue
**one** existing pilot file. Restore the pilot's previous flow and disabled state
after it finishes. Do not assign it to TV or Movies. It:

- Reads the indexed TV/movie inventory and checks current filesystem metadata
  for candidates using the production eligibility function, without modifying
  production queue statuses or media.
- Writes `assessment.json` and a settings snapshot under a uniquely named
  `/app/logs/tdarr-backlog-*` directory and logs category counts in the job report.
- Generates ten-second QSV samples from the three known failed movie originals
  under `/temp/tdarr-disposition-test-*`, reproduces the unfixed flag change on
  Alpha, and requires stream validation and strict decode to pass on all fixed
  outputs. These samples verify the disposition repair, not whole-film quality
  or duration. Normal jobs still perform all whole-file checks.
- Records the verification result in `regression.json`. It never replaces the
  original pilot file. Sample and report directories are retained for inspection.

The three regression source paths are specific to this deployment. Adjust them
in `backlog-audit.js` for another installation. Rerun discovery scans before an
audit if indexed codec/HDR metadata may be stale. Eligibility and free space are
checked again by the normal flow at processing time; savings are not guaranteed.
