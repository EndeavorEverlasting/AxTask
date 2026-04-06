declare module "cookie" {
  export function parse(
    str: string,
    options?: {
      decode?(val: string): string;
    },
  ): Record<string, string>;
}

