# 开发 OpenCV AutoLink N-API Module 并接入 Lynx 宿主

本文面向希望发布一个可被 Lynx 宿主自动发现的 OpenCV N-API library 的开发者。
示例 module 名为 `OpenCVDocumentScanner`，在 Android、iOS 和 Lynxtron macOS 上复用
同一套 C++ 文档扫描算法。

Lynx Explorer 是本文的参考宿主，但不是接入前提。你可以把相同步骤应用到自己的
Android App、iOS App 或 Lynxtron App。宿主只需要安装 library package 并启用
Lynx AutoLink client，不需要复制 OpenCV 注册代码，也不应该自己实现 AutoLink。

> 本文描述 N-API addon 所需的 AutoLink 扩展字段。请使用与宿主 Lynx SDK
> 匹配、且已经支持 `nodeApiAddons` 的 AutoLink client。不同 Lynx 版本的 client
> 安装坐标可能不同，版本和仓库配置应以该版本的
> [AutoLink 官方文档](https://lynxjs.org/3.9/guide/autolink.html)为准。

## 1. 最终架构

接入后有三个相互独立的角色：

```text
┌──────────────────────────────────────────────────────────┐
│ Lynx 页面                                                │
│ import { OpenCVDocumentScanner } from <library package>  │
└───────────────────────────┬──────────────────────────────┘
                            │ TypeScript facade
┌───────────────────────────▼──────────────────────────────┐
│ OpenCV library package                                  │
│ lynx.lib.json + shared C++ + Android/iOS/Lynxtron target│
└───────────────────────────┬──────────────────────────────┘
                            │ discovered from node_modules
┌───────────────────────────▼──────────────────────────────┐
│ Host App                                                 │
│ Android/iOS AutoLink client or pluginLynxtron            │
└──────────────────────────────────────────────────────────┘
```

职责边界如下：

- **Library 开发者**负责 API、C++ 实现、三端构建、`lynx.lib.json` 和 npm 发布内容。
- **宿主 App**负责安装 package、启用官方 AutoLink client，并提供与自身 Lynx SDK
  匹配的 N-API runtime。
- **AutoLink client**负责扫描 `node_modules`、加入 native target、生成注册入口以及
  stage native 产物。
- **业务页面**只调用 TypeScript API，不感知 `.so`、Pod 或 `.node` 文件。

宿主不应出现以下 OpenCV 专用代码：

```java
System.loadLibrary("OpenCVDocumentScanner");
```

也不应手工调用 N-API 注册函数。它们由 library 声明和 AutoLink generated code
共同处理。

## 2. 先确定公共 API

本示例用二进制输入和输出展示 N-API 的价值：

```ts
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
```

`scanDocument` 接收编码后的 PNG/JPEG `ArrayBuffer`，执行：

1. 图片解码。
2. 灰度化、Gaussian blur、Canny 和 morphology close。
3. 四边形文档轮廓检测。
4. Perspective transform。
5. Adaptive threshold。
6. 将矫正图和边缘图编码成 JPEG `ArrayBuffer` 返回。

在写各平台构建文件前固定 module 名：

```text
OpenCVDocumentScanner
```

以下位置必须使用完全相同的名称：

- `lynx.lib.json` 中 Android/iOS addon 的 `name`
- Android `.so` 的 `libraryName`
- PrimJS N-API 注册宏
- iOS `NAPI_USE(...)`
- Lynxtron `LYNX_REGISTER_NATIVE_MODULE(...)`
- TypeScript loader

名称不一致时，native binary 可能已被打包，但 runtime 仍然找不到 module。

## 3. 创建 npm library package

建议目录结构：

```text
opencv-document-scanner/
├── package.json
├── lynx.lib.json
├── README.md
├── DEVELOPER_GUIDE.md
├── shared/
│   └── OpenCVDocumentScanner.cc
├── generated/
│   └── OpenCVDocumentScanner.ts
├── src/
│   └── index.ts
├── types/
│   └── index.d.ts
├── android/
│   ├── build.gradle
│   ├── CMakeLists.txt
│   └── src/main/AndroidManifest.xml
├── ios/
│   ├── OpenCVDocumentScanner.podspec
│   ├── addon_use.h
│   └── generated/OpenCVDocumentScannerNapiWrapper.cc
└── lynxtron/
    ├── CMakeLists.txt
    ├── index.cjs
    ├── node_entry.cc
    ├── lynx_module.cc
    └── dist/
        └── darwin/<arch>/
```

基础 `package.json`：

```json
{
  "name": "@your-scope/opencv-document-scanner",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./types/index.d.ts",
  "exports": {
    ".": {
      "types": "./types/index.d.ts",
      "default": "./src/index.ts"
    },
    "./lynxtron": "./lynxtron/index.cjs",
    "./package.json": "./package.json"
  },
  "dependencies": {
    "@lynx-js/weak-node-api": "<与 Lynx runtime 匹配的版本>",
    "@lynx-js/lynx-library-headers": "<与 Lynxtron runtime 匹配的版本>"
  },
  "files": [
    "android",
    "generated",
    "ios",
    "lynxtron/dist",
    "lynxtron/index.cjs",
    "lynxtron/lynx_module.cc",
    "lynxtron/node_entry.cc",
    "lynx.lib.json",
    "shared",
    "src",
    "types",
    "DEVELOPER_GUIDE.md"
  ]
}
```

注意：

- `@lynx-js/weak-node-api` 必须是 package 的 runtime dependency，因为 Android、
  iOS 和 Lynxtron 都从它解析共享源码所需的标准 Node-API headers。
- `@lynx-js/lynx-library-headers` 提供 Lynxtron registration headers；即使只在
  native build 阶段读取，也建议作为 runtime dependency 发布，确保消费方安装
  package 后能够直接构建目标架构。
- `lynx.lib.json` 必须发布到 package 根目录。
- `./lynxtron` export 是 Lynxtron AutoLink 的 native package 入口。
- `lynxtron/dist` 必须在发包前包含目标架构的产物。
- 不要发布 CMake/Gradle 缓存，如 `build/`、`.cxx/` 和 `_tmp_extract/`。
- 宿主应把该 package 放在 `dependencies`，不要只放在 `devDependencies`。

## 4. 实现共享 C++ N-API 核心

共享源文件只负责算法和 exports 绑定，不包含 Android、iOS 或 Lynxtron 宿主逻辑。
核心形态如下：

```cpp
#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include "napi.h"

#if defined(USE_WEAK_SUFFIX_NAPI)
#include "weak_napi_defines.h"
#endif

#if defined(LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE)
// Define the PrimJS registry record with standard Node-API types. See the
// complete source for the registration macro.
#endif

Napi::Value ScanDocument(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsArrayBuffer()) {
    Napi::TypeError::New(env, "scanDocument expects an ArrayBuffer.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::ArrayBuffer input = info[0].As<Napi::ArrayBuffer>();
  // 1. cv::imdecode
  // 2. contour detection and perspective transform
  // 3. cv::imencode
  // 4. return a Napi::Object containing ArrayBuffer results
}

napi_value Bind(napi_env env, napi_value exports) {
  Napi::Object target(env, exports);
  target.Set("scanDocument",
             Napi::Function::New(env, ScanDocument, "scanDocument"));
  return exports;
}

#if defined(LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE)
LYNX_NAPI_MODULE(OpenCVDocumentScanner, Bind)
#endif

#if defined(USE_WEAK_SUFFIX_NAPI)
#include "weak_napi_undefs.h"
#endif
```

示例完整实现位于 `shared/OpenCVDocumentScanner.cc`。它额外处理了：

- N-API 参数类型和 JPEG quality 范围。
- OpenCV 异常到 JS exception 的转换。
- `cv::Mat` 与 `ArrayBuffer` 间的拷贝。
- 大图缩放，避免轮廓检测开销无限增长。
- OpenCV 4/5 geometry header 差异。

三端必须编译同一份标准 Node-API 源码。`napi.h`、`node_api.h` 和
`weak_napi_defines.h` 都来自 `@lynx-js/weak-node-api`：

- Android 不启用 suffix；`libnapi_adapter.so` 提供普通 `napi_*` symbols，并在
  加载时自动把 weak-node-api host table 注入为 PrimJS adapter。
- iOS 不启用 suffix；addon链接 `LynxWeakNodeAPI/core`，generated AutoLink
  registry在引用 addon 前安装 PrimJS provider并调用 `SetupWeakNodeApiEnv()`。
- Lynxtron启用 `USE_WEAK_SUFFIX_NAPI`，同一源码中的 `napi_*` 在编译期改名为
  `napi_*_weak`，由 Lynxtron runtime提供实现。

`LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE` 只生成移动端需要的标准
`napi_module`/`napi_module_register` 注册入口，不改变业务方法使用的标准
Node-API。Lynxtron 的 Node loading entry 和 Lynx weak N-API entry 仍需分开，见第
8 节。

## 5. 编写 `lynx.lib.json`

三端声明可以放在同一份 manifest：

```json
{
  "platforms": {
    "android": {
      "packageName": "com.example.opencv",
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

字段说明：

| 字段                            | 作用                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `platforms.android.packageName` | Android library package namespace                    |
| `platforms.android.sourceDir`   | package 内 Android Gradle project                    |
| `name`                          | Lynx runtime 查找的 N-API module 名                  |
| `libraryName`                   | `System.loadLibrary` 名，不包含 `lib` 和 `.so`       |
| `jniLibsDir`                    | package 内可选预构建 `.so` 根目录                    |
| `required`                      | 声明的预构建输入缺失时是否让 AutoLink 失败           |
| `platforms.ios.sourceDir`       | package 内 iOS native source 根目录                  |
| `podspecPath`                   | package 内 Podspec 路径                              |
| `podName`                       | addon Pod 名                                         |
| `addonUseHeader`                | 防止 iOS static registration 被 dead-strip 的 header |
| `platforms.lynxtron.path`       | Lynxtron 要 stage 的 native package 根目录           |

本示例 Android addon 从源码构建，所以 `jniLibsDir` 中没有预提交
`libOpenCVDocumentScanner.so`，`required` 为 `false`。Android library project
本身仍会把 CMake 输出打进 AAR/APK。

如果发布的是预构建 Android binary：

```text
android/src/main/jniLibs/
├── arm64-v8a/libOpenCVDocumentScanner.so
└── x86_64/libOpenCVDocumentScanner.so
```

则应确认所有支持 ABI 都有产物，并通常把 `required` 设为 `true`。

manifest 中的所有相对路径都必须留在 package 目录内。不要用 `../` 指向宿主源码。

## 6. Android native target

### 6.1 依赖与 header 版本

Android target 需要：

- OpenCV Android SDK 或 AAR。
- `@lynx-js/weak-node-api` 提供的标准 Node-API headers。
- 与宿主 Lynx SDK 对应的 PrimJS `libnapi_adapter.so` 和 `libnapi.so`。

共享源码不使用 PrimJS 私有 header。宿主通过 Gradle property统一 addon和
Lynx runtime使用的 PrimJS版本：

```properties
lynx.primjs.version=<与宿主 Lynx SDK 匹配的 PrimJS 版本>
```

package将 `@lynx-js/weak-node-api` 声明为 npm dependency。CMake从 package root
解析该依赖，不依赖 Lynx monorepo 相对路径。

### 6.2 Gradle library

示例使用 OpenCV AAR 和 PrimJS AAR：

```gradle
apply plugin: 'com.android.library'

def primjsVersion = rootProject.findProperty('lynx.primjs.version')

configurations {
    primjsNativeAar
    opencvNativeAar
}

task extractPrimjsNativeLibraries(type: Sync) {
    from { configurations.primjsNativeAar.collect { zipTree(it) } }
    include 'jni/**/*.so'
    into "$buildDir/primjs-native"
}

task extractOpenCVNativeLibraries(type: Sync) {
    from { configurations.opencvNativeAar.collect { zipTree(it) } }
    include 'prefab/modules/opencv_java4/include/**'
    include 'jni/**/*.so'
    into "$buildDir/opencv-native"
}

android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DLYNX_PRIMJS_JNI_DIR=$buildDir/primjs-native/jni",
                          "-DOPENCV_NATIVE_DIR=$buildDir/opencv-native"
                cppFlags "-std=c++17", "-fexceptions", "-frtti"
            }
        }
    }
}

