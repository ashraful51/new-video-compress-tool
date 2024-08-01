require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const cors = require('cors');

console.log('Resolved ffmpeg path:', ffmpegPath);

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '****' : 'Not Set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '****' : 'Not Set');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_BUCKET_NAME:', process.env.AWS_BUCKET_NAME);

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.use(cors());
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/compress', upload.single('video'), async (req, res) => {
  const { originalname, buffer, mimetype } = req.file;
  const inputFileName = `${Date.now()}-${originalname}`;
  const outputFileName = `compressed-${Date.now()}-${originalname}`;
  const inputPath = path.join('/tmp', inputFileName);
  const outputPath = path.join('/tmp', outputFileName);

  try {
    console.log(`Uploading ${inputFileName} to S3`);
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: inputFileName,
      Body: buffer,
      ContentType: mimetype,
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`Uploaded ${inputFileName} to S3`);

    fs.writeFileSync(inputPath, buffer);
    console.log(`Written ${inputPath}`);

    console.log(`Compressing video ${inputFileName}`);
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec('libx264')
        .size('50%')
        .on('end', () => {
          console.log(`Video compressed to ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error('Error during compression:', err);
          reject(err);
        })
        .run();
    });

    const compressedBuffer = fs.readFileSync(outputPath);
    console.log(`Read compressed file ${outputPath}`);

    console.log(`Uploading compressed video ${outputFileName} to S3`);
    const compressedUploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: outputFileName,
      Body: compressedBuffer,
      ContentType: 'video/mp4',
    };
    await s3Client.send(new PutObjectCommand(compressedUploadParams));
    console.log(`Uploaded ${outputFileName} to S3`);

    const downloadUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${outputFileName}`;

    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);
    console.log(`Cleaned up temporary files`);

    res.json({ downloadUrl });
  } catch (error) {
    console.error('Error compressing video:', error);
    res.status(500).send('Error compressing video');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
