# OpenCV N-API Library 通过 AutoLink 接入 Lynx Explorer 与 Lynxtron

本文记录 OpenCV Document Scanner Showcase 的接入方式，并明确区分五个独立层次：

1. Lynx Explorer 是宿主 App，只接入 AutoLink client。
2. OpenCV Document Scanner 是独立 Lynx library，通过 `lynx.lib.json` 声明 N-API addon。
3. Lynx SDK 提供通用的 generated-registry 初始化入口和 N-API module loader。
4. Lynxtron 作为独立桌面宿主，通过自己的 AutoLink client 加载同一个 package。
5. ReactLynx 页面只依赖 OpenCV library 的 TypeScript API。

核心原则是：Explorer 不包含 OpenCV 专用注册代码，也不在 App 中手写
`System.loadLibrary("OpenCVDocumentScanner")`。安装 library package 后，AutoLink client
负责发现、构建、链接和生成注册入口。

## 1. 最终效果

独立页面使用 OpenCV 官方 `sudoku.png` 作为固定输入，执行以下 native pipeline：

1. PNG/JPEG 解码。
2. 灰度化、Gaussian blur、Canny 边缘检测和 morphology close。
3. 从主要轮廓中检测凸四边形。
4. 对文档区域执行 perspective transform。
5. 对矫正结果执行 adaptive threshold。
6. 将边缘图和矫正图编码为 JPEG `ArrayBuffer` 返回 Lynx。

页面展示原图、边缘图、矫正图、native 耗时、输入输出尺寸、四角坐标和 OpenCV
runtime 信息。

对外 N-API API：

```ts
interface OpenCVDocumentScannerSpec {
  getRuntimeInfo(): string;
  scanDocument(
    image: ArrayBuffer,
    jpegQuality?: number
  ): OpenCVDocumentScannerResult;
}

interface OpenCVDocumentScannerResult {
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
```

已验证平台：

- Android：Pixel 6 Pro 真机，Android 14。
- iOS：iPhone 15 模拟器，iOS 17.2。
- Lynxtron：macOS arm64，原生窗口。

## 2. 职责边界

### 2.1 Explorer 宿主 App

Explorer 只负责：

- 在自己的 `package.json` 中依赖 OpenCV library。
- Android 启用官方 AutoLink Gradle client。
- iOS 启用官方 CocoaPods plugin 并调用 `use_lynx_library!`。
- 构建并承载独立 Lynx 页面。

Explorer 不负责：

- 扫描或解析 OpenCV manifest。
- 生成 addon 注册代码。
- 在业务代码中硬编码 OpenCV library 名。
- 手工调用 OpenCV 注册函数。
- 实现 OpenCV 图像算法。

### 2.2 AutoLink client

Android client：

```text
platform/android/lynx_library_plugin/
```

它扫描安装在宿主 `node_modules` 中的 `lynx.lib.json`，将 Android library project
加入 Gradle graph，并生成 `LynxAutolinkGenerated.java`。

iOS client：

```text
tools/ios_tools/cocoapods-lynx-library/
```

它由 CocoaPods plugin DSL 调用，扫描同一份 package manifest，加入 library Pod，
并生成 `LynxLibraryRegistry` Pod 和静态 addon 保活代码。

Lynxtron client：

```text
src/packages/lynxtron-dev-plugins/
```

`pluginLynxtron` 扫描宿主依赖中的 `lynx.lib.json`，将匹配的 package stage 到
`dist/.lynxtron/native`，并把 generated registration module 放到 desktop host
entry 之前执行。它通过 package 的 `./lynxtron` export 加载 `.node`。

这些目录是 Lynx SDK/tooling 的通用组件，不是 Explorer 内部实现，也不包含任何
OpenCV 专用判断。

### 2.3 Lynx SDK 通用入口

Android：

```text
platform/android/lynx_android/src/main/java/com/lynx/tasm/LynxEnv.java
platform/android/lynx_android/src/main/java/com/lynx/tasm/library/
```

`LynxEnv` 在初始化时查找固定 generated entry：

```text
com.lynx.tasm.library.LynxAutolinkGenerated
```

没有使用 AutoLink 的 App 不会生成该类，SDK 会按 no-op 处理。

iOS：

```text
platform/darwin/common/lynx/LynxAutolinkGeneratedLoader.m
```

该 SDK 文件在 `LynxConfig` / `LynxEnv` 初始化阶段查找 generated registry class。
不存在 registry 时同样保持 no-op。

### 2.4 OpenCV library

```text
explorer/showcase/native/opencv-document-scanner/
```

它拥有：

- `lynx.lib.json`
- Android Gradle/CMake target
- iOS Podspec 和 `addon_use.h`
- Lynxtron CMake target、Node entry 和 Lynx static-registration wrapper
- 共享 OpenCV C++ 实现
- TypeScript facade 和类型

