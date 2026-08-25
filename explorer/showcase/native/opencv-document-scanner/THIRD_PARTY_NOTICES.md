# Third-Party Notices

This package uses OpenCV.

## OpenCV

Copyright OpenCV contributors.

OpenCV is licensed under the Apache License, Version 2.0. The license text is
available at:

https://github.com/opencv/opencv/blob/4.x/LICENSE

The Android build resolves OpenCV 4.9.0 from the
`org.opencv:opencv` Maven artifact. The iOS build resolves
`FastOpenCV-iOS:1.0.4`.

The HarmonyOS source package includes the official
`opencv-mobile-4.13.0-harmonyos.zip` archive. The Lynxtron macOS arm64
prebuilt statically links OpenCV Mobile 4.13.0. The Harmony archive SHA-256 is:

```text
34a7deb0fa11faa7dddd8f80d4e62fae821ed227de6f43ead521a755dce95375
```

## Image Codecs

The Lynxtron prebuilt includes the image codec code selected by the OpenCV
Mobile build. The corresponding upstream license and notice files are included
under `licenses/opencv-mobile-4.13.0/`.

The Harmony OpenCV archive also contains its upstream notices under each ABI's
`share/licenses/` directory. Release builds must not add Homebrew or other
host-local dynamic dependencies.
