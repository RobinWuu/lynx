// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
#include <node_api.h>

napi_value InitNodeEntry(napi_env env, napi_value exports) { return exports; }

NAPI_MODULE(OpenCVDocumentScannerLynxtron, InitNodeEntry)
