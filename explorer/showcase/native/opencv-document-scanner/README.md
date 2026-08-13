# OpenCV Document Scanner for Lynx

`@byted-lynx/opencv-document-scanner` is a cross-platform Node-API native
module for Lynx. It accepts encoded PNG or JPEG bytes, detects a document
contour, performs perspective correction, and returns the corrected image and
edge preview as `ArrayBuffer` values.

The Android, iOS, and Lynxtron implementations share
`shared/OpenCVDocumentScanner.cc` and use the standard headers from
`@lynx-js/weak-node-api`. Host applications discover the package through
`lynx.lib.json` and their platform AutoLink client; they must not manually load
or register the addon.

## Platform Support

| Platform | Distribution | OpenCV |
| --- | --- | --- |
| Android | Built from package source by the host | `org.opencv:opencv:4.9.0` |
| iOS | Built from package source by CocoaPods | `FastOpenCV-iOS:1.0.4` |
| Lynxtron macOS | Prebuilt `darwin/arm64` addon | Statically linked OpenCV 5 |

The published package currently supports macOS Apple Silicon for Lynxtron.
Windows and macOS x64 require additional platform-specific prebuilt artifacts.

## Prerequisites

Before integrating this package, publish or install matching versions of:

- a Lynx SDK with restricted Node-API addon support;
- the Android `org.lynxsdk.lynx.library-settings` and
  `org.lynxsdk.lynx.library-build` AutoLink plugins;
- the iOS `cocoapods-lynx-library` AutoLink client;
- the Lynxtron `@lynx-js/lynxtron-dev-plugins` package.

Use the client versions released with the same Lynx SDK line. Do not copy the
Explorer repository's local plugin loaders into a standalone application.

## Install

Configure the internal registry:

```ini
# .npmrc
@byted-lynx:registry=https://bnpm.byted.org/
```

Install the scanner as a direct dependency of the native host:

```bash
pnpm add @byted-lynx/opencv-document-scanner@next
```

After installation, verify:

```text
node_modules/@byted-lynx/opencv-document-scanner/package.json
node_modules/@byted-lynx/opencv-document-scanner/lynx.lib.json
```

AutoLink scans direct host dependencies. In a monorepo where the native host
and Lynx frontend are separate packages, both packages must be able to resolve
the scanner, or it must be installed at their common workspace root.

## Android Host

Configure the repositories required by your released Lynx SDK and apply the
published AutoLink settings plugin:

```gradle
// settings.gradle
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id 'org.lynxsdk.lynx.library-settings' version '<autolink-client-version>'
}
```

Apply the build plugin to the application module:

```gradle
// app/build.gradle
plugins {
    id 'com.android.application'
    id 'org.lynxsdk.lynx.library-build'
}
```

Pin the PrimJS version to the version used by the host Lynx SDK:

```properties
# gradle.properties
lynx.primjs.version=<matching-primjs-version>
```

The client automatically:

1. discovers `lynx.lib.json`;
2. includes the scanner Android library project;
3. adds it to the application dependency graph;
4. compiles `libOpenCVDocumentScanner.so`;
5. packages OpenCV and the matching PrimJS Node-API runtime;
6. generates and invokes `LynxAutolinkGenerated`.

Do not add `System.loadLibrary("OpenCVDocumentScanner")` to the application.

If another host dependency also packages OpenCV or PrimJS native libraries,
first align their versions. Use `packagingOptions.pickFirst` only after
confirming the duplicate files are identical.

## iOS Host

Install the released CocoaPods AutoLink client:

```ruby
# Gemfile
source 'https://rubygems.org'

gem 'cocoapods'
gem 'cocoapods-lynx-library', '<autolink-client-version>'
```

Enable it in the application Podfile:

```ruby
install! 'cocoapods',
         :generate_multiple_pod_projects => true,
         :incremental_installation => true

plugin 'cocoapods-lynx-library'

platform :ios, '13.0'

target 'YourApp' do
  use_frameworks! :linkage => :static

  # Existing Lynx pods...

  use_lynx_library!(
    :root => File.expand_path('../../..', __dir__),
    :output_dir => File.join(__dir__, 'generated/lynx-library')
  )
end
```

The multi-project CocoaPods layout is currently required. PrimJS and
`LynxWeakNodeAPI` intentionally publish different `napi.h` and
`js_native_api.h` implementations for runtime internals and standard addon
development. A single `Pods.xcodeproj` can mix those same-named headers through
its global header map.

`:root` must be a directory from which the client can find the host
`node_modules` while walking upward.

Install pods:

```bash
bundle install
bundle exec pod install
```

