cmake_minimum_required(VERSION 3.21)

project(OpenCVDocumentScannerLynxtron LANGUAGES CXX)

if(NOT APPLE)
  message(FATAL_ERROR "This Showcase currently builds the Lynxtron addon on macOS only.")
endif()

if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(arm64|aarch64)$")
  set(LYNXTRON_ARCH "arm64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|AMD64)$")
  set(LYNXTRON_ARCH "x64")
else()
  message(FATAL_ERROR "Unsupported macOS architecture: ${CMAKE_SYSTEM_PROCESSOR}")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(
  LYNX_LIBRARY_HEADERS_DIR
  "$ENV{LYNX_LIBRARY_HEADERS_DIR}"
  CACHE PATH
  "Path to @lynx-js/lynx-library-headers/include"
)

if(NOT EXISTS "${LYNX_LIBRARY_HEADERS_DIR}/lynx/registration.h")
  message(
    FATAL_ERROR
    "Set LYNX_LIBRARY_HEADERS_DIR to @lynx-js/lynx-library-headers/include."
  )
endif()

set(
  LYNX_WEAK_NODE_API_ROOT
  "$ENV{LYNX_WEAK_NODE_API_ROOT}"
  CACHE PATH
  "Path to @lynx-js/weak-node-api"
)

if(NOT EXISTS "${LYNX_WEAK_NODE_API_ROOT}/headers/napi.h")
  message(
    FATAL_ERROR
    "Set LYNX_WEAK_NODE_API_ROOT to @lynx-js/weak-node-api."
  )
endif()

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

target_link_options(OpenCVDocumentScannerLynxtron PRIVATE
  "-undefined"
  "dynamic_lookup"
)

set_target_properties(OpenCVDocumentScannerLynxtron PROPERTIES
  BUILD_WITH_INSTALL_RPATH ON
  BUILD_RPATH "@loader_path"
  INSTALL_RPATH "@loader_path"
  PREFIX ""
  OUTPUT_NAME "OpenCVDocumentScanner"
  SUFFIX ".node"
  LIBRARY_OUTPUT_DIRECTORY
    "${CMAKE_CURRENT_SOURCE_DIR}/dist/darwin/${LYNXTRON_ARCH}"
)

foreach(
  OPENCV_RUNTIME_TARGET
  opencv_core
  opencv_flann
  opencv_geometry
  opencv_imgproc
  opencv_imgcodecs
)
  if(TARGET "${OPENCV_RUNTIME_TARGET}")
    add_custom_command(TARGET OpenCVDocumentScannerLynxtron POST_BUILD
      COMMAND "${CMAKE_COMMAND}" -E copy_if_different
        "$<TARGET_FILE:${OPENCV_RUNTIME_TARGET}>"
        "$<TARGET_FILE_DIR:OpenCVDocumentScannerLynxtron>/$<TARGET_SONAME_FILE_NAME:${OPENCV_RUNTIME_TARGET}>"
    )
  endif()
endforeach()

find_program(CODESIGN_EXECUTABLE codesign REQUIRED)
add_custom_command(TARGET OpenCVDocumentScannerLynxtron POST_BUILD
  COMMAND "${CODESIGN_EXECUTABLE}" --force --sign -
    "$<TARGET_FILE:OpenCVDocumentScannerLynxtron>"
)

foreach(
  OPENCV_RUNTIME_TARGET
  opencv_core
  opencv_flann
  opencv_geometry
  opencv_imgproc
  opencv_imgcodecs
)
  if(TARGET "${OPENCV_RUNTIME_TARGET}")
    add_custom_command(TARGET OpenCVDocumentScannerLynxtron POST_BUILD
      COMMAND "${CODESIGN_EXECUTABLE}" --force --sign -
        "$<TARGET_FILE_DIR:OpenCVDocumentScannerLynxtron>/$<TARGET_SONAME_FILE_NAME:${OPENCV_RUNTIME_TARGET}>"
    )
  endif()
endforeach()
