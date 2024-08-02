require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

console.log('Resolved ffmpeg path:', ffmpegPath);

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '****' : 'Not Set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '****' : 'Not Set');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_BUCKET_NAME:', process.env.AWS_BUCKET_NAME);

// Ensure /tmp directory exists
const tmpDir = '/tmp';
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Manually add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://www.ezomfy.com');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  
  // Intercept OPTIONS method
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static('public'));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/generate-presigned-url', async (req, res) => {
  const { fileName, fileType } = req.body;
  const newFileName = `${Date.now()}-${fileName}`;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: newFileName,
    ContentType: fileType,
  };

  try {
    const command = new PutObjectCommand(params);
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ uploadUrl, fileName: newFileName });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).send('Error generating presigned URL');
  }
});

app.post('/compress', upload.single('video'), async (req, res) => {
  const inputPath = req.file.path;
  const outputFileName = `compressed-${Date.now()}-${req.file.filename}`;
  const outputPath = path.join(tmpDir, outputFileName);

  try {
    console.log(`Compressing video ${inputPath}`);
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setFfmpegPath(ffmpegPath)
        .output(outputPath)
        .videoCodec('libx264')
        .size('640x360')
        .videoBitrate('500k')
        .audioBitrate('64k')
        .preset('ultrafast')
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
