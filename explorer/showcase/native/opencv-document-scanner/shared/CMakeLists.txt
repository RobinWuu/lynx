cmake_minimum_required(VERSION 3.18.1)

if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
  project(OpencvDocumentScannerAddonShared LANGUAGES C CXX)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_OBJC_VISIBILITY_PRESET hidden)
set(CMAKE_OBJCXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)

if(NOT DEFINED LYNX_LIBRARY_PACKAGE_ROOT)
  get_filename_component(
    LYNX_LIBRARY_PACKAGE_ROOT
    "${CMAKE_CURRENT_SOURCE_DIR}/.."
    ABSOLUTE
  )
endif()

if(NOT DEFINED NODE_EXECUTABLE)
  find_program(NODE_EXECUTABLE NAMES node)
endif()

if(NOT NODE_EXECUTABLE)
  message(FATAL_ERROR "Unable to find node. Install Node.js before configuring the shared target.")
endif()

function(lynx_resolve_node_package PACKAGE_NAME OUT_VAR)
  execute_process(
    COMMAND
      "${NODE_EXECUTABLE}"
      -p
      "require('node:path').dirname(require.resolve('${PACKAGE_NAME}/package.json'))"
    WORKING_DIRECTORY "${LYNX_LIBRARY_PACKAGE_ROOT}"
    RESULT_VARIABLE NODE_PACKAGE_RESULT
    OUTPUT_VARIABLE NODE_PACKAGE_ROOT
    ERROR_VARIABLE NODE_PACKAGE_ERROR
    OUTPUT_STRIP_TRAILING_WHITESPACE
  )

  if(NOT NODE_PACKAGE_RESULT EQUAL 0 OR NOT NODE_PACKAGE_ROOT)
    string(REPLACE "\n" " " NODE_PACKAGE_ERROR "${NODE_PACKAGE_ERROR}")
    message(FATAL_ERROR "Unable to resolve ${PACKAGE_NAME}. Run npm install first. ${NODE_PACKAGE_ERROR}")
  endif()

  set(${OUT_VAR} "${NODE_PACKAGE_ROOT}" PARENT_SCOPE)
endfunction()

if(NOT DEFINED LYNX_LIBRARY_PLATFORM)
  if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    set(LYNX_LIBRARY_PLATFORM "macos")
  elseif(WIN32)
    set(LYNX_LIBRARY_PLATFORM "windows")
  elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(LYNX_LIBRARY_PLATFORM "linux")
  else()
    string(TOLOWER "${CMAKE_SYSTEM_NAME}" LYNX_LIBRARY_PLATFORM)
  endif()
endif()

if(NOT DEFINED LYNX_LIBRARY_ARCH)
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(arm64|aarch64|AARCH64)$")
    set(LYNX_LIBRARY_ARCH "arm64")
  elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|AMD64|amd64)$")
    set(LYNX_LIBRARY_ARCH "x64")
  else()
    string(TOLOWER "${CMAKE_SYSTEM_PROCESSOR}" LYNX_LIBRARY_ARCH)
  endif()
endif()

if(NOT DEFINED LYNX_LIBRARY_OUTPUT_DIR)
  set(
    LYNX_LIBRARY_OUTPUT_DIR
    "${LYNX_LIBRARY_PACKAGE_ROOT}/dist/${LYNX_LIBRARY_PLATFORM}/${LYNX_LIBRARY_ARCH}"
  )
endif()

