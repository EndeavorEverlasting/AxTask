import { writeFile, mkdir, unlink } from "node:fs/promises";
import { createHmac, createHash } from "node:crypto";
import path from "node:path";

export interface BackupTarget {
  name: string;
  writeBackup(fileName: string, data: string): Promise<{ pathOrUrl: string }>;
  deleteBackup(fileName: string): Promise<void>;
}

export class LocalFileBackupTarget implements BackupTarget {
  name = "local";
  constructor(private outputDir: string) {}

  async writeBackup(fileName: string, data: string): Promise<{ pathOrUrl: string }> {
    const dir = this.outputDir || process.cwd();
    const filePath = path.resolve(dir, fileName);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, data, "utf8");
    return { pathOrUrl: filePath };
  }

  async deleteBackup(fileName: string): Promise<void> {
    const dir = this.outputDir || process.cwd();
    const filePath = path.resolve(dir, fileName);
    await unlink(filePath);
  }
}

/**
 * Minimal S3-compatible backup target using Node.js built-in crypto for
 * AWS Signature Version 4. Works with S3, MinIO, Wasabi, DigitalOcean Spaces,
 * and any other service that accepts V4-signed PUT requests.
 *
 * No external AWS SDK dependency required.
 *
 * Transient failures (5xx, 429, network errors) are retried with exponential
 * backoff. Retries default to 3 attempts with a 500ms base delay.
 */
export class S3CompatibleBackupTarget implements BackupTarget {
  name = "s3";

  constructor(private opts: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix?: string;
    retries?: number;
    retryDelayMs?: number;
  }) {}

  private isoDate(d: Date): { dateStamp: string; amzDate: string } {
    const iso = d.toISOString().replace(/[:\-]|\.\d{3}/g, "");
    return { dateStamp: iso.slice(0, 8), amzDate: iso };
  }

  private hmac(key: string | Buffer, data: string): Buffer {
    return createHmac("sha256", key).update(data).digest();
  }

  private hash(data: string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  private sign(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string,
    stringToSign: string,
  ): string {
    const kDate = this.hmac("AWS4" + secretKey, dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    const kSigning = this.hmac(kService, "aws4_request");
    return this.hmac(kSigning, stringToSign).toString("hex");
  }

  private isTransientError(res: Response | null, error: unknown): boolean {
    if (!res) return true; // network/fetch error
    return res.status >= 500 || res.status === 429 || res.status === 408;
  }

  private async retryFetch(
    url: string,
    init: RequestInit,
    methodLabel: string,
  ): Promise<Response> {
    const maxRetries = this.opts.retries ?? 3;
    const baseDelay = this.opts.retryDelayMs ?? 500;
    let lastError: Error | null = null;
    let lastRes: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (!res.ok && this.isTransientError(res, null)) {
          lastRes = res;
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }
        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (lastRes) {
      const text = await lastRes.text().catch(() => "");
      throw new Error(
        `S3 ${methodLabel} failed after ${maxRetries + 1} attempts (${lastRes.status}): ${text.slice(0, 200)}`,
      );
    }
    throw new Error(
      `S3 ${methodLabel} failed after ${maxRetries + 1} attempts: ${lastError?.message ?? "unknown error"}`,
    );
  }

  async writeBackup(fileName: string, data: string): Promise<{ pathOrUrl: string }> {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey, prefix = "" } = this.opts;
    const key = prefix ? `${prefix.replace(/\/$/, "")}/${fileName}` : fileName;
    const url = `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
    const now = new Date();
    const { dateStamp, amzDate } = this.isoDate(now);

    const headers: Record<string, string> = {
      "Host": new URL(url).host,
      "Content-Type": "application/json",
      "x-amz-content-sha256": this.hash(data),
      "x-amz-date": amzDate,
    };

    // Canonical headers sorted by key
    const signedHeaders = Object.keys(headers).map((k) => k.toLowerCase()).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
      .join("");

    const canonicalRequest = [
      "PUT",
      `/${bucket}/${key}`,
      "",
      canonicalHeaders,
      signedHeaders,
      headers["x-amz-content-sha256"],
    ].join("\n");

    const credential = `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      this.hash(canonicalRequest),
    ].join("\n");

    const signature = this.sign(secretAccessKey, dateStamp, region, "s3", stringToSign);
    headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await this.retryFetch(url, {
      method: "PUT",
      headers,
      body: data,
    }, "upload");

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`S3 upload failed (${res.status}): ${text.slice(0, 200)}`);
    }

    return { pathOrUrl: url };
  }

  async deleteBackup(fileName: string): Promise<void> {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey, prefix = "" } = this.opts;
    const key = prefix ? `${prefix.replace(/\/$/, "")}/${fileName}` : fileName;
    const url = `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
    const now = new Date();
    const { dateStamp, amzDate } = this.isoDate(now);

    const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const headers: Record<string, string> = {
      "Host": new URL(url).host,
      "x-amz-content-sha256": emptySha256,
      "x-amz-date": amzDate,
    };

    const signedHeaders = Object.keys(headers).map((k) => k.toLowerCase()).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
      .join("");

    const canonicalRequest = [
      "DELETE",
      `/${bucket}/${key}`,
      "",
      canonicalHeaders,
      signedHeaders,
      emptySha256,
    ].join("\n");

    const credential = `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      this.hash(canonicalRequest),
    ].join("\n");

    const signature = this.sign(secretAccessKey, dateStamp, region, "s3", stringToSign);
    headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await this.retryFetch(url, {
      method: "DELETE",
      headers,
    }, "delete");

    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      throw new Error(`S3 delete failed (${res.status}): ${text.slice(0, 200)}`);
    }
  }
}
