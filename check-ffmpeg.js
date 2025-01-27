{
    "name": "video-compress",
    "version": "1.0.0",
    "description": "A video compression tool using ffmpeg and AWS S3",
    "main": "app.js",
    "scripts": {
      "start": "node app.js"
    },
    "dependencies": {
      "@aws-sdk/client-s3": "^3.621.0",
      "@aws-sdk/s3-request-presigner": "^3.621.0",
      "cors": "^2.8.5",
      "dotenv": "^16.4.5",
      "express": "^4.19.2",
      "ffmpeg-static": "^5.2.0",
      "fluent-ffmpeg": "^2.1.3",
      "multer": "^1.4.5-lts.1"
    }
  }
  