set(LYNX_SHARED_THIRD_PARTY_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party")

if(NOT DEFINED LYNX_EXTENSION_HEADERS_DIR)
  lynx_resolve_node_package(
    "@lynx-js/lynx-library-headers"
    LYNX_EXTENSION_HEADERS_PACKAGE_ROOT
  )
  set(
    LYNX_EXTENSION_HEADERS_DIR
    "${LYNX_SHARED_THIRD_PARTY_DIR}/lynx-library-headers"
  )

  file(REMOVE_RECURSE "${LYNX_EXTENSION_HEADERS_DIR}/include")
  file(MAKE_DIRECTORY "${LYNX_EXTENSION_HEADERS_DIR}")
  file(
    COPY "${LYNX_EXTENSION_HEADERS_PACKAGE_ROOT}/include"
    DESTINATION "${LYNX_EXTENSION_HEADERS_DIR}"
  )
endif()

if(WIN32 AND NOT DEFINED LYNX_EXTENSION_HEADERS_PACKAGE_ROOT)
  lynx_resolve_node_package(
    "@lynx-js/lynx-library-headers"
    LYNX_EXTENSION_HEADERS_PACKAGE_ROOT
  )
endif()

if(DEFINED LYNX_EXTENSION_HEADERS_PACKAGE_ROOT)
  set(
    LYNX_LIBRARY_HEADERS_CMAKE
    "${LYNX_EXTENSION_HEADERS_PACKAGE_ROOT}/cmake/lynx-library-headers.cmake"
  )
  if(EXISTS "${LYNX_LIBRARY_HEADERS_CMAKE}")
    include("${LYNX_LIBRARY_HEADERS_CMAKE}")
  elseif(WIN32)
    message(FATAL_ERROR "Missing Lynx library CMake helper: ${LYNX_LIBRARY_HEADERS_CMAKE}")
  endif()
endif()

if(NOT EXISTS "${LYNX_EXTENSION_HEADERS_DIR}/include/lynx/registration.h")
  message(FATAL_ERROR "Missing Lynx extension headers. Run npm install first.")
endif()

if(NOT DEFINED LYNX_LIBRARY_NODE_API_WEAK_SUFFIX)
  set(LYNX_LIBRARY_NODE_API_WEAK_SUFFIX_DEFAULT OFF)
  if(
    LYNX_LIBRARY_PLATFORM MATCHES "^(harmony|harmonyos|ohos)$"
    OR CMAKE_SYSTEM_NAME STREQUAL "OHOS"
  )
    set(LYNX_LIBRARY_NODE_API_WEAK_SUFFIX_DEFAULT ON)
  endif()
  set(
    LYNX_LIBRARY_NODE_API_WEAK_SUFFIX
    ${LYNX_LIBRARY_NODE_API_WEAK_SUFFIX_DEFAULT}
    CACHE BOOL
    "Use weak suffix NAPI symbols for shared native modules"
  )
endif()

if(NOT DEFINED LYNX_WEAK_NODE_API_HEADERS_DIR)
  lynx_resolve_node_package(
    "@lynx-js/weak-node-api"
    LYNX_WEAK_NODE_API_PACKAGE_ROOT
  )
  set(
    LYNX_WEAK_NODE_API_HEADERS_DIR
    "${LYNX_SHARED_THIRD_PARTY_DIR}/weak-node-api/headers"
  )

  file(REMOVE_RECURSE "${LYNX_WEAK_NODE_API_HEADERS_DIR}")
  file(MAKE_DIRECTORY "${LYNX_SHARED_THIRD_PARTY_DIR}/weak-node-api")
  file(
    COPY "${LYNX_WEAK_NODE_API_PACKAGE_ROOT}/headers"
    DESTINATION "${LYNX_SHARED_THIRD_PARTY_DIR}/weak-node-api"
  )
endif()

if(NOT EXISTS "${LYNX_WEAK_NODE_API_HEADERS_DIR}/weak_napi_defines.h")
  message(FATAL_ERROR "Missing weak-node-api headers. Run npm install first.")
endif()

set(
  LYNX_NATIVE_ELEMENT_BACKEND
  "texture"
  CACHE STRING
  "Native element backend: texture or native-ui"
)
set_property(
  CACHE LYNX_NATIVE_ELEMENT_BACKEND
  PROPERTY STRINGS texture native-ui
)

if(LYNX_NATIVE_ELEMENT_BACKEND STREQUAL "texture")
  set(LYNX_NATIVE_ELEMENT_BACKEND_TEXTURE 1)
elseif(LYNX_NATIVE_ELEMENT_BACKEND STREQUAL "native-ui")
  set(LYNX_NATIVE_ELEMENT_BACKEND_TEXTURE 0)
else()
  message(FATAL_ERROR "LYNX_NATIVE_ELEMENT_BACKEND must be texture or native-ui")
endif()

option(
  LYNX_SHARED_BUILD_NATIVE_MODULES
  "Build shared native module sources"
  ON
)
option(
  LYNX_SHARED_BUILD_ELEMENTS
  "Build shared element sources"
  ON
)

set(LYNX_SHARED_PLATFORM_COMPILE_DEFINITIONS
  NAPI_CPP_CUSTOM_NAMESPACE=opencv_document_scanner
)
set(LYNX_SHARED_PLATFORM_LINK_LIBRARIES)
set(LYNX_SHARED_PLATFORM_LINK_OPTIONS)

if(LYNX_LIBRARY_PLATFORM STREQUAL "android")
  if(NOT OPENCV_NATIVE_DIR)
    message(FATAL_ERROR "OPENCV_NATIVE_DIR is required for Android.")
  endif()
  add_library(opencv_java4 SHARED IMPORTED GLOBAL)
  set_target_properties(opencv_java4 PROPERTIES
    IMPORTED_LOCATION
      "${OPENCV_NATIVE_DIR}/jni/${ANDROID_ABI}/libopencv_java4.so"
    INTERFACE_INCLUDE_DIRECTORIES
      "${OPENCV_NATIVE_DIR}/prefab/modules/opencv_java4/include"
  )
  list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES opencv_java4)
