# OpenCV Document Scanner for Lynx

`@byted-lynx/opencv-document-scanner` is a four-platform Lynx AutoLink
Node-API library. It accepts encoded PNG or JPEG bytes, detects a document,
performs perspective correction, and returns the corrected image and an edge
preview as `ArrayBuffer` values.

Android, iOS, HarmonyOS, and Lynxtron compile the same business implementation:

```text
shared/nativeModule/OpenCVDocumentScanner.cc
```

That source uses the standard Node-API headers from
`@lynx-js/weak-node-api`. Platform-specific code only provides build,
registration, and OpenCV packaging.

## Platform Support

| Platform | Addon delivery | OpenCV delivery |
| --- | --- | --- |
| Android | Built from npm package source by Gradle | `org.opencv:opencv:4.9.0` AAR |
| iOS | Built from npm package source by CocoaPods | `FastOpenCV-iOS:1.0.4` Pod |
| HarmonyOS | Built from the package HAR source | Bundled official `opencv-mobile-4.13.0-harmonyos.zip` |
| Lynxtron macOS arm64 | Prebuilt `.node` bundle | OpenCV Mobile 4.13.0 statically linked |

The current npm package contains a Lynxtron prebuilt only for macOS arm64.
Publish additional `dist/<platform>/<arch>/opencv-document-scanner.node`
artifacts before claiming support for macOS x64, Windows, or Linux.

## Prerequisites

Use a Lynx SDK line that includes:

- AutoLink Node-API addon support;
- the matching Android, iOS, and Harmony AutoLink clients;
- PrimJS and weak-node-api runtime support;
- a Lynxtron release that supports AutoLink native libraries.

Keep the AutoLink clients and PrimJS version aligned with the selected Lynx SDK.
Do not copy Lynx Explorer's repository-local plugin loaders into an external
application.

## Install

Configure the internal registry:

```ini
# .npmrc
@byted-lynx:registry=https://bnpm.byted.org/
```

Install the scanner as a direct dependency of the native host and of any
separate frontend package that imports it:

```bash
pnpm add @byted-lynx/opencv-document-scanner@next
```

AutoLink must be able to resolve both of these files:

```text
node_modules/@byted-lynx/opencv-document-scanner/package.json
node_modules/@byted-lynx/opencv-document-scanner/lynx.lib.json
```

## Android Host

Apply the published settings plugin in the host project:

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
    id 'org.lynxsdk.lynx.library-settings' version '<matching-version>'
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

Pin PrimJS to the version used by the Lynx SDK:

```properties
# gradle.properties
lynx.primjs.version=<matching-primjs-version>
```

AutoLink discovers the package, includes its Android library project, builds
`libOpenCVDocumentScanner.so`, packages OpenCV and PrimJS, and generates the
host registry. Do not call `System.loadLibrary("OpenCVDocumentScanner")` in
application code.

If another dependency also contributes OpenCV or PrimJS `.so` files, align the
versions before using `packagingOptions.pickFirst`.

## iOS Host

Install the matching CocoaPods client:

```ruby
# Gemfile
source 'https://rubygems.org'

gem 'cocoapods'
gem 'cocoapods-lynx-library', '<matching-version>'
```

Enable AutoLink in the Podfile:

```ruby
install! 'cocoapods',
         :generate_multiple_pod_projects => true,
         :incremental_installation => true

plugin 'cocoapods-lynx-library'

platform :ios, '13.0'

target 'YourApp' do
  use_frameworks! :linkage => :static

  # Existing Lynx and PrimJS pods...

  use_lynx_library!(
    :root => File.expand_path('../../..', __dir__),
    :output_dir => File.join(__dir__, 'generated/lynx-library')
  )
end
```

`:root` must be able to reach the host `node_modules`. The multi-project
CocoaPods layout prevents PrimJS internal headers from colliding with the
standard addon headers published by `LynxWeakNodeAPI`.

The generated registry:

1. installs the PrimJS weak-node-api provider;
2. calls `SetupWeakNodeApiEnv()`;
3. calls `_napi_register_xx_OpenCVDocumentScanner()`.

Do not add the scanner Pod manually and do not register the addon in
`AppDelegate`.

## HarmonyOS Host

Install the matching Hvigor AutoLink client in the project root:

```json5
// hvigor/hvigor-config.json5
{
  "modelVersion": "5.0.0",
  "dependencies": {
    "@lynx/lynx-library-plugin": "<matching-version>",
  },
}
```

Enable it once:

```ts
// hvigorconfig.ts
import * as hvigorApi from '@ohos/hvigor';
import { enableHarmonyLynxAutolink } from '@lynx/lynx-library-plugin';

enableHarmonyLynxAutolink(hvigorApi, { moduleName: 'entry' });
```

