module.exports = async (args) => {
  const { spawn } = require('child_process');
  // Decode every video/audio track and make even recoverable decode errors fatal.
  await new Promise((resolve, reject) => {
    const child = spawn(args.ffmpegPath, ['-nostdin', '-v', 'error', '-xerror',
      '-err_detect', 'explode', '-i', args.inputFileObj._id,
      '-map', '0:v', '-map', '0:a?', '-f', 'null', '-'], { shell: false });
    let errors = '';
    child.stdout.resume();
    child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 || errors.trim()) reject(new Error(`Decode check failed (${code}): ${errors}`));
      else resolve();
    });
  });
  args.jobLog('Strict full video/audio decode passed.');
  return { outputFileObj: args.inputFileObj, outputNumber: 1, variables: args.variables };
};
