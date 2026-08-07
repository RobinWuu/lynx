# OpenCV Document Scanner

This Lynx library exposes one shared C++ OpenCV implementation through a
Node-API addon on Android, iOS, and Lynxtron macOS. Lynx AutoLink discovers the
package through `lynx.lib.json`; host apps do not register the addon manually.

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for the external developer guide:
how to build this package, enable the AutoLink client in any Lynx host, and
verify Android, iOS, and Lynxtron. Explorer-specific implementation and
verification notes remain in [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).

The Showcase input is OpenCV's `samples/data/sudoku.png` from commit
`77dfa297d08fdecdc509fc01ad92a2e9ec776a57`, licensed under OpenCV's
Apache-2.0 license. Habitat restores the file during `tools/hab sync .`; its
SHA-256 is
`3cd9ab173f7178c0a16bba9f867062b58b5d60918d5aeb8ced85cba0b24c353a`.

Android extracts the headers and native libraries from
`org.opencv:opencv:4.9.0` and links them with CMake. iOS links
`FastOpenCV-iOS:1.0.4`. Lynxtron builds a macOS arm64 `.node` with a standard
Node loading entry and a Lynx weak N-API static registration entry.

All platforms compile the shared scanner against the standard headers from
`@lynx-js/weak-node-api`. Android uses the non-suffixed implementation and
automatic PrimJS host injection shipped in `libnapi_adapter.so`; iOS uses
`LynxWeakNodeAPI/core`, with the generated AutoLink registry initializing its
PrimJS bridge; Lynxtron enables `USE_WEAK_SUFFIX_NAPI`.

Build the Lynxtron target with:

```bash
OpenCV_DIR=<opencv-cmake-dir> \
LYNX_LIBRARY_HEADERS_DIR=<lynx-library-headers-include> \
LYNX_WEAK_NODE_API_ROOT=<weak-node-api-package-root> \
npm run build:lynxtron
```
