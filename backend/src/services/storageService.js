const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('minio');

const localRoot = path.join(__dirname, '../../uploads');

const isMinioConfigured =
  Boolean(process.env.MINIO_ENDPOINT) &&
  Boolean(process.env.MINIO_ACCESS_KEY) &&
  Boolean(process.env.MINIO_SECRET_KEY) &&
  Boolean(process.env.MINIO_BUCKET);

let minioClient = null;
let ensureBucketPromise = null;

if (isMinioConfigured) {
  minioClient = new Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : undefined,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    region: process.env.MINIO_REGION,
  });
}

const bucketName = process.env.MINIO_BUCKET || 'fakturace';

const CONTENT_DISPOSITION_DOWNLOAD = 'attachment';

async function ensureBucketExists() {
  if (!isMinioConfigured) {
    return;
  }
  if (!ensureBucketPromise) {
    ensureBucketPromise = (async () => {
      const exists = await minioClient.bucketExists(bucketName).catch(() => false);
      if (!exists) {
        await minioClient.makeBucket(bucketName, process.env.MINIO_REGION || '');
      }
    })();
  }
  return ensureBucketPromise;
}

function buildLocalPath(relativePath) {
  const absolute = path.join(localRoot, relativePath);
  return absolute;
}

function generateFileName(extension = '') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  if (extension && !extension.startsWith('.')) {
    return `${timestamp}-${random}.${extension}`;
  }
  return `${timestamp}-${random}${extension}`;
}

function normalizeLocation(location) {
  if (location.startsWith('s3://') || location.startsWith('file://')) {
    return location;
  }
  // fallback for legacy relative paths
  return `file://${location.replace(/^\//, '')}`;
}

async function saveFile({ buffer, prefix, extension = '', contentType }) {
  const ext = extension || '';
  const filename = generateFileName(ext);
  const relativePath = prefix ? `${prefix}/${filename}` : filename;

  if (isMinioConfigured) {
    await ensureBucketExists();
    await minioClient.putObject(bucketName, relativePath, buffer, {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Disposition': CONTENT_DISPOSITION_DOWNLOAD,
    });
    return {
      location: `s3://${bucketName}/${relativePath}`,
      size: buffer.length,
    };
  }

  const absolutePath = buildLocalPath(relativePath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, buffer);

  return {
    location: `file://${relativePath}`,
    size: buffer.length,
  };
}

function parseLocation(location) {
  if (!location) {
    return { scheme: null, path: null };
  }
  if (location.startsWith('s3://')) {
    const withoutScheme = location.slice('s3://'.length);
    const [bucket, ...rest] = withoutScheme.split('/');
    return { scheme: 's3', bucket, objectName: rest.join('/') };
  }
  if (location.startsWith('file://')) {
    return { scheme: 'file', relativePath: location.slice('file://'.length) };
  }
  return { scheme: 'file', relativePath: location.replace(/^\//, '') };
}

async function getFileBuffer(location) {
  const parsed = parseLocation(normalizeLocation(location));
  if (!parsed.scheme) {
    return null;
  }

  if (parsed.scheme === 's3') {
    if (!isMinioConfigured) {
      throw new Error('MinIO is not configured');
    }
    const chunks = [];
    const stream = await minioClient.getObject(parsed.bucket, parsed.objectName);
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  const absolute = buildLocalPath(parsed.relativePath);
  return fs.promises.readFile(absolute);
}

async function removeFile(location) {
  if (!location) {
    return;
  }
  const parsed = parseLocation(normalizeLocation(location));
  if (parsed.scheme === 's3') {
    if (!isMinioConfigured) {
      return;
    }
    await ensureBucketExists();
    await minioClient.removeObject(parsed.bucket, parsed.objectName).catch(() => {});
    return;
  }

  const absolute = buildLocalPath(parsed.relativePath);
  if (fs.existsSync(absolute)) {
    await fs.promises.unlink(absolute);
  }
}

module.exports = {
  saveFile,
  getFileBuffer,
  removeFile,
  parseLocation,
  isMinioConfigured,
};
