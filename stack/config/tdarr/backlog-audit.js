// Run only on a disposable pilot record. Never replaces media or changes queues.
module.exports = async (args) => {
  const fs = require('fs').promises;
  const path = require('path');
  const { spawn } = require('child_process');
  if (!args.inputFileObj._id.startsWith('/pilot/')) throw new Error('Audit must run in pilot library');
  const eligibility = /* EMBED_ELIGIBILITY */ null;
  const encode = /* EMBED_ENCODE */ null;
  const validate = /* EMBED_VALIDATE */ null;
  const health = /* EMBED_HEALTH */ null;
  if (!eligibility || !encode || !validate || !health) throw new Error('Use generated audit flow');
  const directory = await fs.mkdtemp('/app/logs/tdarr-backlog-');
  const read = (collection, mode = 'getAll', id = '') => args.deps.crudTransDBN(collection, mode, id, {});
  const flow = await read('FlowsJSONDB', 'getById', 'ds920-sdr-hevc');
  const libraries = await read('LibrarySettingsJSONDB');
  await fs.writeFile(path.join(directory, 'settings-before.json'), JSON.stringify({ flow, libraries }, null, 2));
  const raw = await read('FileJSONDB');
  const files = (Array.isArray(raw) ? raw : Object.values(raw)).filter(f =>
    f && typeof f._id === 'string' && (f._id.startsWith('/tv/') || f._id.startsWith('/movies/')));
  if (!files.length) throw new Error('No production inventory returned; refusing an empty assessment');
  const summary = { indexed: files.length, byLibrary: {}, reasons: {}, candidateBytes: 0,
    candidateDurationSeconds: 0, candidateDurationUnknown: 0, candidatesByStatus: {} };
  const rows = [];
  async function assessFile(indexedFile) {
    let file = indexedFile;
    const indexedVideos = (file.ffProbeData?.streams || []).filter(s => s.codec_type === 'video');
    // FileJSONDB stores abbreviated probe data. Never interpret omitted transfer
    // metadata as an authoritative skip: get a fresh probe for H.264 candidates.
    if (indexedVideos.length === 1 && indexedVideos[0].codec_name === 'h264'
        && !(indexedVideos[0].width > 1920 || indexedVideos[0].height > 1080)) {
      try {
        const scanned = await args.scanIndividualFile({ _id: file._id, file: file._id,
          DB: file.DB, footprintId: file.footprintId },
          { exifToolScan: false, mediaInfoScan: true, closedCaptionScan: false });
        file = { ...file, ffProbeData: scanned.ffProbeData, mediaInfo: scanned.mediaInfo };
      } catch (e) {
        file = { ...file, auditProbeError: e.code || 'scan-failed' };
      }
    }
    const library = file._id.startsWith('/tv/') ? 'TV' : 'Movies';
    const videos = (file.ffProbeData?.streams || []).filter(s => s.codec_type === 'video');
    const video = videos[0] || {};
    let reason;
    if (file.auditProbeError) reason = `probe-error:${file.auditProbeError}`;
    else if (!/\.mkv$/i.test(file._id)) reason = 'container';
    else if (videos.length !== 1) reason = 'video-stream-count';
    else if (video.codec_name !== 'h264') reason = `codec:${video.codec_name || 'unknown'}`;
    else if (video.width > 1920 || video.height > 1080) reason = 'above-1080p';
    else if (/dovi|dolby|hdr|smpte2084|arib-std-b67/i.test(JSON.stringify(video.side_data_list || []))
      || /hdr|dolby vision/i.test(JSON.stringify(file.mediaInfo?.track?.map(t => t.HDR_Format) || []))
      || ['smpte2084', 'arib-std-b67'].includes(video.color_transfer)) reason = 'HDR';
    else if (!['bt709', 'smpte170m', 'bt470bg'].includes(video.color_transfer)) reason = 'unknown-transfer';
    else if (!['progressive', 'unknown', undefined].includes(video.field_order)) reason = 'interlaced';
    let size = Number(file.ffProbeData?.format?.size) || 0;
    if (!reason) {
      try {
        const stat = await fs.stat(file._id);
        size = stat.size;
        if (stat.nlink > 1) reason = 'hardlinked';
        else if (Date.now() - stat.mtimeMs < 86400000) reason = 'modified-within-24h';
        else {
          // Use the production decision too: audit must never relax eligibility.
          const decision = await eligibility({ ...args, inputFileObj: file, variables: {}, jobLog: () => {} });
          reason = decision.outputNumber === 1 ? 'eligible' : 'production-policy-skip';
        }
      } catch (e) {
        reason = /headroom/.test(e.message) ? 'insufficient-headroom' : `filesystem:${e.code || 'error'}`;
      }
    }
    const status = file.TranscodeDecisionMaker || 'unknown';
    const hold = Number(file.holdUntil) > Date.now();
    summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    const group = summary.byLibrary[library] ||= { indexed: 0, eligible: 0, statuses: {}, reasons: {} };
    group.indexed++;
    group.statuses[status] = (group.statuses[status] || 0) + 1;
    group.reasons[reason] = (group.reasons[reason] || 0) + 1;
    if (reason === 'eligible') {
      group.eligible++;
      summary.candidateBytes += size;
      const seconds = Number(file.ffProbeData?.format?.duration || file.duration);
      if (Number.isFinite(seconds) && seconds > 0) summary.candidateDurationSeconds += seconds;
      else summary.candidateDurationUnknown++;
      summary.candidatesByStatus[status] = (summary.candidatesByStatus[status] || 0) + 1;
    }
    rows.push({ path: file._id, library, status, hold, reason, bytes: size, codec: video.codec_name,
      width: video.width, height: video.height, transfer: video.color_transfer });
  }
  for (let offset = 0; offset < files.length; offset += 2) {
    await Promise.all(files.slice(offset, offset + 2).map(assessFile));
    if (rows.length % 100 === 0) args.jobLog(`Assessed ${rows.length}/${files.length}; eligible so far: ${Object.values(summary.byLibrary).reduce((n, g) => n + g.eligible, 0)}`);
  }
  const assessment = { generatedAt: new Date().toISOString(), basis: 'Indexed inventory, fresh H.264 candidate probes and live filesystem checks',
    note: 'Read-only assessment. No jobs requeued or marked complete. Eligibility is not a savings guarantee.', summary, files: rows };
  await fs.writeFile(path.join(directory, 'assessment.json'), JSON.stringify(assessment, null, 2));
  args.jobLog(`BACKLOG_ASSESSMENT ${JSON.stringify(summary)}`);
  args.jobLog(`Assessment report: ${directory}/assessment.json`);

  // Exercise the actual encoder and validation functions against short outputs
  // of all three failed originals. Only new files under /temp are created.
  const sampleDirectory = await fs.mkdtemp('/temp/tdarr-disposition-test-');
  const run = (flags) => new Promise((resolve, reject) => {
    const child = spawn(args.ffmpegPath, ['-nostdin', '-v', 'error', '-n', ...flags], { shell: false });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 300000);
    child.stdout.resume();
    child.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-2000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`FFmpeg ${code}: ${stderr}`)); });
  });
  const scan = (file) => args.scanIndividualFile({ _id: file, file, DB: args.inputFileObj.DB },
    { exifToolScan: false, mediaInfoScan: false, closedCaptionScan: false });
  const sources = [
    '/movies/Alpha (2025)/Alpha (2025) WEBDL-1080p.mkv',
    '/movies/28 Days Later (2002)/28 Days Later (2002) WEBDL-1080p.mkv',
    '/movies/28 Weeks Later (2007)/28 Weeks Later (2007) Bluray-1080p.mkv',
  ];
  const regression = [];
  for (const [index, source] of sources.entries()) {
    const before = await scan(source);
    const stat = await fs.stat(source);
    const command = { init: true, overallInputArguments: [], overallOuputArguments: [],
      streams: structuredClone(before.ffProbeData.streams) };
    await encode({ ...args, variables: { ffmpegCommand: command } });
    const commandArgs = (preserve) => [
      ...command.overallInputArguments, '-i', source, '-t', '10', '-map', '0',
      ...command.overallOuputArguments,
      ...command.streams.flatMap((s, i) => (preserve ? s.outputArgs : s.outputArgs.slice(0, -2))
        .map(v => v.replaceAll('{outputIndex}', String(i)))),
    ];
    const fixed = path.join(sampleDirectory, `${index}-fixed.mkv`);
    await run([...commandArgs(true), fixed]);
    const after = await scan(fixed);
    await validate({ ...args, originalLibraryFile: before, inputFileObj: after,
      variables: { sourceSnapshot: { size: stat.size, mtimeMs: stat.mtimeMs } } });
    await health({ ...args, inputFileObj: after });
    const result = { source, fixed: 'stream-validation-and-decode-passed', streams: after.ffProbeData.streams.length };
    if (index === 0) {
      const old = path.join(sampleDirectory, '0-unfixed.mkv');
      await run([...commandArgs(false), old]);
      const unfixed = await scan(old);
      const differences = [];
      before.ffProbeData.streams.forEach((s, i) => {
        for (const flag of ['default', 'forced']) {
          if ((s.disposition?.[flag] || 0) !== (unfixed.ffProbeData.streams[i]?.disposition?.[flag] || 0))
            differences.push({ stream: i, type: s.codec_type, flag, before: s.disposition?.[flag] || 0,
              after: unfixed.ffProbeData.streams[i]?.disposition?.[flag] || 0 });
        }
      });
      result.unfixedDifferences = differences;
      if (!differences.length) throw new Error('Could not reproduce original disposition failure');
    }
    regression.push(result);
    args.jobLog(`DISPOSITION_REGRESSION ${JSON.stringify(result)}`);
  }
  await fs.writeFile(path.join(directory, 'regression.json'), JSON.stringify({ regression, sampleDirectory }, null, 2));
  args.jobLog(`AUDIT_AND_REGRESSION_PASSED ${directory}`);
  return { outputFileObj: args.inputFileObj, outputNumber: 1, variables: args.variables };
};
