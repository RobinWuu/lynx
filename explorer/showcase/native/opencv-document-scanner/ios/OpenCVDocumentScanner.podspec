Pod::Spec.new do |s|
  s.name = 'OpenCVDocumentScanner'
  s.version = '0.0.1'
  s.summary = 'OpenCV document scanner for Lynx N-API AutoLink'
  s.homepage = 'https://github.com/lynx-family/lynx'
  s.license = { :type => 'Apache-2.0' }
  s.author = 'Lynx'
  s.source = { :path => '..' }
  s.platform = :ios, '13.0'
  s.source_files = 'generated/**/*.{cc,h,mm}', 'addon_use.h'
  s.public_header_files = 'addon_use.h'
  s.dependency 'LynxWeakNodeAPI/core'
  s.dependency 'FastOpenCV-iOS', '1.0.4'
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_ROOT}/LynxWeakNodeAPI/packages/weak-node-api/headers"',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) LYNX_LIBRARY_MANUAL_NAPI_REGISTRATION=1 LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1'
  }
end
