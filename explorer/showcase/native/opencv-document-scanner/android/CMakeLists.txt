cmake_minimum_required(VERSION 3.18.1)

project(OpenCVDocumentScannerAndroid LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

get_filename_component(
  LYNX_LIBRARY_PACKAGE_ROOT
  "${CMAKE_CURRENT_SOURCE_DIR}/.."
  ABSOLUTE
)

if(NOT DEFINED NODE_EXECUTABLE)
  find_program(NODE_EXECUTABLE NAMES node REQUIRED)
endif()

if(NOT DEFINED LYNX_WEAK_NODE_API_PACKAGE_ROOT)
  execute_process(
    COMMAND
      "${NODE_EXECUTABLE}"
      -p
      "require('node:path').dirname(require.resolve('@lynx-js/weak-node-api/package.json'))"
    WORKING_DIRECTORY "${LYNX_LIBRARY_PACKAGE_ROOT}"
    RESULT_VARIABLE LYNX_WEAK_NODE_API_RESULT
    OUTPUT_VARIABLE LYNX_WEAK_NODE_API_PACKAGE_ROOT
    ERROR_VARIABLE LYNX_WEAK_NODE_API_ERROR
    OUTPUT_STRIP_TRAILING_WHITESPACE
  )
  if(NOT LYNX_WEAK_NODE_API_RESULT EQUAL 0)
    string(REPLACE "\n" " " LYNX_WEAK_NODE_API_ERROR "${LYNX_WEAK_NODE_API_ERROR}")
    message(FATAL_ERROR "Unable to resolve @lynx-js/weak-node-api. ${LYNX_WEAK_NODE_API_ERROR}")
  endif()
endif()

set(LYNX_WEAK_NODE_API_HEADERS_DIR
  "${LYNX_WEAK_NODE_API_PACKAGE_ROOT}/headers"
)

if(NOT EXISTS "${LYNX_WEAK_NODE_API_HEADERS_DIR}/napi.h")
  message(FATAL_ERROR "Missing @lynx-js/weak-node-api headers. Run pnpm install.")
endif()

if(NOT LYNX_PRIMJS_JNI_DIR)
  message(FATAL_ERROR "LYNX_PRIMJS_JNI_DIR is required.")
endif()

if(NOT OPENCV_NATIVE_DIR)
  message(FATAL_ERROR "OPENCV_NATIVE_DIR is required.")
endif()

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
  "${LYNX_WEAK_NODE_API_HEADERS_DIR}"
)

target_compile_definitions(OpenCVDocumentScanner PRIVATE
  LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1
)

target_link_libraries(OpenCVDocumentScanner PRIVATE
  opencv_java4
  lynx_primjs_napi_adapter
  lynx_primjs_napi
)

set_target_properties(OpenCVDocumentScanner PROPERTIES
  OUTPUT_NAME "OpenCVDocumentScanner"
)