### 2.5 Document Scanner 页面

```text
explorer/showcase/menu/opencv/
```

页面只 import：

```ts
import { OpenCVDocumentScanner } from
  '@lynx-showcase/opencv-document-scanner';
```

它不知道 Android `.so`、iOS Pod、Lynxtron `.node`、generated registry 或 AutoLink
client 的实现。

## 3. official develop 中的 SDK/client 边界

当前实现已经基于 official `develop`。该基线已包含：

- SDK 自动初始化 AutoLink generated entry。
- Android 和 iOS AutoLink client。
- `nodeApiAddons` manifest 支持。
- restricted N-API loader 和 weak-node-api runtime 接入。

因此 Explorer 与普通宿主的职责相同：

- 不需要修改 `LynxEnv`。
- 不需要实现 `LynxLibraryRegistry`。
- 不需要复制 Gradle/Ruby scanner 源码。
- 只需要按官网接入 AutoLink client，并安装 native library package。

### 3.1 Android 如何使用官方 client component

Explorer 仍使用 Gradle 6.7.1 / AGP 4.1.0。Gradle 6 无法通过现代
`pluginManagement { includeBuild(...) }` 在 settings 阶段消费仓库内的 plugin
源码。

因此仓库中的 Explorer 使用官方 dogfood loader：

```text
explorer/android/lynx_library_plugin_loader.gradle
```

它从 `platform/android/lynx_library_plugin` 加载官方 plugin class。业务 App 没有
实现 scanner，`settings.gradle` 只应用 client。

当支持 N-API addon 的 Gradle plugin 已正式发布时，普通宿主应使用官网形式：

```gradle
// settings.gradle
plugins {
  id 'org.lynxsdk.lynx.library-settings'
}
```

```gradle
// app/build.gradle
plugins {
  id 'com.android.application'
  id 'org.lynxsdk.lynx.library-build'
}
```

本 Showcase 没有修改 Android AutoLink client；它直接消费 official `develop`
已经提供的 `nodeApiAddons` 支持。

### 3.2 iOS client 的注册顺序修正

源码 checkout 中的 Podfile 直接加载仓库内的 CocoaPods plugin：

```ruby
$LOAD_PATH.unshift <cocoapods-lynx-library/lib>
load <cocoapods_plugin.rb>

target 'LynxExplorer' do
  use_lynx_library!
end
```

Official `develop` 已支持发现和链接 N-API addon。本分支对 iOS client 的新增修改
是：先安装 PrimJS weak-node-api provider、调用 `SetupWeakNodeApiEnv()`，再显式调用
每个 `_napi_register_xx_<Module>()`。外部宿主要获得这项注册顺序修正，需要使用包含
该修改的新版本 `cocoapods-lynx-library`。

### 3.3 Lynxtron 为什么有 AutoLink client 改动

OpenCV package 不需要修改 Lynxtron runtime 或 AutoLink scanner 才能被发现。
验证过程中发现并修复了两个与任意 native package 都相关的 client 生命周期问题：

1. native package 原先在 `beforeRun` stage，随后会被 Rsbuild output clean 删除；
   staging 改到 `afterEmit`，确保 runtime 启动前产物仍在 output 中。
2. generated loader 原先固定读取 `process.argv[1]`，带 `--no-help`、`--inspect`
   等参数时会把 option 当成 App 路径；现在读取 plugin 追加在 argv 末尾的 App
   entry。

这些改动位于：

```text
src/packages/lynxtron-dev-plugins/src/autolink.ts
src/packages/lynxtron-dev-plugins/src/autolink-rspack.ts
src/packages/lynxtron-dev-plugins/test/autolink-rspack.test.js
```

它们不包含 OpenCV module 名、路径或业务判断。

## 4. 宿主依赖声明和 package 发现

宿主依赖写在：

```text
explorer/package.json
```

```json
{
  "dependencies": {
    "@lynx-showcase/opencv-document-scanner": "workspace:*"
  }
}
```

OpenCV library 自身将 `@lynx-js/weak-node-api` 和
`@lynx-js/lynx-library-headers` 声明为 npm runtime dependencies。前者为
Android、iOS 和 Lynxtron 的共享 C++ 提供同一套标准 Node-API headers；后者提供
Lynxtron registration headers。宿主不需要再通过私有路径传入另一套 N-API
headers。

安装 workspace 后生成：

```text
explorer/node_modules/@lynx-showcase/opencv-document-scanner
  -> ../../showcase/native/opencv-document-scanner
```

Android/iOS client 的实际扫描输入都是：

```text
explorer/node_modules/@lynx-showcase/opencv-document-scanner/lynx.lib.json
```

