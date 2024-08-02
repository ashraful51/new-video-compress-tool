require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static').path;
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
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
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate-presigned-url', async (req, res) => {
  const { fileName, fileType } = req.body;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
    ContentType: fileType,
  };

  try {
    const command = new PutObjectCommand(params);
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ uploadUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).send('Error generating presigned URL');
  }
});

app.post('/compress', async (req, res) => {
  const { s3Key } = req.body;
  const inputFileName = s3Key;
  const outputFileName = `compressed-${Date.now()}-${s3Key}`;

  const inputPath = path.join('/tmp', inputFileName);
  const outputPath = path.join('/tmp', outputFileName);

  try {
    const downloadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: inputFileName,
    };

    const downloadCommand = new GetObjectCommand(downloadParams);
    const { Body } = await s3Client.send(downloadCommand);
    const writeStream = fs.createWriteStream(inputPath);
    Body.pipe(writeStream);

    Body.on('end', async () => {
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .setFfmpegPath(ffmpegPath)
          .output(outputPath)
          .videoCodec('libx264')
          .size('50%')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      const compressedBuffer = fs.readFileSync(outputPath);

      const compressedUploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: outputFileName,
        Body: compressedBuffer,
        ContentType: 'video/mp4',
      };
      await s3Client.send(new PutObjectCommand(compressedUploadParams));

      const downloadUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${outputFileName}`;

      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);

      res.json({ downloadUrl });
    });
  } catch (error) {
    console.error('Error compressing video:', error);
    res.status(500).send('Error compressing video');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