elseif(LYNX_LIBRARY_PLATFORM STREQUAL "harmony")
  list(APPEND LYNX_SHARED_PLATFORM_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/platform/harmony/opencv_display_fb_stub.cc"
  )
  if(NOT DEFINED OHOS_ARCH OR "${OHOS_ARCH}" STREQUAL "")
    set(OHOS_ARCH "arm64-v8a")
  endif()
  set(
    OPENCV_MOBILE_ARCHIVE
    "${LYNX_LIBRARY_PACKAGE_ROOT}/harmony/src/main/cpp/third_party/opencv-mobile-4.13.0-harmonyos.zip"
  )
  if(NOT EXISTS "${OPENCV_MOBILE_ARCHIVE}")
    message(FATAL_ERROR "Missing Harmony OpenCV archive: ${OPENCV_MOBILE_ARCHIVE}")
  endif()
  file(SHA256 "${OPENCV_MOBILE_ARCHIVE}" OPENCV_MOBILE_ARCHIVE_SHA256)
  if(NOT OPENCV_MOBILE_ARCHIVE_SHA256 STREQUAL
     "34a7deb0fa11faa7dddd8f80d4e62fae821ed227de6f43ead521a755dce95375")
    message(FATAL_ERROR
      "Unexpected SHA-256 for ${OPENCV_MOBILE_ARCHIVE}: "
      "${OPENCV_MOBILE_ARCHIVE_SHA256}")
  endif()
  set(
    OPENCV_MOBILE_EXTRACT_DIR
    "${CMAKE_CURRENT_BINARY_DIR}/third_party/opencv-mobile"
  )
  set(
    OPENCV_MOBILE_ROOT
    "${OPENCV_MOBILE_EXTRACT_DIR}/opencv-mobile-4.13.0-harmonyos"
  )
  set(
    OpenCV_DIR
    "${OPENCV_MOBILE_ROOT}/${OHOS_ARCH}/lib/cmake/opencv4"
  )
  if(NOT EXISTS "${OpenCV_DIR}/OpenCVConfig.cmake")
    file(REMOVE_RECURSE "${OPENCV_MOBILE_EXTRACT_DIR}")
    file(MAKE_DIRECTORY "${OPENCV_MOBILE_EXTRACT_DIR}")
    execute_process(
      COMMAND
        "${CMAKE_COMMAND}" -E tar xvf "${OPENCV_MOBILE_ARCHIVE}"
      WORKING_DIRECTORY "${OPENCV_MOBILE_EXTRACT_DIR}"
      RESULT_VARIABLE OPENCV_MOBILE_EXTRACT_RESULT
      ERROR_VARIABLE OPENCV_MOBILE_EXTRACT_ERROR
    )
    if(NOT OPENCV_MOBILE_EXTRACT_RESULT EQUAL 0)
      message(FATAL_ERROR
        "Failed to extract Harmony OpenCV archive: "
        "${OPENCV_MOBILE_EXTRACT_ERROR}")
    endif()
  endif()
  find_package(OpenCV 4.13 REQUIRED COMPONENTS core imgproc highgui)
  foreach(OPENCV_TARGET ${OpenCV_LIBS})
    if(TARGET ${OPENCV_TARGET})
      set_property(TARGET ${OPENCV_TARGET} PROPERTY IMPORTED_GLOBAL TRUE)
    endif()
  endforeach()
  list(APPEND LYNX_SHARED_PLATFORM_COMPILE_DEFINITIONS
    LYNX_LIBRARY_HARMONY=1
  )
  list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES ${OpenCV_LIBS})