没有将 `explorer/showcase` 配成私有扫描根目录。Showcase 和 menu 自己也依赖该
package，只用于 TypeScript import 和页面打包。

Lynxtron 验证使用了 `/tmp` 下的独立标准宿主，并通过普通 npm dependency 安装同一
package：

```json
{
  "dependencies": {
    "@lynx-showcase/opencv-document-scanner":
      "file:<LYNX_ROOT>/explorer/showcase/native/opencv-document-scanner"
  }
}
```

宿主启用 `pluginLynxtron()`，没有手工 `require()` native binary，也没有复制
OpenCV 注册逻辑。

## 5. `lynx.lib.json`

文件：

```text
explorer/showcase/native/opencv-document-scanner/lynx.lib.json
```

核心配置：

```json
{
  "platforms": {
    "android": {
      "packageName": "org.lynxsdk.example.opencv",
      "sourceDir": "android",
      "nodeApiAddons": [
        {
          "name": "OpenCVDocumentScanner",
          "libraryName": "OpenCVDocumentScanner",
          "jniLibsDir": "android/src/main/jniLibs",
          "required": false
        }
      ]
    },
    "ios": {
      "sourceDir": "ios",
      "podspecPath": "ios/OpenCVDocumentScanner.podspec",
      "nodeApiAddons": [
        {
          "name": "OpenCVDocumentScanner",
          "podName": "OpenCVDocumentScanner",
          "podspecPath": "ios/OpenCVDocumentScanner.podspec",
          "addonUseHeader": "addon_use.h",
          "required": true
        }
      ]
    },
    "lynxtron": {
      "path": "lynxtron"
    }
  }
}
```

字段作用：

| 字段 | 作用 |
| --- | --- |
| `sourceDir` | 平台 native project 目录 |
| `name` | N-API module 名，JS loader 使用 |
| `libraryName` | Android `System.loadLibrary` 名，不含 `lib` / `.so` |
| `jniLibsDir` | 可选的 Android 预构建 addon 目录 |
| `podName` | iOS addon Pod 名 |
| `podspecPath` | iOS Podspec 路径 |
| `addonUseHeader` | iOS static registration 保活 header |
| `required` | 声明的预构建产物缺失时是否阻断 client |
| `platforms.lynxtron.path` | 需要作为 package mode stage 的 Lynxtron native 根目录 |

Android addon 当前由被 AutoLink 纳入的 Gradle library project 从源码编译，不在
源码中提交预构建 `jniLibs`，所以 `required` 为 `false`。这与 addon 功能是否
重要无关，只表示没有预构建 copy input。

以下名称必须一致：

```text
OpenCVDocumentScanner
```

- manifest addon `name`
- Android library output name
- C++ `NAPI_MODULE` name
- iOS `NAPI_USE` name
- Lynxtron `LYNX_REGISTER_NATIVE_MODULE` name
- TypeScript loader name

## 6. 共享 OpenCV N-API 实现

文件：

```text
shared/OpenCVDocumentScanner.cc
```

Android、iOS 和 Lynxtron 编译同一份代码，内容包括：

- OpenCV 文档检测和透视矫正。
- N-API 参数校验。
- 编码图片与 `ArrayBuffer` 转换。
- 返回对象构造。
- PrimJS N-API module registration。

算法将输入最大边缩到 1100 像素以内，再执行：

```text
BGR -> gray -> GaussianBlur -> Canny -> morphology close
```

候选文档需要满足：

- `approxPolyDP` 后为四个点。
- 四边形为凸多边形。
- 面积至少为图像面积的 18%。

检测成功时执行 perspective transform 和 adaptive threshold。检测失败时执行
unsharp mask，保证 API 仍返回可显示结果。

iOS 的 `FastOpenCV-iOS 1.0.4` 不包含 `photo.hpp`，因此实现只使用三端均存在的
`core`、`imgcodecs` 和 `imgproc`。OpenCV 5 将轮廓和 perspective API 移到
`opencv2/geometry/2d.hpp`，共享实现通过 `__has_include` 同时兼容 OpenCV 4 和 5。

## 7. Android 接入

### 7.1 Library build

文件：

```text
android/build.gradle
android/CMakeLists.txt
android/src/main/AndroidManifest.xml
```

依赖：

```text
org.opencv:opencv:4.9.0
org.lynxsdk.lynx:primjs:4.0.1-alpha.3
@lynx-js/weak-node-api:0.0.9
```

PrimJS 版本可通过宿主 property 覆盖：

```properties
lynx.primjs.version=<matching-version>
```

Explorer 使用旧 AGP 4.1，不能读取 OpenCV 4.9.0 的新版 Prefab metadata。Library
因此从同一个 AAR 显式提取：

```text
prefab/modules/opencv_java4/include/**
jni/**/*.so
```

