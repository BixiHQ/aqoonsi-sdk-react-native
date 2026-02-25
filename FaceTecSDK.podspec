Pod::Spec.new do |s|
  s.name          = "FaceTecSDK"
  s.version       = "10.0.33"
  s.summary       = "FaceTec SDK for iOS"

  s.description  = <<-DESC
    FaceTec 3D Face Authentication SDK for iOS
  DESC

  s.homepage     = "https://facetec.com"
  s.license      = { :type => "Commercial", :text => "FaceTec License" }
  s.authors      = { "FaceTec" => "support@facetec.com" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/BixiHQ/aqoonsi.git", :tag => "v#{s.version}" }

  s.vendored_frameworks = "ios/Frameworks/FaceTecSDK.xcframework"
  s.static_framework = true

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES"
  }
end