elseif(LYNX_LIBRARY_PLATFORM STREQUAL "macos")
  if(OPENCV_FRAMEWORK_DIR)
    set(OPENCV_FRAMEWORK_BINARY
      "${OPENCV_FRAMEWORK_DIR}/Versions/A/opencv2"
    )
    set(OPENCV_FRAMEWORK_HEADERS
      "${OPENCV_FRAMEWORK_DIR}/Versions/A/Headers"
    )
    if(NOT EXISTS "${OPENCV_FRAMEWORK_BINARY}")
      message(FATAL_ERROR
        "Missing OpenCV framework binary: ${OPENCV_FRAMEWORK_BINARY}")
    endif()
    set(
      OPENCV_FRAMEWORK_INCLUDE_ROOT
      "${CMAKE_CURRENT_BINARY_DIR}/third_party/opencv-framework-include"
    )
    file(MAKE_DIRECTORY "${OPENCV_FRAMEWORK_INCLUDE_ROOT}")
    file(CREATE_LINK
      "${OPENCV_FRAMEWORK_HEADERS}"
      "${OPENCV_FRAMEWORK_INCLUDE_ROOT}/opencv2"
      SYMBOLIC
      COPY_ON_ERROR
    )
    add_library(opencv2_framework STATIC IMPORTED GLOBAL)
    set_target_properties(opencv2_framework PROPERTIES
      IMPORTED_LOCATION "${OPENCV_FRAMEWORK_BINARY}"
      INTERFACE_INCLUDE_DIRECTORIES
        "${OPENCV_FRAMEWORK_INCLUDE_ROOT}"
    )
    list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES opencv2_framework)
  else()
    find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs)
    foreach(OPENCV_TARGET ${OpenCV_LIBS})
      if(TARGET ${OPENCV_TARGET})
        set_property(TARGET ${OPENCV_TARGET} PROPERTY IMPORTED_GLOBAL TRUE)
      endif()
    endforeach()
    list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES ${OpenCV_LIBS})
  endif()
  list(APPEND LYNX_SHARED_PLATFORM_COMPILE_DEFINITIONS
    LYNXTRON_DESKTOP=1
  )
endif()

if(APPLE)
  enable_language(OBJCXX)

  find_library(APPKIT_FRAMEWORK AppKit)
  find_library(COREGRAPHICS_FRAMEWORK CoreGraphics)
  find_library(CORETEXT_FRAMEWORK CoreText)
  find_library(FOUNDATION_FRAMEWORK Foundation)
  find_library(IOSURFACE_FRAMEWORK IOSurface)

  list(APPEND LYNX_SHARED_PLATFORM_LINK_OPTIONS
    "-undefined"
    "dynamic_lookup"
  )
  list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES
    ${APPKIT_FRAMEWORK}
    ${COREGRAPHICS_FRAMEWORK}
    ${CORETEXT_FRAMEWORK}
    ${FOUNDATION_FRAMEWORK}
    ${IOSURFACE_FRAMEWORK}
  )
elseif(WIN32)
  list(APPEND LYNX_SHARED_PLATFORM_COMPILE_DEFINITIONS
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
  )
  list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES
    d3d11
    dxgi
    gdi32
    user32
  )
  if(COMMAND lynx_resolve_lynxtron_import_library)
    lynx_resolve_lynxtron_import_library(LYNXTRON_RESOLVED_IMPORT_LIB)
    list(APPEND LYNX_SHARED_PLATFORM_LINK_LIBRARIES
      "${LYNXTRON_RESOLVED_IMPORT_LIB}"
    )
  endif()
endif()

set(LYNX_SHARED_TARGETS)

if(LYNX_SHARED_BUILD_NATIVE_MODULES AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/modules/CMakeLists.txt")
  add_subdirectory(modules)
  list(APPEND LYNX_SHARED_TARGETS OpencvDocumentScannerAddonNativeModules)
endif()

if(LYNX_SHARED_BUILD_NATIVE_MODULES AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/nativeModule/CMakeLists.txt")
  add_subdirectory(nativeModule)
  if(LYNX_SHARED_PLATFORM_SOURCES)
    target_sources(${LYNX_LIBRARY_NAPI_NATIVE_MODULE_TARGET} PRIVATE
      ${LYNX_SHARED_PLATFORM_SOURCES}
    )
  endif()
  list(APPEND LYNX_SHARED_TARGETS ${LYNX_LIBRARY_NAPI_NATIVE_MODULE_TARGET})
endif()

if(LYNX_SHARED_BUILD_ELEMENTS AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/elements/CMakeLists.txt")
  add_subdirectory(elements)
  list(APPEND LYNX_SHARED_TARGETS OpencvDocumentScannerAddonElements)
endif()

if(NOT CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
  set(LYNX_SHARED_TARGETS ${LYNX_SHARED_TARGETS} PARENT_SCOPE)
  if(DEFINED LYNX_LIBRARY_NAPI_NATIVE_MODULE_TARGET)
    set(
      LYNX_LIBRARY_NAPI_NATIVE_MODULE_TARGET
      "${LYNX_LIBRARY_NAPI_NATIVE_MODULE_TARGET}"
      PARENT_SCOPE
    )
  endif()
  set(LYNX_SHARED_PLATFORM_COMPILE_DEFINITIONS ${LYNX_SHARED_PLATFORM_COMPILE_DEFINITIONS} PARENT_SCOPE)
  set(LYNX_SHARED_PLATFORM_LINK_LIBRARIES ${LYNX_SHARED_PLATFORM_LINK_LIBRARIES} PARENT_SCOPE)
  set(LYNX_SHARED_PLATFORM_LINK_OPTIONS ${LYNX_SHARED_PLATFORM_LINK_OPTIONS} PARENT_SCOPE)
endif()
