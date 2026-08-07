// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstring>
#include <opencv2/core.hpp>
#if __has_include(<opencv2/geometry/2d.hpp>)
#include <opencv2/geometry/2d.hpp>
#endif
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "napi.h"

#if defined(USE_WEAK_SUFFIX_NAPI)
#include "weak_napi_defines.h"
#endif

#if defined(LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE)
#if defined(LYNX_LIBRARY_MANUAL_NAPI_REGISTRATION)
#define LYNX_LIBRARY_NAPI_REGISTRATION_ATTRIBUTE
#else
#define LYNX_LIBRARY_NAPI_REGISTRATION_ATTRIBUTE __attribute__((constructor))
#endif

#define LYNX_NAPI_MODULE(modname, regfunc)      \
  EXTERN_C_START                                \
  static napi_module _module_##modname = {      \
      NAPI_MODULE_VERSION,                      \
      0,                                        \
      __FILE__,                                 \
      regfunc,                                  \
      #modname,                                 \
      nullptr,                                  \
      {nullptr, nullptr, nullptr, nullptr}};    \
  void _napi_register_xx_##modname(void)        \
      LYNX_LIBRARY_NAPI_REGISTRATION_ATTRIBUTE; \
  void _napi_register_xx_##modname(void) {      \
    napi_module_register(&_module_##modname);   \
  }                                             \
  EXTERN_C_END
#endif

