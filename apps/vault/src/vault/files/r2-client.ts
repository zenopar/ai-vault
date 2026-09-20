import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

export function parseR2Config(): R2Config {
  const rawUrl = (process.env["R2_URL"] || "").trim();
  const accessKeyId = (
    process.env["R2_ACCES_KEY_ID"] ||
    process.env["R2_ACCESS_KEY_ID"] ||
    process.env["R2_TOKEN_VALUE"] ||
    ""
  ).trim();
  const secretAccessKey = (process.env["R2_SECRET_ACCESS_KEY"] || "").trim();
  let bucketName = (process.env["R2_BUCKET_NAME"] || "").trim();
  let endpoint = rawUrl;

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0 && !bucketName) {
        bucketName = pathParts[0];
      }
      endpoint = `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Keep endpoint as rawUrl
    }
  }

  if (!bucketName) {
    bucketName = "ai-vault";
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName,
  };
}

export function getR2Client(): { client: S3Client; bucketName: string } {
  const config = parseR2Config();

  if (!config.endpoint) {
    throw new Error("R2 storage error: R2_URL environment variable is not configured.");
  }
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error(
      "R2 storage error: R2 credentials (R2_ACCES_KEY_ID / R2_SECRET_ACCESS_KEY) are not configured."
    );
  }

  if (!cachedClient || cachedConfig?.endpoint !== config.endpoint || cachedConfig?.accessKeyId !== config.accessKeyId) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedConfig = config;
  }

  return { client: cachedClient, bucketName: config.bucketName };
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  const { client, bucketName } = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
}

export async function downloadFromR2(key: string): Promise<Buffer> {
  const { client, bucketName } = getR2Client();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await client.send(command);
  if (!response.Body) {
    throw new Error(`R2 download error: Empty body returned for key "${key}".`);
  }

  // Convert Body stream or Blob to Buffer
  if (Buffer.isBuffer(response.Body)) {
    return response.Body;
  }

  if (response.Body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // Node 18+ Web ReadableStream or Blob
  const byteArr = await (response.Body as any).transformToByteArray();
  return Buffer.from(byteArr);
}

export async function deleteFromR2(key: string): Promise<void> {
  const { client, bucketName } = getR2Client();

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await client.send(command);
}