The client automatically adds `OpenCVDocumentScanner`, `FastOpenCV-iOS`, and
the generated `LynxLibraryRegistry` pod. The generated registry installs the
PrimJS weak-node-api provider, runs `SetupWeakNodeApiEnv()`, and then registers
the scanner addon. Do not manually add the scanner pod or register the addon in
the AppDelegate.

## Lynxtron Host

Install the released Lynxtron development plugin and enable it in a
Node-targeted Rsbuild environment:

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginLynxtron } from '@lynx-js/lynxtron-dev-plugins/rsbuild';

export default defineConfig({
  environments: {
    desktop: {
      source: {
        entry: {
          main: './src/main.ts',
        },
      },
      output: {
        target: 'node',
        distPath: {
          root: './dist/desktop',
        },
      },
      dev: {
        writeToDisk: true,
      },
      plugins: [pluginLynxtron()],
    },
  },
});
```

`pluginLynxtron()` enables AutoLink by default. It resolves the current
platform and architecture, stages the native package into the desktop output,
loads the `.node` addon in the host process, and registers
`NativeModules.OpenCVDocumentScanner` with Lynx. Do not set
`autolink: false` and do not manually require the addon.

## Lynx Page Usage

Import the typed module:

```ts
import {
  OpenCVDocumentScanner,
  type OpenCVDocumentScannerResult,
} from '@byted-lynx/opencv-document-scanner';
```

`scanDocument` receives encoded PNG or JPEG bytes, not a file path or raw RGBA
pixels:

```ts
const result: OpenCVDocumentScannerResult =
  OpenCVDocumentScanner.scanDocument(encodedImage, 88);

console.log(result.detected);
console.log(result.sourceWidth, result.sourceHeight);
console.log(result.outputWidth, result.outputHeight);
console.log(result.points);
console.log(OpenCVDocumentScanner.getRuntimeInfo());
```

The scanner rejects empty input, encoded images larger than 32 MiB, decoded
images with an edge longer than 12,000 pixels, and decoded images larger than
48 megapixels. Rejected inputs throw an `Error` with one of these `code`
properties:

- `INPUT_EMPTY`
- `INPUT_TOO_LARGE`
- `IMAGE_DECODE_FAILED`
- `IMAGE_DIMENSION_TOO_LARGE`

To display returned images in Lynx:

```ts
function toJpegDataUrl(buffer: ArrayBuffer): string {
  return `data:image/jpeg;base64,${__lynxArrayBufferToBase64(buffer)}`;
}

const edgeSource = toJpegDataUrl(result.edgeImage);
const scannedSource = toJpegDataUrl(result.scannedImage);
```

For an inline input image:

```ts
function stripDataUrl(source: string): string {
  const separator = source.indexOf(',');
  return separator >= 0 ? source.slice(separator + 1) : source;
}

const encodedImage = __lynxBase64ToArrayBuffer(stripDataUrl(sourceImage));
```

Run synchronous scanner calls on the Lynx background thread:

```ts
const runScan = () => {
  'background only';
  return OpenCVDocumentScanner.scanDocument(encodedImage, 88);
};
```

## Verification

Use a standalone verification page and check:

- `Document contour detected` or the fallback result;
- non-zero input/output dimensions;
- the edge and corrected JPEG buffers;
- runtime labels such as `OpenCV 4.9.0 / Android / N-API`,
  `OpenCV 4.9.0 / iOS / N-API`, or
  `OpenCV 5.x / macOS / N-API`.

Platform artifact checks:

```text
Android APK:
  libOpenCVDocumentScanner.so
  libopencv_java4.so
  libnapi_adapter.so
  libnapi.so

iOS generated registry:
  PrimJS provider
  SetupWeakNodeApiEnv()
  _napi_register_xx_OpenCVDocumentScanner()

Lynxtron output:
  .lynxtron/native/node_modules/
    @byted-lynx/opencv-document-scanner/
```

## Development

Android and iOS compile the shared source in the consuming application.
Lynxtron artifacts must be built before publishing:

```bash
OpenCV_DIR=<opencv-cmake-dir> \
LYNX_LIBRARY_HEADERS_DIR=<lynx-library-headers-include> \
LYNX_WEAK_NODE_API_ROOT=<weak-node-api-package-root> \
npm run build:lynxtron
```

`npm pack` and `npm publish` do not compile native artifacts. The package's
`prepack` validation rejects a missing macOS addon, a deployment target newer
than macOS 12, or unresolved Homebrew dependencies.

## License

The package is Apache-2.0 licensed. OpenCV and the libraries included in the
macOS static build are documented in `THIRD_PARTY_NOTICES.md`.