dependencies {
    implementation 'org.opencv:opencv:<opencv-version>'
    opencvNativeAar 'org.opencv:opencv:<opencv-version>@aar'
    implementation "org.lynxsdk.lynx:primjs:${primjsVersion}"
    primjsNativeAar "org.lynxsdk.lynx:primjs:${primjsVersion}@aar"
}
```

如果宿主使用较新的 AGP/Prefab，可以直接消费 Prefab target；显式解压 AAR 不是
AutoLink 的要求，只是兼容旧 AGP 的一种 library build 方案。

### 6.3 CMake

关键点是生成与 manifest `libraryName` 对应的共享库：

```cmake
cmake_minimum_required(VERSION 3.18.1)
project(OpenCVDocumentScannerAndroid LANGUAGES C CXX)

add_library(opencv_java4 SHARED IMPORTED)
set_target_properties(opencv_java4 PROPERTIES
  IMPORTED_LOCATION
    "${OPENCV_NATIVE_DIR}/jni/${ANDROID_ABI}/libopencv_java4.so"
  INTERFACE_INCLUDE_DIRECTORIES
    "${OPENCV_NATIVE_DIR}/prefab/modules/opencv_java4/include"
)

add_library(lynx_primjs_napi SHARED IMPORTED)
set_target_properties(lynx_primjs_napi PROPERTIES
  IMPORTED_LOCATION "${LYNX_PRIMJS_JNI_DIR}/${ANDROID_ABI}/libnapi.so"
)

