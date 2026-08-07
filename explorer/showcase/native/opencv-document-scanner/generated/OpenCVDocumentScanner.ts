const ADDON_NAME = 'OpenCVDocumentScanner';

export interface OpenCVDocumentScannerSpec {
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

interface LynxNapiLoader {
  load(moduleName: string): Record<string, unknown>;
}

declare const NativeModules: Record<string, unknown>;

declare const SystemInfo: {
  platform?: string;
};

declare const lynx: {
  getModuleLoader?(): LynxNapiLoader | undefined;
};

declare global {
  // eslint-disable-next-line no-var
  var __lynxNapiLoader: LynxNapiLoader | undefined;

  function getNapiLoader(): LynxNapiLoader | undefined;
}

export function requireOpenCVDocumentScanner(): OpenCVDocumentScannerSpec {
  if (
    SystemInfo.platform === 'macOS' ||
    SystemInfo.platform === 'windows' ||
    SystemInfo.platform === 'pc'
  ) {
    const nativeModule = NativeModules[ADDON_NAME];
    if (nativeModule !== undefined) {
      return nativeModule as OpenCVDocumentScannerSpec;
    }
  }

  const loader =
    globalThis.getNapiLoader?.() ??
    globalThis.__lynxNapiLoader ??
    lynx.getModuleLoader?.();
  if (loader?.load !== undefined) {
    const addon = loader.load(ADDON_NAME);
    if (addon !== undefined) {
      return (addon as unknown) as OpenCVDocumentScannerSpec;
    }
  }

  throw new Error(`N-API addon "${ADDON_NAME}" is unavailable.`);
}

export const OpenCVDocumentScanner = new Proxy(
  {},
  {
    get(_target, property) {
      return requireOpenCVDocumentScanner()[
        property as keyof OpenCVDocumentScannerSpec
      ];
    },
  }
) as OpenCVDocumentScannerSpec;

export default OpenCVDocumentScanner;
