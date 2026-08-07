// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include <lynx/registration.h>

#include "../shared/OpenCVDocumentScanner.cc"

::lynx::registration::LynxNapiValue CreateOpenCVDocumentScanner(
    ::lynx::registration::LynxNapiEnv env,
    ::lynx::registration::LynxNapiValue exports, const char* module_name,
    void* opaque) {
  (void)module_name;
  (void)opaque;
  return Bind(env, exports);
}

LYNX_REGISTER_NATIVE_MODULE("OpenCVDocumentScanner",
                            CreateOpenCVDocumentScanner, nullptr)