CMake 从 npm package 解析 `@lynx-js/weak-node-api/headers`，将
`libopencv_java4.so`、`libnapi_adapter.so` 和 `libnapi.so` 声明为 imported
target，并生成：

```text
libOpenCVDocumentScanner.so
```

### 7.2 AutoLink client 行为

Android client 自动完成：

1. 从 Explorer 的 `node_modules` 发现 manifest。
2. include `:lynx_library__lynx_showcase_opencv_document_scanner`。
3. 给 `LynxExplorer` 增加 project dependency。
4. 为每个 App variant 生成 `LynxAutolinkGenerated.java`。
5. 在 generated entry 中调用：

```java
System.loadLibrary("OpenCVDocumentScanner");
```

Explorer 没有手工 include OpenCV Gradle project，也没有手工加载 addon。

OpenCV AAR 会同时通过 Java dependency 和 native CMake dependency进入 merge
过程。两者版本相同，Explorer 使用：

```gradle
pickFirst '**/libopencv_java4.so'
```

### 7.3 SDK runtime

`LynxEnv` 调用 generated entry并加载 `libOpenCVDocumentScanner.so`。addon 的
constructor调用标准 `napi_module_register`；`libnapi_adapter.so` 将它转发到
PrimJS registry。页面调用 `lynx.getModuleLoader().load(name)` 时，Lynx
restricted loader通过 `napi_find_module()` 找到 addon并创建 exports。

Official `develop` 已启用构建 N-API binding 所需的 runtime 能力。正式支持 N-API
addon AutoLink 的宿主 SDK 应自带该能力，不需要为每个 addon 重复修改 GN 配置。

不需要旧 Explorer 示例中的 `LynxNodeAPI.requireNodeAddon()` module，也不需要为
该页面增加 `enable_napi_addon` URL 参数。

## 8. iOS 接入

### 8.1 OpenCV Pod

文件：

```text
ios/OpenCVDocumentScanner.podspec
ios/generated/OpenCVDocumentScannerNapiWrapper.cc
ios/addon_use.h
```

依赖：

```ruby
s.dependency 'LynxWeakNodeAPI/core'
s.dependency 'FastOpenCV-iOS', '1.0.4'
```

wrapper 只 include 共享 C++：

```cpp
#include "../../shared/OpenCVDocumentScanner.cc"
```

### 8.2 Static registration 保活

iOS 使用 static framework。`addon_use.h` 按当前 codegen 约定执行：

```cpp
NAPI_USE(OpenCVDocumentScanner)
```

AutoLink client 生成：

```text
LynxGeneratedNodeAPIAddonUse.mm
```

其中 include：

```objc
#include <OpenCVDocumentScanner/addon_use.h>
```

由此保证 `_napi_register_xx_OpenCVDocumentScanner` 不被 linker 删除。
OpenCV Pod 同时定义 `LYNX_LIBRARY_MANUAL_NAPI_REGISTRATION=1`，因此该函数不会由
静态 constructor 提前执行，而是由 generated registry在 bridge初始化完成后调用。

### 8.3 Podfile

Explorer 只使用 client DSL：

```ruby
lynx_root = File.expand_path('../../../..', __dir__)
plugin 'cocoapods-lynx-library'

target 'LynxExplorer' do
  use_lynx_library!(
    :root => File.join(lynx_root, 'explorer'),
    :output_dir => File.join(__dir__, 'generated/lynx-library')
  )
end
```

Podfile 没有手工声明 `OpenCVDocumentScanner`。`pod install` 的 dependency graph
中，`LynxLibraryRegistry` 自动依赖 `OpenCVDocumentScanner`；OpenCV Pod 再依赖：

```text
LynxWeakNodeAPI/core
FastOpenCV-iOS
```

generated registry Pod 额外依赖：

```text
LynxWeakNodeAPI/primjs_bridge
PrimJS/napi/adapter
```

### 8.4 weak-node-api bridge 与注册顺序

三端共享 C++ 都使用 `@lynx-js/weak-node-api` 的标准 headers。iOS 不定义
`USE_WEAK_SUFFIX_NAPI`，所以 addon导入普通 `napi_*`，由
`LynxWeakNodeAPI/core` 提供实现。

iOS static initializers可能早于 PrimJS provider安装。generated
`LynxGeneratedNodeAPIAddonUse.mm` 因此在 `std::call_once` 中严格执行：

```text
PrimJSInstallWeakNodeApiRawPtrHostProvider(...)
SetupWeakNodeApiEnv()
_napi_register_xx_OpenCVDocumentScanner()
```

最后一步内部调用标准 `napi_module_register`。AppDelegate不需要手写 provider或
addon注册代码；这些都属于 AutoLink generated registry。

## 9. Lynxtron 接入

### 9.1 Package export 和 native target

文件：

