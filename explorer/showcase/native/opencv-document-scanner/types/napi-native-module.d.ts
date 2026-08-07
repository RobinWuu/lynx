/** @lynxmodule */
export declare class OpenCVDocumentScanner {
  getRuntimeInfo(): string;
  scanDocument(
    image: ArrayBuffer,
    jpegQuality?: number
  ): OpenCVDocumentScannerResult;
}

export interface OpenCVDocumentScannerResult {
  detected: boolean;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  processingMs: number;
  points: string;
  scannedImage: ArrayBuffer;
  edgeImage: ArrayBuffer;
}
