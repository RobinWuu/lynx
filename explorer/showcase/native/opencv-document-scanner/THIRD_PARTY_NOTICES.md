# Third-Party Notices

This package uses OpenCV.

## OpenCV

Copyright OpenCV contributors.

OpenCV is licensed under the Apache License, Version 2.0. The license text is
available at:

https://github.com/opencv/opencv/blob/5.x/LICENSE

The Android build resolves OpenCV 4.9.0 from the
`org.opencv:opencv` Maven artifact. The iOS build resolves
`FastOpenCV-iOS:1.0.4`. The Lynxtron macOS prebuilt uses a minimal OpenCV 5
static build from OpenCV tag `5.0.0`, source commit
`40738fb16ceddb5fb3fea747585f7ce6abb0605b`.

## Image Codecs

The Lynxtron prebuilt is built with OpenCV's bundled image codec dependencies.
The corresponding upstream notices are distributed by the OpenCV source tree
and remain subject to their respective licenses. Their complete license and
notice files are included under `licenses/opencv5/`. Release builds must not
add Homebrew or other host-local dynamic dependencies.
