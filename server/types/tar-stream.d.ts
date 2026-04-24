declare module "tar-stream" {
  import type { Readable } from "stream";

  export interface TarHeader {
    name: string;
    size?: number;
    mode?: number;
    uid?: number;
    gid?: number;
    mtime?: Date;
    type?: string;
    linkname?: string;
  }

  export interface Pack extends Readable {
    entry(header: TarHeader, buffer: Buffer | string | null, callback?: (err?: Error | null) => void): unknown;
    finalize(): void;
  }

  export function pack(): Pack;
}
