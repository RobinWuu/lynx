

import nativeModule from 'libOpenCVDocumentScanner.so';

let nodeApiInitialized = false;

export function initializeNodeApiAddon(): void {
  if (nodeApiInitialized) {
    return;
  }
  nativeModule.initialize();
  nodeApiInitialized = true;
}
