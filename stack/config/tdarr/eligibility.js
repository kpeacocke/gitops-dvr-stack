module.exports = async (args) => {
  const fs = require('fs').promises;
  const file = args.inputFileObj;
  const streams = file.ffProbeData?.streams || [];
  const videos = streams.filter(s => s.codec_type === 'video');
  const video = videos[0];
  const done = (number, reason) => {
    args.jobLog(reason);
    return { outputFileObj: file, outputNumber: number, variables: args.variables };
  };
  // Conservative first deployment: MKV, one progressive SDR H.264 video.
  if (!/\.mkv$/i.test(file._id) || videos.length !== 1 || video.codec_name !== 'h264') {
    return done(2, 'Skip: only single-video H.264 MKV files are eligible.');
  }
  if (video.width > 1920 || video.height > 1080
      || !['bt709', 'smpte170m', 'bt470bg'].includes(video.color_transfer)
      || !['progressive', 'unknown', undefined].includes(video.field_order)
      || /dovi|dolby|hdr|smpte2084|arib-std-b67/i.test(JSON.stringify(video.side_data_list || []))
      || /hdr|dolby vision/i.test(JSON.stringify(file.mediaInfo?.track?.map(t => t.HDR_Format) || []))) {
    return done(2, 'Skip: HDR, unknown transfer, interlaced, or above 1080p.');
  }
  const stat = await fs.stat(file._id);
  const pilot = file._id.startsWith('/pilot/');
  if (stat.nlink > 1 || (!pilot && Date.now() - stat.mtimeMs < 86400000)) {
    return done(2, 'Skip: hardlinked or modified in the last 24 hours.');
  }
  for (const folder of [require('path').dirname(file._id), '/temp']) {
    const space = await fs.statfs(folder);
    if (space.bavail * space.bsize < 500 * 1024 ** 3 + stat.size * 2) {
      throw new Error('Insufficient headroom: preserve 500 GiB plus twice the source size.');
    }
  }
  args.variables.sourceSnapshot = { size: stat.size, mtimeMs: stat.mtimeMs };
  return done(1, 'Eligible SDR H.264 source; original retained until all checks pass.');
};