```text
lynxtron/CMakeLists.txt
lynxtron/index.cjs
lynxtron/node_entry.cc
lynxtron/lynx_module.cc
```

`package.json` 导出：

```json
{
  "exports": {
    "./lynxtron": "./lynxtron/index.cjs"
  }
}
```

AutoLink stage package 后，generated host entry 调用：

```js
require('@lynx-showcase/opencv-document-scanner/lynxtron');
```

`index.cjs` 按 `process.platform` / `process.arch` 加载：

```text
lynxtron/dist/darwin/arm64/OpenCVDocumentScanner.node
```

### 9.2 为什么 `.node` 有两个入口

同一个动态库承担两个不同职责：

1. `node_entry.cc` 导出标准 `napi_register_module_v1`。Lynxtron AutoLink 在 desktop
   host 中 `require()` 时，Node 可以完成动态库加载。
2. `lynx_module.cc` 使用 `LYNX_REGISTER_NATIVE_MODULE`。动态库 constructor 执行后，
   将 `OpenCVDocumentScanner` creator 注册到 Lynx `GlobalModuleRegistry`。

Node entry 返回空 exports，因为它只负责让 host 加载动态库。页面不使用 Node
exports，而是通过 Lynx `NativeModules.OpenCVDocumentScanner` 调用 module。

Lynx module creator 使用 `@lynx-js/lynx-library-headers` 提供的 weak N-API ABI：

```text
napi_create_object_weak
napi_create_function_weak
napi_create_arraybuffer_weak
```

它与标准 Node entry 分属不同 translation unit，避免将 Node `napi_env` 和 Lynx
runtime `napi_env` 混用。

### 9.3 OpenCV runtime staging

macOS target 链接 OpenCV `core`、`imgcodecs` 和 `imgproc`，并将实际依赖的 OpenCV
runtime dylib 复制到 `.node` 同目录。`.node` 只保留 `@loader_path` rpath，因此
package 被 AutoLink 移动到：

```text
dist/.lynxtron/native/node_modules/
  @lynx-showcase/opencv-document-scanner/
```

后仍可加载。OpenCV 之外的 codec/BLAS runtime 由本机构建环境提供；正式发布 package
时应继续按目标平台的发布策略打包或声明这些系统依赖。

## 10. TypeScript facade

文件：

```text
generated/OpenCVDocumentScanner.ts
```

Android/iOS 使用当前 `lynx-stack` codegen API：

```ts
globalThis.getNapiLoader?.()
globalThis.__lynxNapiLoader
```

当前 Lynx checkout 对应的 loader API 是：

```ts
lynx.getModuleLoader?.()
```

facade 保留该兼容 fallback，最终统一执行：

```ts
loader.load('OpenCVDocumentScanner');
```

Lynxtron library contract 使用 `GlobalModuleRegistry` 和 `NativeModules`。facade 在
`SystemInfo.platform` 为 `macOS`、`windows` 或兼容值 `pc` 时返回：

```ts
NativeModules.OpenCVDocumentScanner
```

这个分支不会调用 restricted loader。移动端与 desktop 的差异封装在 package 内，
Document Scanner 页面不包含平台判断。

使用 `Proxy` 延迟 load，避免 import package 时 runtime 尚未 attach。

## 11. 独立 Document Scanner 页面

页面：

```text
explorer/showcase/menu/opencv/index.tsx
explorer/showcase/menu/opencv/styles.scss
explorer/showcase/menu/opencv/sudoku.png
```

`sudoku.png` 不直接提交到 Git；根目录 `DEPS` 固定 OpenCV commit、下载 URL 和
SHA-256，`tools/hab sync .` 在构建前恢复该资源。

`lynx.config.mjs` 增加独立 entry：

```js
opencv: './opencv/index.tsx'
```

没有修改 Explorer homepage 或 settings。图片处理函数使用：

```ts
'background only';
```

输入图片通过 `?inline` 放入 bundle，转换为 `ArrayBuffer` 后调用 addon。Native
返回的两个 JPEG `ArrayBuffer` 再转换为 data URL 显示。

构建产物会复制到：

```text
Android: explorer/android/lynx_explorer/src/main/assets/showcase/menu/
iOS: explorer/darwin/ios/lynx_explorer/LynxExplorer/Resource/showcase/menu/
Lynxtron: 由 desktop host build 复制到自己的 output
```

## 12. 构建

从 repo root 安装 workspace：

```bash
pnpm install --frozen-lockfile=false
```

当前仓库有既有 peer dependency 告警，pnpm 可能在完成链接后返回
`ERR_PNPM_PEER_DEP_ISSUES`。应确认 `explorer/node_modules` symlink 已生成，不要为
本 Showcase 修改无关 peer dependencies。

构建并复制 Showcase：

```bash
python3 explorer/showcase/build_and_copy.py
```

