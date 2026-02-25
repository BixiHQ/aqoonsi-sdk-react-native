require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name          = "aqoonsi-sdk"
  s.version       = package["version"]
  s.summary       = package["description"]
  s.swift_version = "5.0"

  s.description  = <<-DESC
    Aqoonsi KYC SDK for React Native with FaceTec biometric verification
  DESC

  s.homepage     = "https://github.com/BixiHQ/aqoonsi"
  s.license      = { :type => "MIT", :text => "Copyright Bixi Ltd" }
  s.authors      = { "Bixi HQ" => "dev@bixiltd.com" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/BixiHQ/aqoonsi.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,c,m,swift}"
  s.public_header_files = "ios/AqoonsiFaceTec.h"
  s.requires_arc = true
  s.static_framework = true
  s.vendored_frameworks = "ios/Frameworks/FaceTecSDK.xcframework"

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES"
  }

  s.dependency "React-Core"
end
