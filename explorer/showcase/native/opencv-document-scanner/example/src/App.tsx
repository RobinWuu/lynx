import '@byted-lynx/opencv-document-scanner';
import type { OpenCVDocumentScanner as OpenCVDocumentScannerApi } from '@byted-lynx/opencv-document-scanner';

declare let NativeModules: {
  OpenCVDocumentScanner: OpenCVDocumentScannerApi;
};

export function App() {
  const logRuntimeInfo = () => {
    'background only';
    console.log(NativeModules.OpenCVDocumentScanner.getRuntimeInfo());
  };

  return (
    <view>
      <text>@byted-lynx/opencv-document-scanner</text>
      <text bindtap={logRuntimeInfo}>Native module</text>
    </view>
  );
}
