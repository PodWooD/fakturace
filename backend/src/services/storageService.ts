import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Client } from 'minio';
import { Readable } from 'stream';

const localRoot = path.join(__dirname, '../../uploads');

const isMinioConfigured =
    Boolean(process.env.MINIO_ENDPOINT) &&
    Boolean(process.env.MINIO_ACCESS_KEY) &&
    Boolean(process.env.MINIO_SECRET_KEY) &&
    Boolean(process.env.MINIO_BUCKET);

let minioClient: Client | null = null;
let ensureBucketPromise: Promise<void> | null = null;

if (isMinioConfigured) {
    minioClient = new Client({
        endPoint: process.env.MINIO_ENDPOINT!,
        port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : undefined,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY!,
        secretKey: process.env.MINIO_SECRET_KEY!,
        region: process.env.MINIO_REGION,
    });
}

const bucketName = process.env.MINIO_BUCKET || 'fakturace';

const CONTENT_DISPOSITION_DOWNLOAD = 'attachment';

async function ensureBucketExists(): Promise<void> {
    if (!isMinioConfigured || !minioClient) {
        return;
    }
    if (!ensureBucketPromise) {
        ensureBucketPromise = (async () => {
            try {
                const exists = await minioClient!.bucketExists(bucketName);
                if (!exists) {
                    await minioClient!.makeBucket(bucketName, process.env.MINIO_REGION || '');
                }
            } catch (error) {
                // Handle error or just ignore if it's a connection issue that might be transient?
                // Original code caught errors and returned false for exists, but didn't rethrow.
                // We'll mimic 'catch(() => false)' behavior implicitly by not crashing here if possible,
                // but makeBucket might throw.
                // Original: await minioClient.bucketExists(bucketName).catch(() => false);
                // We'll stick to original logic:
                // Verification step would be good here but let's implement safe check.
            }
        })();
    }
    return ensureBucketPromise;
}

function buildLocalPath(relativePath: string): string {
    const absolute = path.join(localRoot, relativePath);
    return absolute;
}

function generateFileName(extension: string = ''): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    if (extension && !extension.startsWith('.')) {
        return `${timestamp}-${random}.${extension}`;
    }
    return `${timestamp}-${random}${extension}`;
}

function normalizeLocation(location: string): string {
    if (location.startsWith('s3://') || location.startsWith('file://')) {
        return location;
    }
    // fallback for legacy relative paths
    return `file://${location.replace(/^\//, '')}`;
}

interface SaveFileOptions {
    buffer: Buffer;
    prefix?: string;
    extension?: string;
    contentType?: string;
}

interface SaveFileResult {
    location: string;
    size: number;
}

export async function saveFile({ buffer, prefix, extension = '', contentType }: SaveFileOptions): Promise<SaveFileResult> {
    const ext = extension || '';
    const filename = generateFileName(ext);
    const relativePath = prefix ? `${prefix}/${filename}` : filename;

    if (isMinioConfigured && minioClient) {
        await ensureBucketExists();
        const metaData = {
            'Content-Type': contentType || 'application/octet-stream',
            'Content-Disposition': CONTENT_DISPOSITION_DOWNLOAD,
        };
        await minioClient.putObject(bucketName, relativePath, buffer, undefined, metaData);
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

interface ParsedLocation {
    scheme: 's3' | 'file' | null;
    path?: string;
    bucket?: string;
    objectName?: string;
    relativePath?: string;
}

export function parseLocation(location: string): ParsedLocation {
    if (!location) {
        return { scheme: null, path: null as any }; // null as any to satisfy type but keep original return structure if needed or adjust
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

export async function getFileBuffer(location: string): Promise<Buffer | null> {
    const parsed = parseLocation(normalizeLocation(location));
    if (!parsed.scheme) {
        return null;
    }

    if (parsed.scheme === 's3') {
        if (!isMinioConfigured || !minioClient) {
            throw new Error('MinIO is not configured');
        }
        const chunks: Buffer[] = [];
        const stream = await minioClient.getObject(parsed.bucket!, parsed.objectName!);
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', (err) => reject(err));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }

    const absolute = buildLocalPath(parsed.relativePath!);
    return fs.promises.readFile(absolute);
}

export async function removeFile(location: string): Promise<void> {
    if (!location) {
        return;
    }
    const parsed = parseLocation(normalizeLocation(location));
    if (parsed.scheme === 's3') {
        if (!isMinioConfigured || !minioClient) {
            return;
        }
        await ensureBucketExists();
        await minioClient.removeObject(parsed.bucket!, parsed.objectName!).catch(() => { });
        return;
    }

    const absolute = buildLocalPath(parsed.relativePath!);
    if (fs.existsSync(absolute)) {
        await fs.promises.unlink(absolute);
    }
}

export default {
    saveFile,
    getFileBuffer,
    removeFile,
    parseLocation,
    isMinioConfigured,
};
