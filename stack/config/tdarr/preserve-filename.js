module.exports = async (args) => {
  const fs = require('fs').promises;
  const path = require('path');
  const original = path.resolve(args.originalLibraryFile._id);
  const current = path.resolve(args.inputFileObj._id);
  const name = path.basename(original);
  if (/^output(?:\.|$)/i.test(name)) {
    throw new Error('Unidentified original filename; hold for recovery.');
  }
  if (current === original || path.dirname(current) === path.dirname(original)) {
    throw new Error('Expected a separate working-cache file before replacement.');
  }
  if (path.extname(current).toLowerCase() !== path.extname(original).toLowerCase()) {
    throw new Error('Container extension changed; refuse an unreviewed replacement path.');
  }
  const target = path.join(path.dirname(current), name);
  const stat = await fs.lstat(current);
  if (!stat.isFile()) throw new Error('Working output must be a regular file.');
  if (current !== target) {
    // link() fails atomically if the destination exists. Keep the old cache
    // name too: no copying, overwriting, or original-file deletion here.
    try {
      await fs.link(current, target);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await fs.lstat(target);
      if (!existing.isFile() || existing.dev !== stat.dev || existing.ino !== stat.ino) {
        throw new Error('Working filename collision; refuse to overwrite.');
      }
    }
  }
  args.jobLog(`Replacement filename preserved: ${name}`);
  return {
    outputFileObj: { ...args.inputFileObj, _id: target, file: target,
      fileNameWithoutExtension: path.parse(name).name },
    outputNumber: 1,
    variables: args.variables,
  };
};
