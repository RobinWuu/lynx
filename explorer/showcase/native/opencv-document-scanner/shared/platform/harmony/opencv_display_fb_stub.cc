// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

namespace cv {

class display_fb_impl;

class display_fb {
 public:
  static bool supported();

  display_fb();
  ~display_fb();

  int open();
  int get_width() const;
  int get_height() const;
  int show_bgr(const unsigned char* bgrdata, int width, int height);
  int show_gray(const unsigned char* graydata, int width, int height);
  int close();

 private:
  display_fb_impl* const d;
};

display_fb::display_fb() : d(nullptr) {}
display_fb::~display_fb() = default;
int display_fb::open() { return -1; }
int display_fb::get_width() const { return 0; }
int display_fb::get_height() const { return 0; }
int display_fb::show_bgr(const unsigned char*, int, int) { return -1; }
int display_fb::show_gray(const unsigned char*, int, int) { return -1; }

}  // namespace cv