add_library(lynx_primjs_napi_adapter SHARED IMPORTED)
set_target_properties(lynx_primjs_napi_adapter PROPERTIES
  IMPORTED_LOCATION
    "${LYNX_PRIMJS_JNI_DIR}/${ANDROID_ABI}/libnapi_adapter.so"
)

add_library(OpenCVDocumentScanner SHARED
  ../shared/OpenCVDocumentScanner.cc
)

target_include_directories(OpenCVDocumentScanner PRIVATE
  "${LYNX_WEAK_NODE_API_PACKAGE_ROOT}/headers"
)
target_compile_definitions(OpenCVDocumentScanner PRIVATE
  LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1
)
target_link_libraries(OpenCVDocumentScanner PRIVATE
  opencv_java4
  lynx_primjs_napi_adapter
  lynx_primjs_napi
)
```

`libnapi_adapter.so` 同时包含无 suffix 的 weak-node-api implementation和 PrimJS
host注入逻辑。最终 addon应导入标准 `napi_create_object`、`napi_get_cb_info` 等
symbols，不应出现 `napi_*_weak`。

AutoLink client 会根据 manifest 生成 `System.loadLibrary` 调用。Library 自己只负责
产出 `libOpenCVDocumentScanner.so`。

### 6.4 Android 宿主启用 AutoLink

先将 native library 安装为宿主的直接依赖：

```json
{
  "dependencies": {
    "@your-scope/opencv-document-scanner": "^0.0.1"
  }
}
```

安装依赖后，应存在：

```text
<HOST_ROOT>/node_modules/@your-scope/opencv-document-scanner/lynx.lib.json
```

然后按宿主 Lynx SDK 对应的 AutoLink 文档安装 client，并应用两个标准插件：

```gradle
// settings.gradle
plugins {
    id 'org.lynxsdk.lynx.library-settings'
}
```

```gradle
// Android application module
plugins {
    id 'com.android.application'
    id 'org.lynxsdk.lynx.library-build'
}
```

实际插件版本、plugin repository 和 Gradle 兼容范围必须与宿主 Lynx SDK 对齐，
不要从本示例复制版本号。

标准 client 自动完成：

1. 扫描宿主 `node_modules` 中的 `lynx.lib.json`。
2. 将 package 的 Android library project 加入 Gradle graph。
3. 给 application 增加 project dependency。
4. 生成 AutoLink registry。
5. 打包 N-API addon 和依赖的 OpenCV runtime。
6. 在 Lynx 初始化时加载 addon。

如果 OpenCV runtime 同时由宿主其他依赖引入，Android merge 可能报告重复
`libopencv_java4.so`。优先统一 OpenCV 依赖来源；只有确认二者是同一个 binary
时才在宿主 packaging 配置中使用 `pickFirst`，不要把它当成 AutoLink 必需配置。

## 7. iOS native target

### 7.1 Podspec

Pod使用 `LynxWeakNodeAPI/core` 提供标准 headers与 implementation，再依赖一个
iOS OpenCV distribution：

```ruby
Pod::Spec.new do |s|
  s.name = 'OpenCVDocumentScanner'
  s.version = '0.0.1'
  s.summary = 'OpenCV document scanner for Lynx N-API AutoLink'
  s.source = { :path => '..' }
  s.platform = :ios, '13.0'
  s.source_files = 'generated/**/*.{cc,h,mm}', 'addon_use.h'
  s.public_header_files = 'addon_use.h'
  s.dependency 'LynxWeakNodeAPI/core'
  s.dependency 'FastOpenCV-iOS', '<compatible-version>'
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' =>
      '$(inherited) "${PODS_ROOT}/LynxWeakNodeAPI/packages/weak-node-api/headers"',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' =>
      '$(inherited) LYNX_LIBRARY_MANUAL_NAPI_REGISTRATION=1 LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1'
  }
