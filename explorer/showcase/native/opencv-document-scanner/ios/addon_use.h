// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
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
