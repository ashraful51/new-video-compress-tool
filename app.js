app.post('/compress', async (req, res) => {
  const { s3Key } = req.body;
  const inputFileName = s3Key;
  const outputFileName = `compressed-${Date.now()}-${s3Key}`;

  const inputPath = path.join('/tmp', inputFileName);
  const outputPath = path.join('/tmp', outputFileName);

  try {
    console.log(`Downloading ${inputFileName} from S3`);
    const downloadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: inputFileName,
    };

    const downloadCommand = new GetObjectCommand(downloadParams);
    const { Body } = await s3Client.send(downloadCommand);
    const writeStream = fs.createWriteStream(inputPath);
    Body.pipe(writeStream);

    Body.on('end', async () => {
      console.log(`Written ${inputPath}`);

      console.log(`Compressing video ${inputFileName}`);
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .setFfmpegPath(ffmpegPath)
          .output(outputPath)
          .videoCodec('libx264')
          .size('50%')
          .preset('fast') // Change this to 'ultrafast', 'superfast', 'veryfast', 'faster', or 'fast'
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
    });

    Body.on('error', (err) => {
      console.error('Error during download from S3:', err);
      res.status(500).send('Error during download from S3');
    });
  } catch (error) {
    console.error('Error compressing video:', error);
    res.status(500).send('Error compressing video');
  }
});
