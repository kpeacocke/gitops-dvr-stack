module.exports = async (args) => {
  const command = args.variables.ffmpegCommand;
  if (!command?.init) throw new Error('FFmpeg command was not initialized');
  command.shouldProcess = true;
  command.container = 'mkv';
  command.hardwareDecoding = false;
  command.overallInputArguments.push('-init_hw_device', 'qsv=hw:/dev/dri/renderD128');
  command.overallOuputArguments.push('-map_metadata', '0', '-map_chapters', '0');
  for (const stream of command.streams) {
    stream.outputArgs = stream.codec_type === 'video'
      ? ['-c:{outputIndex}', 'hevc_qsv', '-global_quality', '22', '-preset', 'slow',
        '-profile:v', 'main10', '-pix_fmt', 'p010le']
      : ['-c:{outputIndex}', 'copy'];
  }
  return { outputFileObj: args.inputFileObj, outputNumber: 1, variables: args.variables };
};