end
```

OpenCV Pod 的最低 iOS 版本、C++ runtime、bitcode 和 simulator slice 必须与宿主
一致。addon不直接依赖 PrimJS；generated registry依赖宿主版本的
`PrimJS/napi/adapter` 并负责 bridge初始化。

### 7.2 编译共享实现

为了不复制算法，wrapper 只 include 共享源文件：

```cpp
// ios/generated/OpenCVDocumentScannerNapiWrapper.cc
#include "../../shared/OpenCVDocumentScanner.cc"
```

共享源只会被该 wrapper 编译一次。不要再把 `shared/*.cc` 同时加入 Pod
`source_files`，否则会产生重复 symbol。

### 7.3 防止 static registration 被裁剪

`addon_use.h`：

```cpp
#ifndef EXPLORER_SHOWCASE_NATIVE_OPENCV_DOCUMENT_SCANNER_IOS_ADDON_USE_H_
#define EXPLORER_SHOWCASE_NATIVE_OPENCV_DOCUMENT_SCANNER_IOS_ADDON_USE_H_

#include <LynxWeakNodeAPI/headers/node_api.h>

#ifndef NAPI_USE
#define NAPI_USE(modname)                                         \
  EXTERN_C_START                                                  \
  extern void _napi_register_xx_##modname(void);                  \
  __attribute__((used)) static void* _napi_module_##modname##_p = \
      (void*)&_napi_register_xx_##modname;                        \
  EXTERN_C_END
#endif

NAPI_USE(OpenCVDocumentScanner)

#endif  // EXPLORER_SHOWCASE_NATIVE_OPENCV_DOCUMENT_SCANNER_IOS_ADDON_USE_H_
```

AutoLink generated Pod 会 include manifest 指定的 `addonUseHeader`。这一步使 linker
保留 `_napi_register_xx_OpenCVDocumentScanner`，否则 Pod 已链接成功但 runtime
仍可能找不到 module。

### 7.4 iOS 宿主启用 AutoLink

宿主同样先把 npm package 放到 `dependencies` 并完成安装，然后在与宿主 Lynx SDK
匹配的 Gemfile 中安装官方 CocoaPods client：

```ruby
gem 'cocoapods-lynx-library', '<与宿主 Lynx SDK 匹配的版本>'
```

Podfile：

```ruby
plugin 'cocoapods-lynx-library'

target 'YourApp' do
  use_lynx_library!(
    :root => File.expand_path('../../..', __dir__),
    :output_dir => File.join(__dir__, 'generated/lynx-library')
  )

  # Existing Lynx pods...
end
```

`:root` 应指向能够向上找到宿主 `node_modules` 的工程目录，不是
`opencv-document-scanner/ios`。随后执行：

```bash
bundle install
bundle exec pod install
```

client 自动：

1. 从 `node_modules` 发现 manifest。
2. 按 `podspecPath` 加入 `OpenCVDocumentScanner` Pod。
3. 生成 `LynxLibraryRegistry` Pod。
4. 让 registry依赖 `LynxWeakNodeAPI/primjs_bridge` 与 `PrimJS/napi/adapter`。
5. 生成 translation unit，在引用 `addon_use.h` 前安装 PrimJS provider，并调用
   `SetupWeakNodeApiEnv()`，随后显式调用 `_napi_register_xx_<Module>()`。
6. 让 Lynx SDK 在创建 `LynxConfig` 时应用 generated registry。

宿主不需要再写：

```ruby
pod 'OpenCVDocumentScanner', :path => '...'
```

如果必须手工添加该 Pod，通常说明 AutoLink 没有扫描到 package，应先修复依赖安装、
`:root` 或 client 版本，而不是增加第二套接入路径。

## 8. Lynxtron native target

本示例已实现并验证 macOS arm64。相同 package schema 可以扩展 Windows/x64，
但必须另外构建 Windows `.node`、链接 Lynxtron runtime import library，并 stage
OpenCV DLL；不能只复制 macOS binary。

### 8.1 使用官方 header package

开发依赖：

```json
{
  "dependencies": {
    "@lynx-js/weak-node-api": "<与 Lynx runtime 匹配的版本>",
    "@lynx-js/lynx-library-headers": "<与 Lynxtron runtime 匹配的版本>"
  }
}
```

两个 package 职责不同：

- `@lynx-js/weak-node-api` 提供共享源码使用的 `napi.h`、`node_api.h`、
  `weak_napi_defines.h` 和 `weak_napi_undefs.h`。
- `@lynx-js/lynx-library-headers` 提供 Lynxtron 的 `lynx/registration.h`。

Android、iOS 和 Lynxtron 必须使用同一套 weak-node-api headers。差别只是 Lynxtron
的 Lynx entry 定义 `USE_WEAK_SUFFIX_NAPI=1`，移动端不定义。

### 8.2 为什么需要两个 native entry

一个 Lynxtron `.node` 同时服务两个阶段：

1. **Node entry** 让 desktop host 可以通过 `require()`/AutoLink 加载 dynamic
   library。
2. **Lynx entry** 在 library 被加载时把 creator 注册到 Lynx runtime，页面随后
   才能从 `NativeModules` 获取 module。

Node entry：

```cpp
#include <node_api.h>

napi_value InitNodeEntry(napi_env env, napi_value exports) {
  return exports;
}

NAPI_MODULE(OpenCVDocumentScannerLynxtron, InitNodeEntry)
```

Lynx entry：

```cpp
#include <lynx/registration.h>

#include "../shared/OpenCVDocumentScanner.cc"

::lynx::registration::LynxNapiValue CreateOpenCVDocumentScanner(
    ::lynx::registration::LynxNapiEnv env,
    ::lynx::registration::LynxNapiValue exports,
    const char* module_name,
    void* opaque) {
  return Bind(env, exports);
}

LYNX_REGISTER_NATIVE_MODULE(
    "OpenCVDocumentScanner",
    CreateOpenCVDocumentScanner,
    nullptr)
```

只实现 Node entry 时，`.node` 可以被加载，但 Lynx 页面看不到 module。只实现
Lynx registration 时，Node loader 又可能因缺少标准 module entry 拒绝加载。

### 8.3 CMake 要点

```cmake
find_package(OpenCV REQUIRED COMPONENTS core imgcodecs imgproc)

add_library(OpenCVDocumentScannerLynxtron MODULE
  node_entry.cc
  lynx_module.cc
)

set_source_files_properties(lynx_module.cc PROPERTIES
  COMPILE_DEFINITIONS
    "LYNXTRON_DESKTOP=1;NAPI_CPP_CUSTOM_NAMESPACE=opencv_document_scanner;USE_WEAK_SUFFIX_NAPI=1"
)

target_include_directories(OpenCVDocumentScannerLynxtron PRIVATE
  "${LYNX_WEAK_NODE_API_ROOT}/headers"
  "${LYNX_LIBRARY_HEADERS_DIR}"
  "${OpenCV_INCLUDE_DIRS}"
)
target_link_libraries(OpenCVDocumentScannerLynxtron PRIVATE ${OpenCV_LIBS})

set_target_properties(OpenCVDocumentScannerLynxtron PROPERTIES
  PREFIX ""
  OUTPUT_NAME "OpenCVDocumentScanner"
  SUFFIX ".node"
  LIBRARY_OUTPUT_DIRECTORY
    "${CMAKE_CURRENT_SOURCE_DIR}/dist/darwin/${LYNXTRON_ARCH}"
)
```

`NAPI_CPP_CUSTOM_NAMESPACE` 避免同一进程中不同 N-API C++ wrapper 实例的符号冲突。
`USE_WEAK_SUFFIX_NAPI` 让 Lynx module 使用 weak N-API trampoline，而不是 Node
runtime 的普通 symbol。

macOS 还需要：

- 给 `.node` 设置能找到相邻 OpenCV dylib 的 rpath，如 `@loader_path`。
- 将实际依赖的 OpenCV dylib 复制到同一架构目录。
- 对 `.node` 和复制后的 dylib 执行适合发布方式的 codesign。
- 分别产出 `dist/darwin/arm64` 和 `dist/darwin/x64`，如果 package 声明支持两种架构。

### 8.4 JS native entry

```js
// lynxtron/index.cjs
const path = require('node:path');

module.exports = require(path.join(
  __dirname,
  'dist',
  process.platform,
  process.arch,
  'OpenCVDocumentScanner.node'
));
```

该路径约定必须与 CMake output 一致。

### 8.5 Lynxtron 宿主启用 AutoLink

宿主安装 package：

```json
{
  "dependencies": {
    "@your-scope/opencv-document-scanner": "^0.0.1"
  }
}
```

在 Node-targeted Rsbuild environment 中使用 `pluginLynxtron`：

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginLynxtron } from '@lynx-js/lynxtron-dev-plugins/rsbuild';

export default defineConfig({
  environments: {
    desktop: {
      source: {
        entry: {
          main: './src/main.ts',
          preload: './src/preload.ts',
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

`pluginLynxtron` 默认启用 AutoLink。它会：

1. 扫描 dependency package 的 `lynx.lib.json`。
2. 读取 `platforms.lynxtron.path` 和 `./lynxtron` export。
3. 将 native package stage 到 desktop output 的 `.lynxtron/native`。
4. 在 desktop host entry 前注入 generated registration module。
5. 启动 Lynxtron 时加载 `.node`。

除非宿主有自己完整的 native staging/loading 方案，否则不要设置
`autolink: false`。

## 9. 编写跨平台 TypeScript facade

移动端和桌面的获取方式不同：

- Android/iOS：restricted N-API loader。
- Lynxtron：`NativeModules`。

可以在 package 中统一封装：

```ts
const ADDON_NAME = 'OpenCVDocumentScanner';

interface LynxNapiLoader {
  load(moduleName: string): Record<string, unknown>;
}

declare const NativeModules: Record<string, unknown>;
declare const SystemInfo: { platform?: string };
declare const lynx: {
  getModuleLoader?(): LynxNapiLoader | undefined;
};

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

  const addon = lynx.getModuleLoader?.()?.load(ADDON_NAME);
  if (addon !== undefined) {
    return (addon as unknown) as OpenCVDocumentScannerSpec;
  }

  throw new Error(`N-API addon "${ADDON_NAME}" is unavailable.`);
}
```

如果需要兼容旧宿主注入的 `getNapiLoader` 或 `__lynxNapiLoader`，可以在 facade 中
增加 fallback，但它们不应替代当前 SDK 的标准 loader。

业务页面只 import facade：

```ts
import { OpenCVDocumentScanner } from '@your-scope/opencv-document-scanner';

const result = OpenCVDocumentScanner.scanDocument(encodedImage, 88);
console.log(OpenCVDocumentScanner.getRuntimeInfo());
```

页面无需按平台 import 不同实现。

## 10. 接入任意宿主 App

对已有宿主，推荐按以下顺序执行。

### 步骤 1：确认版本能力

确认宿主使用的 Lynx SDK 和 AutoLink client：

- 支持 native library package。
- 支持 `platforms.android.nodeApiAddons`。
- 支持 `platforms.ios.nodeApiAddons` 和 `addonUseHeader`。
- 提供 restricted N-API module loader。
- Lynxtron host 使用支持 native package staging 的 `pluginLynxtron`。

如果缺少这些能力，应先升级官方 SDK/client。不要在业务 App 中复制 scanner、
registry generator 或 SDK runtime hook 来绕过版本问题。

### 步骤 2：安装 package

```bash
pnpm add @your-scope/opencv-document-scanner
```

或使用 npm/yarn。检查 package 根目录同时包含：

```text
package.json
lynx.lib.json
android/
ios/
lynxtron/
```

### 步骤 3：配置 Android client

按宿主版本的官方文档安装并应用：

```text
org.lynxsdk.lynx.library-settings
org.lynxsdk.lynx.library-build
```

同时传入与宿主匹配的 PrimJS version。宿主 Lynx SDK 必须构建并启用 restricted
N-API runtime；已正式支持 N-API addon AutoLink 的 SDK 会自带该能力，不需要为
每个 addon 单独修改 GN 配置。

### 步骤 4：配置 iOS client

安装与宿主匹配的 `cocoapods-lynx-library`，在 Podfile 中：

```ruby
plugin 'cocoapods-lynx-library'
use_lynx_library!
```

然后重新执行 `pod install`。

### 步骤 5：配置 Lynxtron client

在 Node-targeted desktop build 中启用 `pluginLynxtron()`，并确保 package 已经为
目标 OS/arch 构建 `.node` 和 OpenCV runtime。

### 步骤 6：构建并打开独立验证页面

建议新建独立页面，不要临时改宿主首页或设置页。验证页面至少展示：

- 原图。
- OpenCV edge map。
- Perspective-corrected image。
- `processingMs`。
- `getRuntimeInfo()`。

这样可以同时证明：

- package 被发现。
- native binary 被加载。
- N-API 参数和返回对象可用。
- `ArrayBuffer` 双向传输可用。
- OpenCV 算法确实在 native 层执行。

## 11. Lynx Explorer 示例如何映射到通用步骤

本仓库中的参考实现对应关系：

| 通用角色           | Explorer 示例                                      |
| ------------------ | -------------------------------------------------- |
| npm native library | `explorer/showcase/native/opencv-document-scanner` |
| 宿主 dependency    | `explorer/package.json`                            |
| Android host       | `explorer/android`                                 |
| iOS host           | `explorer/darwin/ios/lynx_explorer`                |
| 独立验证页面       | `explorer/showcase/menu/opencv`                    |
| 页面 entry         | `opencv`                                           |

Explorer 页面只做：

```ts
import { OpenCVDocumentScanner } from '@lynx-showcase/opencv-document-scanner';
```

它没有调用 `System.loadLibrary`、没有引用 Pod、没有 `require()` `.node`。

Official `develop` 已包含 Android/iOS AutoLink client 和 SDK generated-registry
hook：

```text
platform/android/lynx_library_plugin/
tools/ios_tools/cocoapods-lynx-library/
platform/android/lynx_android/.../library/
platform/darwin/common/lynx/LynxAutolinkGeneratedLoader.m
```

Explorer 的 Gradle 版本较旧，因此使用仓库提供的本地 class loader；iOS 源码工程
直接加载仓库内的 CocoaPods plugin。它们是仓库 dogfood 方式，不是普通外部宿主的
接入步骤。本 Showcase 不要求外部宿主复制这些源码。

外部宿主若使用已包含这些能力的正式 Lynx SDK，只需：

1. 安装 native library package。
2. 安装并启用对应版本的 AutoLink client。
3. 正常构建 App。

不要修改 `LynxEnv`，不要复制 `LynxAutolinkGeneratedLoader.m`，也不要在 App 中实现
自己的 manifest scanner。

## 12. 构建与验证

### 12.1 先检查 npm 发布内容

```bash
npm pack --dry-run
```

确认包含：

- `lynx.lib.json`
- Android Gradle/CMake/source
- iOS Podspec、wrapper、`addon_use.h`
- shared C++
- TypeScript facade 和 types
- Lynxtron `index.cjs`
- 目标 OS/arch 的 `.node` 和 OpenCV runtime

确认不包含：

- `android/build`
- `lynxtron/build`
- `.cxx`
- 本机绝对路径
- 临时解压目录

### 12.2 Android

构建宿主 App，而不是只构建 library：

```bash
./gradlew :app:assembleDebug
```

检查：

1. Gradle graph 中出现 AutoLink 加入的 library project。
2. generated registry 中有 `OpenCVDocumentScanner`。
3. APK 中有目标 ABI 的：

```text
libOpenCVDocumentScanner.so
libopencv_java4.so
libnapi_adapter.so
libnapi.so
```

4. 真机页面能返回 runtime 信息和两张结果图。

### 12.3 iOS

```bash
bundle exec pod install
xcodebuild \
  -workspace <YourApp>.xcworkspace \
  -scheme <YourScheme> \
  -sdk iphonesimulator \
  build
```

检查：

1. Pods 中有 `OpenCVDocumentScanner`。
2. generated `LynxLibraryRegistry` Pod 存在。
3. `LynxGeneratedNodeAPIAddonUse.mm` include 了
   `OpenCVDocumentScanner/addon_use.h`。
4. simulator 页面能返回 runtime 信息和图片。

### 12.4 Lynxtron macOS

先构建 native package：

```bash
OpenCV_DIR=<opencv-cmake-package-dir> \
LYNX_LIBRARY_HEADERS_DIR=<lynx-library-headers>/include \
LYNX_WEAK_NODE_API_ROOT=<weak-node-api-package-root> \
npm run build:lynxtron
```

再构建/启动宿主。检查：

1. output 中存在：

```text
.lynxtron/native/node_modules/@your-scope/opencv-document-scanner/
```

2. staged package 中没有 `.cxx` 或 build cache。
3. `.node` 的架构与当前 Lynxtron runtime 一致。
4. `otool -L` 能解析 OpenCV dylib。
5. 页面通过 `NativeModules.OpenCVDocumentScanner` 得到 exports。

## 13. 常见问题

### 13.1 AutoLink 完全没有发现 package

检查：

- package 是否在宿主 `dependencies`。
- `node_modules/<package>/lynx.lib.json` 是否真实存在。
- manifest 是否位于 package 根目录。
- client 的扫描 root 是否能向上找到该 `node_modules`。
- 当前 client 版本是否支持 `nodeApiAddons`。

不要先手工添加 native target；那会掩盖 package discovery 问题。

### 13.2 Android 有 library project，但 addon 没进 APK

检查：

- CMake target 是否是 `SHARED`。
- output 是否叫 `libOpenCVDocumentScanner.so`。
- App 是否支持当前 ABI。
- external native build task 是否在 merge JNI libs 前执行。
- `required` 和 `jniLibsDir` 是否符合源码构建/预构建模式。

### 13.3 Android 已有 `.so`，但 loader 找不到 module

检查名称是否一致，并确认编译定义：

```text
LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1
```

同时检查：

- 共享源码 headers 是否来自 `@lynx-js/weak-node-api`。
- addon 是否链接同一 PrimJS AAR 的 `libnapi_adapter.so` 和 `libnapi.so`。
- 宿主 `liblynx.so` 是否包含 restricted loader；日志应出现
  `NAPI Setup Restricted Loader`。

### 13.4 iOS Pod 已链接，但 module 不存在

检查：

- `addon_use.h` 是否包含 `NAPI_USE(OpenCVDocumentScanner)`。
- manifest 的 `addonUseHeader` 是否正确。
- generated use source 是否 include 该 header。
- addon Pod 是否定义 `LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1`。
- addon Pod 是否依赖 `LynxWeakNodeAPI/core`。
- generated registry 是否依赖 `LynxWeakNodeAPI/primjs_bridge` 与
  `PrimJS/napi/adapter`。
- generated source 是否按 provider install、`SetupWeakNodeApiEnv()`、addon
  registration 的顺序执行。

### 13.5 Lynxtron 能 require `.node`，但 `NativeModules` 中没有 module

通常是只实现了 Node entry。检查：

- `.node` 是否同时编译 `lynx_module.cc`。
- 是否调用 `LYNX_REGISTER_NATIVE_MODULE`。
- module name 是否一致。
- Lynx entry 是否使用 weak N-API headers 和 compile definitions。

### 13.6 Lynxtron 找不到 staged package

检查：

- `pluginLynxtron` 是否启用 AutoLink。
- package 是否有 `./lynxtron` export。
- manifest 是否有 `platforms.lynxtron.path`。
- native staging 是否发生在 bundler 清理 output 之后。
- 启动命令传给 Lynxtron 的 App entry 是否是实际 output 路径。

### 13.7 OpenCV dynamic library 找不到

Android 检查目标 ABI 的 `libopencv_java4.so`；iOS 检查 Pod 的 simulator/device
slice；macOS 检查 `otool -L`、rpath、codesign 和相邻 dylib。该问题属于 native
dependency packaging，不应通过修改 TypeScript loader 绕过。

## 14. 发布前检查清单

- [ ] Module 名在 manifest、C++、iOS keep-alive、desktop registration 和 TS 中一致。
- [ ] 三端共享源码都使用 `@lynx-js/weak-node-api` headers。
- [ ] Android/iOS 使用普通 `napi_*`，仅 Lynxtron Lynx entry 使用 `*_weak`。
- [ ] `lynx.lib.json` 位于 npm package 根目录。
- [ ] 所有 manifest path 都在 package 内。
- [ ] Android 支持的每个 ABI 都已验证。
- [ ] iOS device 和 simulator slice 都已验证。
- [ ] Lynxtron 每个声明支持的 OS/arch 都有 `.node` 和 OpenCV runtime。
- [ ] `npm pack --dry-run` 不包含 build cache。
- [ ] 新建独立页面验证 `ArrayBuffer` 输入和输出。
- [ ] 宿主没有 OpenCV 专用手工加载或注册代码。
- [ ] README 写明支持的平台、最低系统版本和 native dependency。

完成这些步骤后，同一份 OpenCV library package 就能由不同宿主的 AutoLink client
发现；宿主之间只保留各自的 client 配置差异，算法、API 和 package manifest 都可
复用。
