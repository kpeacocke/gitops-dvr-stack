module.exports = async (args) => {
  const fs = require('fs').promises;
  const before = args.originalLibraryFile;
  const after = args.inputFileObj;
  const snapshot = args.variables.sourceSnapshot;
  const stat = await fs.stat(before._id);
  if (!snapshot || stat.size !== snapshot.size || stat.mtimeMs !== snapshot.mtimeMs) {
    throw new Error('Source changed during encoding; keep original.');
  }
  const a = before.ffProbeData?.streams || [];
  const b = after.ffProbeData?.streams || [];
  if (a.length !== b.length) throw new Error('Stream count changed; keep original.');
  for (let i = 0; i < a.length; i++) {
    if (a[i].codec_type !== b[i].codec_type) throw new Error('Stream type changed');
    if (a[i].codec_type === 'video') {
      if (b[i].codec_name !== 'hevc' || !/10/.test(b[i].pix_fmt || '')
          || a[i].width !== b[i].width || a[i].height !== b[i].height) {
        throw new Error('Unexpected video format or dimensions; keep original.');
      }
    } else if (a[i].codec_name !== b[i].codec_name
        || a[i].channels !== b[i].channels
        || a[i].tags?.language !== b[i].tags?.language) {
      throw new Error('Audio/subtitle/attachment mismatch; keep original.');
    }
    for (const flag of ['default', 'forced']) {
      if ((a[i].disposition?.[flag] || 0) !== (b[i].disposition?.[flag] || 0)) {
        throw new Error(`Track ${i} (${a[i].codec_type}) disposition ${flag} changed: `
          + `${a[i].disposition?.[flag] || 0} -> ${b[i].disposition?.[flag] || 0}; keep original.`);
      }
    }
  }
  return { outputFileObj: after, outputNumber: 1, variables: args.variables };
};