### 12.1 Android

```bash
cd explorer/android
./gradlew \
  :lynx_library__lynx_showcase_opencv_document_scanner:assembleDebug \
  :LynxExplorer:assembleNoasanDebug \
  --console=plain \
  --no-daemon
```

APK：

```text
explorer/android/lynx_explorer/build/outputs/apk/noasan/debug/
  LynxExplorer-noasan-debug.apk
```

### 12.2 iOS

```bash
bundle install

cd explorer/darwin/ios/lynx_explorer
bundle exec pod install --no-repo-update
```

构建 `.xcworkspace`：

```bash
xcodebuild \
  -workspace LynxExplorer.xcworkspace \
  -scheme LynxExplorer \
  -configuration Debug \
  -destination 'id=<SIMULATOR_UDID>' \
  -derivedDataPath /tmp/lynx-opencv-autolink-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  build
```

不要把 DerivedData 放到 Lynx repo 内。Lynx Podspec 的 source pattern 覆盖较大的源码
树，repo 内的 DerivedData 会被 CocoaPods glob 扫描，显著拖慢后续 `pod install`
或 `pod update`。

本机只有 Xcode 26。当前基线的 `LynxBackgroundRenderer.h` 会因既有
`-Wgnu-folding-constant` warning 在 `-Werror` 下失败。为了不把无关渲染修复加入
本 Showcase，验证命令临时增加：

```bash
OTHER_CFLAGS='$(inherited) -Wno-error=gnu-folding-constant' \
OTHER_CPLUSPLUSFLAGS='$(inherited) -Wno-error=gnu-folding-constant'
```

这是本地 Xcode 26 验证参数，不是 AutoLink 或 OpenCV 接入要求。

### 12.3 Lynxtron macOS

先生成当前 Lynxtron checkout 的 library headers：

```bash
cd <LYNXTRON_ROOT>/src/packages/lynx-library-headers
npm run copy-headers
```

构建 desktop addon：

```bash
cd <LYNX_ROOT>/explorer/showcase/native/opencv-document-scanner

cmake -S lynxtron -B lynxtron/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DOpenCV_DIR=<OPENCV_CMAKE_DIR> \
  -DLYNX_LIBRARY_HEADERS_DIR=\
<LYNXTRON_ROOT>/src/packages/lynx-library-headers/include

cmake --build lynxtron/build --config Release
```

产物：

```text
lynxtron/dist/darwin/arm64/OpenCVDocumentScanner.node
lynxtron/dist/darwin/arm64/libopencv_*.dylib
```

普通 Lynxtron宿主只需要：

1. 在 `dependencies` 中安装 OpenCV package。
2. 在 Node-targeted Rsbuild/Rspack config 中启用 `pluginLynxtron()`。
3. 构建 host；AutoLink 自动生成 registration module并 stage package。

验证宿主使用：

```bash
rsbuild build
lynxtron <HOST_DIST>/main.js
```

没有在 host `main.js` 中手工 `require()` OpenCV `.node`。

## 13. 打开独立页面

Schema：

```text
file://lynx?local://showcase/menu/opencv.lynx.bundle?fullscreen=true
```

推荐使用 DebugRouter/DevTool：

```bash
node <LYNX_DEVTOOL_SKILL>/scripts/index.mjs list-clients

node <LYNX_DEVTOOL_SKILL>/scripts/index.mjs open \
  'file://lynx?local://showcase/menu/opencv.lynx.bundle?fullscreen=true' \
  -c '<CLIENT_ID>'
```

再检查：

```bash
node <LYNX_DEVTOOL_SKILL>/scripts/index.mjs list-sessions \
  -c '<CLIENT_ID>'
```

预期 session URL：

```text
showcase/menu/opencv.lynx.bundle
```

## 14. 验证结果

### 14.1 Android 真机

设备：

```text
Google Pixel 6 Pro
Android 14
```

APK artifact 检查确认包含：

```text
lib/arm64-v8a/libOpenCVDocumentScanner.so
lib/arm64-v8a/libopencv_java4.so
lib/arm64-v8a/libnapi_adapter.so
lib/arm64-v8a/libnapi.so
assets/showcase/menu/opencv.lynx.bundle
```

Dex 中包含：

```text
com.lynx.tasm.library.LynxAutolinkGenerated
OpenCVDocumentScanner
```

启动日志确认 AutoLink 加载 addon：

```text
Load .../libOpenCVDocumentScanner.so ...: ok
```

页面调用日志：

```text
NAPI Setup Restricted Loader: napiRestrictedLoader1
Load restricted napi module succeed: OpenCVDocumentScanner
Load restricted napi module succeed from cache: OpenCVDocumentScanner
```

DevTool DOM 结果：