The plugin discovers the package, includes its HAR, generates an AppStartup
registry, and calls the package's `initializeNodeApiAddon()` before Lynx
provider setup. The included Harmony OpenCV archive contains arm64-v8a,
armeabi-v7a, and x86_64 prebuilts.

Do not import `initializeNodeApiAddon()` from application code.

## Lynxtron Host

Enable AutoLink in the Node-targeted desktop environment:

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

`pluginLynxtron()` stages the package, loads its `./lynxtron` export in the host
process. The package entry invokes the generated `_napi_register_xx_*` symbol,
which registers the addon through standard `napi_module_register`. Do not
disable AutoLink and do not manually `require()` the `.node` file.

## Lynx Page Usage

Import the package root for its generated shim, then call the module through
`NativeModules` on every platform:

```ts
import '@byted-lynx/opencv-document-scanner';
import type {
  OpenCVDocumentScanner as OpenCVDocumentScannerApi,
  OpenCVDocumentScannerResult,
} from '@byted-lynx/opencv-document-scanner';

declare let NativeModules: {
  OpenCVDocumentScanner: OpenCVDocumentScannerApi;
};

const result: OpenCVDocumentScannerResult =
  NativeModules.OpenCVDocumentScanner.scanDocument(encodedImage, 88);

console.log(NativeModules.OpenCVDocumentScanner.getRuntimeInfo());
```

`scanDocument` receives encoded PNG or JPEG bytes, not a path or raw RGBA
pixels. Run the synchronous call on the Lynx background thread:

```ts
const runScan = () => {
  'background only';
  return NativeModules.OpenCVDocumentScanner.scanDocument(encodedImage, 88);
};
```

To display the returned JPEG buffers:

```ts
function toJpegDataUrl(buffer: ArrayBuffer): string {
  return `data:image/jpeg;base64,${__lynxArrayBufferToBase64(buffer)}`;
}

const edgeSource = toJpegDataUrl(result.edgeImage);
const scannedSource = toJpegDataUrl(result.scannedImage);
```

The scanner rejects:

- empty input;
- encoded input larger than 32 MiB;
- decoded images with an edge longer than 12,000 pixels;
- decoded images larger than 48 megapixels.

Input errors expose one of these `code` values:

- `INPUT_EMPTY`
- `INPUT_TOO_LARGE`
- `IMAGE_DECODE_FAILED`
- `IMAGE_DIMENSION_TOO_LARGE`

## Published Package Contents

The npm tarball contains:

```text
lynx.lib.json
generated/                         # TypeScript AutoLink facade
types/ and src/
shared/nativeModule/               # shared business source + generated registration
types/napi-native-module.d.ts      # NAPI feature declaration consumed by codegen
android/                           # source-built Gradle/CMake library
ios/                               # Podspec, wrapper, and addon_use.h
harmony/                           # HAR source and OpenCV Mobile archive
lynxtron/                          # desktop loader and registration source
dist/macos/arm64/
  opencv-document-scanner.node     # prebuilt Lynxtron addon
licenses/
```

It intentionally does not publish `.cxx`, CMake build directories,
`node_modules`, or extracted third-party work directories.

Android and iOS do not ship scanner prebuilts in the npm tarball; their host
build systems resolve OpenCV and compile the shared source. Harmony ships its
official OpenCV Mobile archive. The macOS arm64 `.node` already contains
OpenCV Mobile statically and has only system dynamic dependencies.

## Package Verification and Publishing

Build every Lynxtron platform/architecture artifact you intend to support
before publishing. For the current macOS arm64 artifact:

```bash
OpenCV_DIR=<opencv-mobile-cmake-dir> \
npm run build:lynxtron
```

Then inspect the tarball and publish:

```bash
npm pack --dry-run
npm publish --registry https://bnpm.byted.org/ --tag next
```

The `prepack` check validates:

- all four manifest entries;
- the Harmony OpenCV archive SHA-256;
- Podspec/package version consistency;
- the macOS arm64 Mach-O bundle and deployment target;
- absence of non-system macOS dynamic dependencies;
- weak-suffix N-API imports for Lynxtron;
- standard Lynxtron NAPI registration instead of the platform-module registry.

## Verification

Use a standalone page and verify:

- `Document contour detected` or a valid fallback result;
- non-zero input/output dimensions;
- both returned JPEG buffers;
- a platform runtime label.

The Android reference verification used a Pixel 6 Pro cold start and produced:

```text
Document contour detected
OpenCV 4.9.0 / Android / N-API
input: 558x563
output: 485x469
```

The Explorer-only query `enable_napi_addon=1` enables its sample runtime
lifecycle integration. It is not a package API and external hosts should not
copy the Explorer routing convention.

## License

The package is Apache-2.0 licensed. OpenCV and bundled codec notices are listed
in `THIRD_PARTY_NOTICES.md` and `licenses/`.
