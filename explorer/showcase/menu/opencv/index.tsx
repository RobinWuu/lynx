// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { root, useEffect, useState } from '@lynx-js/react';
import { OpenCVDocumentScanner } from '@lynx-showcase/opencv-document-scanner';
import type { OpenCVDocumentScannerResult } from '@lynx-showcase/opencv-document-scanner';

import SourceImage from './sudoku.png?inline';
import './styles.scss';

type ScanState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      result: OpenCVDocumentScannerResult;
      runtime: string;
      edgeSource: string;
      scannedSource: string;
    };

function stripDataUrl(source: string): string {
  const separator = source.indexOf(',');
  return separator >= 0 ? source.slice(separator + 1) : source;
}

function toJpegDataUrl(buffer: ArrayBuffer): string {
  return `data:image/jpeg;base64,${__lynxArrayBufferToBase64(buffer)}`;
}

function ScanWorkspace() {
  const [scanState, setScanState] = useState<ScanState>({ status: 'loading' });

  const runScan = () => {
    'background only';
    setScanState({ status: 'loading' });
    try {
      const sourceBuffer = __lynxBase64ToArrayBuffer(stripDataUrl(SourceImage));
      const result = OpenCVDocumentScanner.scanDocument(sourceBuffer, 88);
      setScanState({
        status: 'ready',
        result,
        runtime: OpenCVDocumentScanner.getRuntimeInfo(),
        edgeSource: toJpegDataUrl(result.edgeImage),
        scannedSource: toJpegDataUrl(result.scannedImage),
      });
    } catch (error) {
      setScanState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  useEffect(() => {
    runScan();
  }, []);

  const readyState = scanState.status === 'ready' ? scanState : undefined;

  return (
    <view className="workspace">
      <scroll-view scroll-y className="workspace-scroll">
        <view className="header-band">
          <view>
            <text className="eyebrow">N-API + OPEN CV</text>
            <text className="heading">Document scanner</text>
          </view>
          <view
            className="scan-button"
            bindtap={runScan}
            accessibility-element={true}
            accessibility-label="Run document scan"
            accessibility-traits="button"
          >
            <text className="scan-button-text">
              {scanState.status === 'loading' ? 'Scanning' : 'Scan again'}
            </text>
          </view>
        </view>

        <view className="status-strip">
          <view
            className={
              readyState?.result.detected ? 'status-dot success' : 'status-dot'
            }
          />
          <text className="status-text">
            {scanState.status === 'loading'
              ? 'Running native pipeline'
              : scanState.status === 'error'
              ? scanState.message
              : readyState?.result.detected
              ? 'Document contour detected'
              : 'Fallback enhancement applied'}
          </text>
        </view>

        <view className="image-section">
          <text className="section-label">SOURCE</text>
          <image className="source-image" src={SourceImage} mode="aspectFit" />
        </view>

        <view className="results-grid">
          <view className="result-column">
            <text className="section-label">EDGE MAP</text>
            <view className="image-frame">
              {readyState ? (
                <image
                  className="result-image"
                  src={readyState.edgeSource}
                  mode="aspectFit"
                />
              ) : (
                <view className="image-placeholder" />
              )}
            </view>
          </view>
          <view className="result-column">
            <text className="section-label">RECTIFIED</text>
            <view className="image-frame light-frame">
              {readyState ? (
                <image
                  className="result-image"
                  src={readyState.scannedSource}
                  mode="aspectFit"
                />
              ) : (
                <view className="image-placeholder light-placeholder" />
              )}
            </view>
          </view>
        </view>

        <view className="metrics-band">
          <view className="metric">
            <text className="metric-value">
              {readyState
                ? `${readyState.result.processingMs.toFixed(1)} ms`
                : '--'}
            </text>
            <text className="metric-label">NATIVE TIME</text>
          </view>
          <view className="metric">
            <text className="metric-value">
              {readyState
                ? `${readyState.result.sourceWidth}x${readyState.result.sourceHeight}`
                : '--'}
            </text>
            <text className="metric-label">INPUT</text>
          </view>
          <view className="metric">
            <text className="metric-value">
              {readyState
                ? `${readyState.result.outputWidth}x${readyState.result.outputHeight}`
                : '--'}
            </text>
            <text className="metric-label">OUTPUT</text>
          </view>
        </view>

        <view className="runtime-band">
          <text className="runtime-title">
            {readyState?.runtime ?? `${SystemInfo.platform} / loading`}
          </text>
          <text className="runtime-detail">
            {readyState?.result.points || 'Corner coordinates pending'}
          </text>
        </view>
      </scroll-view>
    </view>
  );
}

root.render(<ScanWorkspace />);