```text
Document contour detected
OpenCV 4.9.0 / Android / N-API
native time: 17.8 ms
input: 558x563
output: 485x469
points: 66,48;518,65;520,521;35,516
```

截图：

```text
/tmp/opencv-autolink-final/android.png
```

### 14.2 iOS 模拟器

目标：

```text
iPhone 15
iOS 17.2
```

`pod install` 成功，生成文件确认：

```text
LynxGeneratedNodeAPIAddonUse.mm
  -> #include <OpenCVDocumentScanner/addon_use.h>

LynxLibraryRegistry.podspec
  -> dependency OpenCVDocumentScanner

OpenCVDocumentScanner.podspec
  -> dependency LynxWeakNodeAPI/core
  -> dependency FastOpenCV-iOS

LynxLibraryRegistry.podspec
  -> dependency LynxWeakNodeAPI/primjs_bridge
  -> dependency PrimJS/napi/adapter
```

OpenCV addon target 和 Lynx Explorer workspace 均构建成功：

```text
OpenCVDocumentScanner: BUILD SUCCEEDED
LynxExplorer: BUILD SUCCEEDED
```

最终 `LynxExplorer.app/LynxExplorer` 二进制包含：

```text
_napi_register_xx_OpenCVDocumentScanner
_napi_module_register
PrimJSInstallWeakNodeApiRawPtrHostProvider
SetupWeakNodeApiEnv
```

这些符号证明标准 Node-API registration、weak-node-api bridge和 addon手工注册入口都
进入最终 App。最终二进制没有 `napi_create_object_weak` 等业务 `_weak` symbols。

页面调用日志：

```text
NAPI Setup Restricted Loader: napiRestrictedLoader1
Load restricted napi module succeed: OpenCVDocumentScanner
Load restricted napi module succeed from cache: OpenCVDocumentScanner
```

DevTool DOM 结果：

```text
Document contour detected
OpenCV 4.9.0 / iOS / N-API
native time: 29.8 ms
input: 558x563
output: 485x469
points: 66,48;518,65;520,521;35,516
```

截图：

```text
/tmp/opencv-autolink-final/ios-final.png
```

### 14.3 Lynxtron macOS

目标：

```text
macOS arm64
Lynxtron 1.0.0 local Release runtime
OpenCV 5.0.0
```

AutoLink resolution：

```text
package: @lynx-showcase/opencv-document-scanner
stageMode: package
platform: darwin
arch: arm64
path: lynxtron
```

host build 自动生成：

```text
node_modules/.cache/lynxtron-dev-plugins/autolink/register.mjs
```

并 stage：

```text
dist/.lynxtron/native/node_modules/
  @lynx-showcase/opencv-document-scanner/
    lynxtron/dist/darwin/arm64/
      OpenCVDocumentScanner.node
      libopencv_core.500.dylib
      libopencv_flann.500.dylib
      libopencv_geometry.500.dylib
      libopencv_imgproc.500.dylib
      libopencv_imgcodecs.500.dylib
```

源 package 与 staged `.node` SHA-256 一致：

```text
78a80366d52d158af5c404198c3e760d462e6de92ce51356697bfec653803d13
```

使用带 `--no-help` 的启动命令验证 generated loader从 `process.argv` 尾部解析 App
entry；AutoLink成功加载 staged package：

```text
OPENCV_AUTOLINK_HOST_READY .../opencv.lynx.bundle
```

DevTool通过独立 desktop client读取 DOM：

```text
Document contour detected
OpenCV 5.0.0 / macOS / N-API
native time: 15.3 ms
input: 558x563
output: 485x469
points: 66,48;518,65;520,521;35,516
```

截图：

```text
/tmp/opencv-lynxtron-host/opencv_document_scanner_window.png
```

截图 SHA-256：

```text
8bcc0504c93e0ad6489c4b81d9e8f59b3c2a75008c78acb608f5ee514a13d11d
```

本次 desktop DebugRouter自动避让到 `8903`，DevTool HDT client 和 session均发现
成功；DOM保存于 `/tmp/opencv-autolink-final/lynxtron-dom.json`。

## 15. 哪些改动是宿主必须的

对于使用已发布、且包含本功能的 Lynx SDK/client 的宿主：

必须：

1. 安装平台对应的 AutoLink client。
2. 在 Android settings/app、iOS Podfile 或 Lynxtron Rsbuild/Rspack 中启用 client。
3. 在宿主 package dependencies 中安装 OpenCV library。
4. 移动端使用与 Lynx runtime 匹配的 PrimJS 版本；Lynxtron native target 使用匹配
   runtime 的 `@lynx-js/weak-node-api` 与 `@lynx-js/lynx-library-headers`。

不需要：

