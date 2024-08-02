const ffmpegPath = require('ffmpeg-static');
console.log('Checking ffmpeg path:', ffmpegPath);

const fs = require('fs');
const path = require('path');

fs.access(ffmpegPath, fs.constants.F_OK, (err) => {
  if (err) {
    console.error('Cannot find ffmpeg:', err);
    process.exit(1);
  } else {
    console.log('ffmpeg is installed correctly at:', ffmpegPath);
  }
});
