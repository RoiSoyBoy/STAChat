declare module 'mammoth' {
  interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
      [key: string]: any;
    }>;
  }

  interface Options {
    buffer: Buffer | ArrayBuffer;
  }

  export function extractRawText(options: Options): Promise<ConversionResult>;
} 