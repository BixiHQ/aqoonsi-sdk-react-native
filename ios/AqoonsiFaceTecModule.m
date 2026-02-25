//
//  AqoonsiFaceTecModule.m
//  @aqoonsi/sdk-react-native
//
//  Objective-C bridge for React Native - FaceTec SDK v10
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AqoonsiFaceTecModule, RCTEventEmitter)

// SDK Initialization (v10 uses session request callback)
RCT_EXTERN_METHOD(initializeInDevelopmentMode:(NSString *)deviceKeyIdentifier
                  faceScanEncryptionKey:(NSString *)faceScanEncryptionKey
                  callback:(RCTResponseSenderBlock)callback)

RCT_EXTERN_METHOD(initializeInProductionMode:(NSString *)productionKeyText
                  deviceKeyIdentifier:(NSString *)deviceKeyIdentifier
                  faceScanEncryptionKey:(NSString *)faceScanEncryptionKey
                  callback:(RCTResponseSenderBlock)callback)

// Server Configuration (for native init handling)
RCT_EXTERN_METHOD(setServerUrl:(NSString *)url)
RCT_EXTERN_METHOD(setApiKey:(NSString *)key)
RCT_EXTERN_METHOD(configureServer:(NSString *)url apiKey:(NSString *)apiKey)

// Session Config (endpoint override + extra body for Somali flow, etc.)
RCT_EXTERN_METHOD(setSessionConfig:(NSString *)endpoint extraBodyJson:(NSString *)extraBodyJson)
RCT_EXTERN_METHOD(clearSessionConfig)

// UI Customization
RCT_EXTERN_METHOD(setBrandingColors:(NSString *)primaryColor
                  textColor:(NSString *)textColor
                  successColor:(NSString *)successColor)

// Session Methods - Face Verification
RCT_EXTERN_METHOD(startFaceScan:(NSString *)enrollmentId sessionToken:(NSString *)sessionToken)

RCT_EXTERN_METHOD(startEnrollment:(NSString *)enrollmentId sessionToken:(NSString *)sessionToken)

// Session Methods - Document Verification
RCT_EXTERN_METHOD(startIDScan:(NSString *)enrollmentId sessionToken:(NSString *)sessionToken)

RCT_EXTERN_METHOD(startPhotoIDMatch:(NSString *)enrollmentId sessionToken:(NSString *)sessionToken)

RCT_EXTERN_METHOD(startOfficialIDCapture:(NSString *)enrollmentId sessionToken:(NSString *)sessionToken)

// Utility Methods
RCT_EXTERN_METHOD(getSDKVersion:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getUserAgentString:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// Response Handling (v10 blob-based)
RCT_EXTERN_METHOD(proceedToNextStep:(NSString *)responseBlob)

RCT_EXTERN_METHOD(updateUploadProgress:(float)progress)

RCT_EXTERN_METHOD(abortSession)

RCT_EXTERN_METHOD(retry)

RCT_EXTERN_METHOD(cancel)

RCT_EXTERN_METHOD(onFaceTecSDKCompletelyDone)

@end