namespace {

using Clock = std::chrono::steady_clock;
using PointArray = std::array<cv::Point2f, 4>;

double Distance(const cv::Point2f& first, const cv::Point2f& second) {
  const double dx = first.x - second.x;
  const double dy = first.y - second.y;
  return std::sqrt(dx * dx + dy * dy);
}

PointArray OrderPoints(const std::vector<cv::Point>& polygon) {
  PointArray ordered;
  auto min_sum = std::min_element(polygon.begin(), polygon.end(),
                                  [](const cv::Point& a, const cv::Point& b) {
                                    return a.x + a.y < b.x + b.y;
                                  });
  auto max_sum = std::max_element(polygon.begin(), polygon.end(),
                                  [](const cv::Point& a, const cv::Point& b) {
                                    return a.x + a.y < b.x + b.y;
                                  });
  auto min_diff = std::min_element(polygon.begin(), polygon.end(),
                                   [](const cv::Point& a, const cv::Point& b) {
                                     return a.y - a.x < b.y - b.x;
                                   });
  auto max_diff = std::max_element(polygon.begin(), polygon.end(),
                                   [](const cv::Point& a, const cv::Point& b) {
                                     return a.y - a.x < b.y - b.x;
                                   });

  ordered[0] = *min_sum;   // top-left
  ordered[1] = *min_diff;  // top-right
  ordered[2] = *max_sum;   // bottom-right
  ordered[3] = *max_diff;  // bottom-left
  return ordered;
}

bool FindDocument(const cv::Mat& edges, PointArray* result) {
  std::vector<std::vector<cv::Point>> contours;
  cv::findContours(edges.clone(), contours, cv::RETR_LIST,
                   cv::CHAIN_APPROX_SIMPLE);
  std::sort(
      contours.begin(), contours.end(),
      [](const std::vector<cv::Point>& a, const std::vector<cv::Point>& b) {
        return cv::contourArea(a) > cv::contourArea(b);
      });

  const double image_area =
      static_cast<double>(edges.cols) * static_cast<double>(edges.rows);
  const size_t candidate_count = std::min<size_t>(contours.size(), 12);
  for (size_t index = 0; index < candidate_count; ++index) {
    const double perimeter = cv::arcLength(contours[index], true);
    std::vector<cv::Point> polygon;
    cv::approxPolyDP(contours[index], polygon, 0.02 * perimeter, true);
    if (polygon.size() != 4 || !cv::isContourConvex(polygon) ||
        cv::contourArea(polygon) < image_area * 0.18) {
      continue;
    }
    *result = OrderPoints(polygon);
    return true;
  }
  return false;
}

cv::Mat WarpDocument(const cv::Mat& source, const PointArray& points) {
  const int width =
      std::max(1, static_cast<int>(std::max(Distance(points[0], points[1]),
                                            Distance(points[3], points[2]))));
  const int height =
      std::max(1, static_cast<int>(std::max(Distance(points[0], points[3]),
                                            Distance(points[1], points[2]))));
  PointArray destination = {
      cv::Point2f(0.0F, 0.0F),
      cv::Point2f(static_cast<float>(width - 1), 0.0F),
      cv::Point2f(static_cast<float>(width - 1),
                  static_cast<float>(height - 1)),
      cv::Point2f(0.0F, static_cast<float>(height - 1)),
  };
  cv::Mat transform =
      cv::getPerspectiveTransform(points.data(), destination.data());
  cv::Mat warped;
  cv::warpPerspective(source, warped, transform, cv::Size(width, height),
                      cv::INTER_CUBIC, cv::BORDER_REPLICATE);
  return warped;
}

std::vector<unsigned char> EncodeJpeg(const cv::Mat& image, int quality) {
  std::vector<unsigned char> bytes;
  if (!cv::imencode(".jpg", image, bytes,
                    {cv::IMWRITE_JPEG_QUALITY, std::clamp(quality, 40, 95)})) {
    throw std::runtime_error("OpenCV failed to encode the output image.");
  }
  return bytes;
}

Napi::ArrayBuffer ToArrayBuffer(Napi::Env env,
                                const std::vector<unsigned char>& bytes) {
  Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(env, bytes.size());
  if (!bytes.empty()) {
    std::memcpy(buffer.Data(), bytes.data(), bytes.size());
  }
  return buffer;
}

std::string FormatPoints(const PointArray& points, double inverse_scale) {
  std::ostringstream stream;
  for (size_t index = 0; index < points.size(); ++index) {
    if (index != 0) {
      stream << ";";
    }
    stream << static_cast<int>(std::round(points[index].x * inverse_scale))
           << ","
           << static_cast<int>(std::round(points[index].y * inverse_scale));
  }
  return stream.str();
}

Napi::Value GetRuntimeInfo(const Napi::CallbackInfo& info) {
  std::ostringstream stream;
  stream << "OpenCV " << CV_VERSION;
#if defined(__ANDROID__)
  stream << " / Android";
#elif defined(LYNXTRON_DESKTOP)
  stream << " / macOS";
#elif defined(__APPLE__)
  stream << " / iOS";
#else
  stream << " / Native";
#endif
  stream << " / N-API";
  return Napi::String::New(info.Env(), stream.str());
}

Napi::Value ScanDocument(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsArrayBuffer()) {
    Napi::TypeError::New(
        env, "scanDocument expects an ArrayBuffer image and optional quality.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() >= 2 && !info[1].IsNumber()) {
    Napi::TypeError::New(env, "scanDocument quality must be a number.")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  try {
    const auto start = Clock::now();
    const int jpeg_quality =
        info.Length() >= 2 ? info[1].As<Napi::Number>().Int32Value() : 88;
    Napi::ArrayBuffer input = info[0].As<Napi::ArrayBuffer>();
    const auto* input_bytes = static_cast<const unsigned char*>(input.Data());
    std::vector<unsigned char> encoded(input_bytes,
                                       input_bytes + input.ByteLength());
    cv::Mat source = cv::imdecode(encoded, cv::IMREAD_COLOR);
    if (source.empty()) {
      throw std::runtime_error("OpenCV could not decode the input image.");
    }

    const int max_dimension = 1100;
    const double scale = std::min(
        1.0, static_cast<double>(max_dimension) /
                 static_cast<double>(std::max(source.cols, source.rows)));
    cv::Mat working;
    if (scale < 1.0) {
      cv::resize(source, working, cv::Size(), scale, scale, cv::INTER_AREA);
    } else {
      working = source.clone();
    }

    cv::Mat gray;
    cv::cvtColor(working, gray, cv::COLOR_BGR2GRAY);
    cv::GaussianBlur(gray, gray, cv::Size(5, 5), 0.0);

    cv::Mat edges;
    cv::Canny(gray, edges, 55.0, 165.0);
    cv::morphologyEx(edges, edges, cv::MORPH_CLOSE,
                     cv::getStructuringElement(cv::MORPH_RECT, cv::Size(5, 5)));

    PointArray working_points = {};
    const bool detected = FindDocument(edges, &working_points);
    cv::Mat scanned;
    PointArray source_points = working_points;
    if (detected) {
      const double inverse_scale = 1.0 / scale;
      for (cv::Point2f& point : source_points) {
        point.x = static_cast<float>(point.x * inverse_scale);
        point.y = static_cast<float>(point.y * inverse_scale);
      }
      scanned = WarpDocument(source, source_points);
      cv::Mat scanned_gray;
      cv::cvtColor(scanned, scanned_gray, cv::COLOR_BGR2GRAY);
      cv::adaptiveThreshold(scanned_gray, scanned, 255,
                            cv::ADAPTIVE_THRESH_GAUSSIAN_C, cv::THRESH_BINARY,
                            31, 12);
    } else {
      cv::Mat blurred;
      cv::GaussianBlur(source, blurred, cv::Size(0, 0), 3.0);
      cv::addWeighted(source, 1.5, blurred, -0.5, 0.0, scanned);
    }

    cv::Mat edge_preview;
    cv::cvtColor(edges, edge_preview, cv::COLOR_GRAY2BGR);
    if (detected) {
      std::vector<cv::Point> polygon;
      for (const cv::Point2f& point : working_points) {
        polygon.emplace_back(static_cast<int>(std::round(point.x)),
                             static_cast<int>(std::round(point.y)));
      }
      cv::polylines(edge_preview, polygon, true, cv::Scalar(36, 214, 132), 4);
    }

    std::vector<unsigned char> scanned_bytes =
        EncodeJpeg(scanned, jpeg_quality);
    std::vector<unsigned char> edge_bytes = EncodeJpeg(edge_preview, 82);
    const double processing_ms =
        std::chrono::duration<double, std::milli>(Clock::now() - start).count();

    Napi::Object result = Napi::Object::New(env);
    result.Set("detected", Napi::Boolean::New(env, detected));
    result.Set("sourceWidth", Napi::Number::New(env, source.cols));
    result.Set("sourceHeight", Napi::Number::New(env, source.rows));
    result.Set("outputWidth", Napi::Number::New(env, scanned.cols));
    result.Set("outputHeight", Napi::Number::New(env, scanned.rows));
    result.Set("processingMs", Napi::Number::New(env, processing_ms));
    result.Set("points", Napi::String::New(
                             env, detected ? FormatPoints(source_points, 1.0)
                                           : std::string()));
    result.Set("scannedImage", ToArrayBuffer(env, scanned_bytes));
    result.Set("edgeImage", ToArrayBuffer(env, edge_bytes));
    return result;
  } catch (const cv::Exception& error) {
    Napi::Error::New(env, error.what()).ThrowAsJavaScriptException();
  } catch (const std::exception& error) {
    Napi::Error::New(env, error.what()).ThrowAsJavaScriptException();
  }
  return env.Undefined();
}

napi_value Bind(napi_env env, napi_value exports) {
  Napi::Object target(env, exports);
  target.Set("getRuntimeInfo",
             Napi::Function::New(env, GetRuntimeInfo, "getRuntimeInfo"));
  target.Set("scanDocument",
             Napi::Function::New(env, ScanDocument, "scanDocument"));
  return exports;
}

}  // namespace

#if defined(LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE)
LYNX_NAPI_MODULE(OpenCVDocumentScanner, Bind)
#endif

#if defined(USE_WEAK_SUFFIX_NAPI)
#include "weak_napi_undefs.h"
#endif
