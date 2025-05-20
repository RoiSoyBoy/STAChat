declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, any>;
  }

  function pdf(dataBuffer: Buffer | ArrayBuffer): Promise<PDFData>;
  export default pdf;
} 