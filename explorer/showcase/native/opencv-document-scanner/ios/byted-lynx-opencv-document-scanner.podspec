Pod::Spec.new do |s|
  s.name = 'byted-lynx-opencv-document-scanner'
  s.version = '0.1.0-alpha.2'
  s.summary = 'OpenCV document scanner for Lynx Node-API AutoLink'
  s.homepage = 'https://github.com/lynx-family/lynx'
  s.license = { :type => 'Apache-2.0' }
  s.author = 'Lynx'
  s.source = { :path => '..' }
  s.source_files = 'src/**/*.{h,m,mm}'
  s.dependency 'Lynx'


  s.source_files = 'src/**/*.{h,m,mm}', 'generated/**/*.{cc,h,mm}', 'addon_use.h'
  s.public_header_files = 'addon_use.h'
  s.dependency 'LynxWeakNodeAPI/core'
  s.dependency 'FastOpenCV-iOS', '1.0.4'
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_ROOT}/LynxWeakNodeAPI/packages/weak-node-api/headers"',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) LYNX_LIBRARY_MANUAL_NAPI_REGISTRATION=1 LYNX_LIBRARY_USE_PRIMJS_NAPI_MODULE=1 NAPI_CPP_CUSTOM_NAMESPACE=opencv_document_scanner'
  }
end