1. 修改 Lynx SDK 的 `LynxEnv`。
2. 实现自己的 manifest scanner。
3. 实现自己的 generated registry。
4. 在宿主中手工注册 OpenCV。
5. 为每个 N-API addon增加一个 Java/Objective-C LynxModule。
6. 在 Lynxtron host中手工 `require()` `.node` 或复制 native binary。

本分支相对 official `develop` 不修改 Android AutoLink client 或 SDK generated
registry hook。iOS client diff 只处理 weak-node-api bridge 与 addon 注册顺序，不含
OpenCV 专用判断。Lynxtron repo 中的 client diff 是 output staging 和 argv 解析的
通用修复，同样不包含 OpenCV 专用接入代码。

## 16. 常见问题

### 16.1 Client 没发现 library

检查：

1. 宿主 `package.json` 是否依赖 package。
2. package 是否真实安装到宿主可达的 `node_modules`。
3. `lynx.lib.json` 是否在 package root。
4. `sourceDir`、Podspec、`jniLibsDir` 是否留在 package 目录内。

### 16.2 Android 有 project，但 APK 没有 addon

检查：

1. library CMake target 是否被构建。
2. output name 是否与 `libraryName` 一致。
3. ABI 是否与宿主一致。
4. application 是否自动获得 project dependency。
5. `merge<Variant>NativeLibs` 结果是否包含 `.so`。

### 16.3 Android 有 `.so`，但 loader 找不到 module

检查：

1. generated registry 是否调用 `System.loadLibrary`。
2. addon 是否导出 `_napi_register_xx_<name>`。
3. C++ 注册名是否与 manifest `name` 一致。
4. addon 是否链接 `libnapi_adapter.so` 与 `libnapi.so`。
5. 宿主 Lynx SDK 是否启用 N-API runtime；日志应出现
   `NAPI Setup Restricted Loader`。

### 16.4 iOS Pod 已加入，但 addon 找不到

检查：

1. `addon_use.h` 是否为 public header。
2. generated `LynxGeneratedNodeAPIAddonUse.mm` 是否 include 它。
3. `NAPI_USE` 名是否与 C++ 注册名一致。
4. addon Pod 是否依赖 `LynxWeakNodeAPI/core`。
5. generated registry 是否依赖 `LynxWeakNodeAPI/primjs_bridge` 与
   `PrimJS/napi/adapter`。
6. provider install、`SetupWeakNodeApiEnv()`、addon registration 的顺序是否正确。

### 16.5 Android 出现 provider ClassNotFound warning

当前 upstream client 会为 Android library 推导
`<packageName>.LynxLibraryProviderImpl`。纯 N-API library 没有 Java provider 时，
SDK registry 会记录 warning 并跳过 provider；addon 已在同一个 generated entry
中独立加载，不影响 N-API 功能。

判断是否成功应看：

```text
libOpenCVDocumentScanner.so load ok
Load restricted napi module succeed
```

### 16.6 Android 日志有 performance reporter NPE

当前 Explorer 可能输出与 reporter 配置相关的 `WeakReference.get()` NPE。它与
OpenCV addon load 无关。以 DevTool console、DOM 结果、restricted module load
日志和页面截图判断本 Showcase。

### 16.7 Lynxtron generated loader 找不到 staged package

检查：

1. output 中是否存在 `.lynxtron/native/node_modules/<package>`。
2. staging 是否在 Rsbuild output clean 之后执行；当前 client 使用 `afterEmit`。
3. `package.json` 是否导出 `./lynxtron`。
4. `lynx.lib.json` 是否声明 `platforms.lynxtron.path`。
5. generated loader 是否从 argv末尾解析 App entry，而不是固定读取
   `process.argv[1]`。

### 16.8 Lynxtron library 已加载，但页面找不到 module

检查：

1. `.node` 是否包含 `LYNX_REGISTER_NATIVE_MODULE` constructor。
2. static registration name 是否与 `NativeModules` property一致。
3. facade 是否在 desktop平台使用 `NativeModules`，而不是移动端 restricted loader。
4. module creator是否调用 weak N-API symbols。
5. `.node` 和配套 OpenCV dylib 是否具有有效签名和 `@loader_path` rpath。

## 17. 接入下一个 N-API library

复用本机制时：

1. 创建独立 npm package。
2. 在 package root 提供 `lynx.lib.json`。
3. 提供 Android build、iOS Podspec 和需要支持的 desktop native target。
4. 使用同一个 addon name 完成各平台 N-API 注册。
5. 提供当前 codegen 风格的 TypeScript facade。
6. 让宿主依赖该 package。
7. 添加独立验证页。
8. 检查平台 generated code、staged native产物、日志、DOM 和截图。

不要：

- 在宿主 App 中为每个 addon 手写 load/register。
- 修改首页作为临时验证页。
- 把 OpenCV、SQLite 等业务依赖放进 AutoLink client。
- 因无关 CI/build warning 修改其他模块。
