//
//  AqoonsiFaceTecModule.swift
//  @aqoonsi/sdk-react-native
//
//  Aqoonsi FaceTec v10 wrapper with full ID scanning support
//  Uses encrypted request/response blobs with configurable endpoints
//

import Foundation
import UIKit
import React
import FaceTecSDK

@objc(AqoonsiFaceTecModule)
class AqoonsiFaceTecModule: RCTEventEmitter, FaceTecSessionRequestProcessor, FaceTecInitializeCallback {

  // MARK: - Properties

  private var sdkInstance: FaceTecSDKInstance?
  private var enrollmentIdentifier: String = ""
  private var currentSessionType: SessionType = .liveness
  private var initCallback: RCTResponseSenderBlock?
  private var lastSessionStatus: FaceTecSessionStatus?
  private var isInitializing: Bool = false
  private var serverUrl: String = ""
  private var apiKey: String = ""
  private var currentDeviceKeyIdentifier: String = ""

  // Session config overrides (for Somali flow, etc.)
  private var sessionEndpointOverride: String?
  private var sessionExtraBody: [String: Any]?

  // Thread-safe callback access
  private let callbackQueue = DispatchQueue(label: "com.aqoonsi.facetec.callback")
  private var _sessionRequestCallback: FaceTecSessionRequestProcessorCallback?
  private var sessionRequestCallback: FaceTecSessionRequestProcessorCallback? {
    get { callbackQueue.sync { _sessionRequestCallback } }
    set { callbackQueue.sync { _sessionRequestCallback = newValue } }
  }

  enum SessionType: String {
    case liveness = "liveness"
    case enrollment = "enrollment"
    case idScan = "idScan"
    case photoIdMatch = "photoIdMatch"
    case officialIdCapture = "officialIdCapture"
  }

  // MARK: - Status Description Helper

  private func descriptionForSessionStatus(_ status: FaceTecSessionStatus) -> String {
    switch status {
    case .sessionCompleted:
      return "Session completed successfully."
    case .requestAborted:
      return "Session was aborted due to a network error."
    case .userCancelledFaceScan:
      return "User cancelled the face scan."
    case .userCancelledIDScan:
      return "User cancelled the ID scan."
    case .lockedOut:
      return "Too many failed attempts. Please try again later."
    case .cameraError:
      return "Camera error occurred. Please try again."
    case .cameraPermissionsDenied:
      return "Camera permission was denied. Please enable camera access in Settings."
    case .unknownInternalError:
      return "An unknown error occurred. Please try again."
    @unknown default:
      return "Session ended with status code: \(status.rawValue)"
    }
  }

  private func descriptionForInitError(_ error: FaceTecInitializationError) -> String {
    switch error {
    case .rejectedByServer:
      return "The FaceTec Server could not validate this application."
    case .requestAborted:
      return "Initialization request was aborted."
    @unknown default:
      return "Initialization failed with unknown error."
    }
  }

  // MARK: - RCTEventEmitter

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return [
      "onSessionRequest",
      "onFaceTecExit",
      "onFaceTecStatus"
    ]
  }

  // MARK: - SDK Initialization (v10)

  @objc(initializeInDevelopmentMode:faceScanEncryptionKey:callback:)
  func initializeInDevelopmentMode(_ deviceKeyIdentifier: String, faceScanEncryptionKey: String, callback: @escaping RCTResponseSenderBlock) {
    initializeWithSessionRequest(deviceKeyIdentifier, callback: callback)
  }

  @objc(initializeInProductionMode:deviceKeyIdentifier:faceScanEncryptionKey:callback:)
  func initializeInProductionMode(_ productionKeyText: String, deviceKeyIdentifier: String, faceScanEncryptionKey: String, callback: @escaping RCTResponseSenderBlock) {
    initializeWithSessionRequest(deviceKeyIdentifier, callback: callback)
  }

  @objc(setServerUrl:)
  func setServerUrl(_ url: String) {
    self.serverUrl = url
    print("[AqoonsiFaceTec] Server URL set to: \(url)")
  }

  @objc(setApiKey:)
  func setApiKey(_ key: String) {
    self.apiKey = key
    print("[AqoonsiFaceTec] API key set")
  }

  @objc(configureServer:apiKey:)
  func configureServer(_ url: String, apiKey: String) {
    self.serverUrl = url
    self.apiKey = apiKey
    print("[AqoonsiFaceTec] Server configured: \(url)")
  }

  @objc(setSessionConfig:extraBodyJson:)
  func setSessionConfig(_ endpoint: String, extraBodyJson: String) {
    self.sessionEndpointOverride = endpoint
    if let data = extraBodyJson.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      self.sessionExtraBody = json
    } else {
      self.sessionExtraBody = nil
    }
    print("[AqoonsiFaceTec] Session config set - endpoint: \(endpoint)")
  }

  @objc(clearSessionConfig)
  func clearSessionConfig() {
    self.sessionEndpointOverride = nil
    self.sessionExtraBody = nil
    print("[AqoonsiFaceTec] Session config cleared")
  }

  private func initializeWithSessionRequest(_ deviceKeyIdentifier: String, callback: @escaping RCTResponseSenderBlock) {
    print("[AqoonsiFaceTec] initializeWithSessionRequest called with deviceKeyId: \(deviceKeyIdentifier.prefix(10))...")

    guard !isInitializing else {
      print("[AqoonsiFaceTec] Initialization already in progress")
      callback([false, "Initialization already in progress."])
      return
    }

    guard !deviceKeyIdentifier.isEmpty else {
      print("[AqoonsiFaceTec] ERROR: Device Key was invalid or empty")
      callback([false, "Device Key was invalid or empty."])
      return
    }

    self.initCallback = callback
    self.isInitializing = true
    self.currentDeviceKeyIdentifier = deviceKeyIdentifier

    print("[AqoonsiFaceTec] Calling FaceTec.sdk.initializeWithSessionRequest...")

    DispatchQueue.main.async {
      FaceTec.sdk.initializeWithSessionRequest(
        deviceKeyIdentifier: deviceKeyIdentifier,
        sessionRequestProcessor: self,
        completion: self
      )
    }
  }

  // MARK: - FaceTecInitializeCallback

  func onFaceTecSDKInitializeSuccess(sdkInstance: FaceTecSDKInstance) {
    self.sdkInstance = sdkInstance
    self.isInitializing = false

    applyDefaultCustomization()

    self.initCallback?([true, "FaceTec SDK v10 initialized successfully."])
    self.initCallback = nil
  }

  private func applyDefaultCustomization() {
    let customization = FaceTecCustomization()

    customization.frameCustomization.borderWidth = 0
    customization.frameCustomization.cornerRadius = 0

    customization.securityWatermarkImage = .faceTec
    customization.overlayCustomization.showBrandingImage = false

    FaceTec.sdk.setCustomization(customization)
    print("[AqoonsiFaceTec] Default customization applied on init")
  }

  func onFaceTecSDKInitializeError(error: FaceTecInitializationError) {
    print("[AqoonsiFaceTec] onFaceTecSDKInitializeError called with error: \(error) (raw: \(error.rawValue))")
    self.isInitializing = false
    let message = descriptionForInitError(error)
    print("[AqoonsiFaceTec] Init error message: \(message)")
    self.initCallback?([false, message])
    self.initCallback = nil
  }

  // MARK: - UI Customization

  @objc(setBrandingColors:textColor:successColor:)
  func setBrandingColors(_ primaryColor: String, textColor: String, successColor: String) {
    print("[AqoonsiFaceTec] setBrandingColors called with: \(primaryColor), \(textColor), \(successColor)")

    guard let primary = UIColor(hexString: primaryColor),
          let text = UIColor(hexString: textColor),
          let success = UIColor(hexString: successColor) else {
      print("[AqoonsiFaceTec] Invalid color format")
      return
    }

    let primaryDark = primary.darker(by: 0.15)
    let secondaryText = UIColor(hexString: "#64748B") ?? primary.withAlphaComponent(0.6)

    DispatchQueue.main.async {
      let customization = FaceTecCustomization()

      customization.frameCustomization.backgroundColor = text
      customization.frameCustomization.borderColor = UIColor.clear
      customization.frameCustomization.borderWidth = 0
      customization.frameCustomization.cornerRadius = 0
      customization.frameCustomization.shadow = nil

      customization.overlayCustomization.backgroundColor = text
      customization.overlayCustomization.showBrandingImage = false
      customization.overlayCustomization.brandingImage = UIImage()

      customization.securityWatermarkImage = .faceTec
      customization.idScanCustomization.standaloneIDScanWatermark = UIImage()

      customization.guidanceCustomization.backgroundColors = [text, text]
      customization.guidanceCustomization.foregroundColor = primary
      customization.guidanceCustomization.readyScreenHeaderTextColor = primary
      customization.guidanceCustomization.readyScreenSubtextTextColor = secondaryText
      customization.guidanceCustomization.buttonBackgroundNormalColor = primary
      customization.guidanceCustomization.buttonBackgroundHighlightColor = primaryDark
      customization.guidanceCustomization.buttonTextNormalColor = text
      customization.guidanceCustomization.buttonTextHighlightColor = text
      customization.guidanceCustomization.buttonCornerRadius = 12
      customization.guidanceCustomization.retryScreenImageBorderColor = primary
      customization.guidanceCustomization.retryScreenOvalStrokeColor = primary

      customization.ovalCustomization.strokeColor = primary
      customization.ovalCustomization.progressColor1 = success
      customization.ovalCustomization.progressColor2 = success

      let feedbackGradient = CAGradientLayer()
      feedbackGradient.colors = [primary.cgColor, primary.cgColor]
      feedbackGradient.startPoint = CGPoint(x: 0, y: 0)
      feedbackGradient.endPoint = CGPoint(x: 1, y: 0)
      customization.feedbackCustomization.backgroundColor = feedbackGradient
      customization.feedbackCustomization.textColor = text
      customization.feedbackCustomization.cornerRadius = 8

      customization.resultScreenCustomization.backgroundColors = [text, text]
      customization.resultScreenCustomization.foregroundColor = primary
      customization.resultScreenCustomization.activityIndicatorColor = primary
      customization.resultScreenCustomization.resultAnimationBackgroundColor = success
      customization.resultScreenCustomization.resultAnimationForegroundColor = text
      customization.resultScreenCustomization.uploadProgressFillColor = success
      customization.resultScreenCustomization.uploadProgressTrackColor = primary.withAlphaComponent(0.3)

      customization.idScanCustomization.selectionScreenBackgroundColors = [text, text]
      customization.idScanCustomization.selectionScreenForegroundColor = primary
      customization.idScanCustomization.captureScreenForegroundColor = text
      customization.idScanCustomization.captureScreenTextBackgroundColor = primary
      customization.idScanCustomization.captureScreenTextBackgroundBorderColor = primary
      customization.idScanCustomization.captureScreenTextBackgroundBorderWidth = 0
      customization.idScanCustomization.captureScreenTextBackgroundCornerRadius = 8
      customization.idScanCustomization.reviewScreenBackgroundColors = [text, text]
      customization.idScanCustomization.reviewScreenForegroundColor = primary
      customization.idScanCustomization.reviewScreenTextBackgroundColor = primary
      customization.idScanCustomization.reviewScreenTextBackgroundBorderColor = primary
      customization.idScanCustomization.reviewScreenTextBackgroundCornerRadius = 8
      customization.idScanCustomization.buttonBackgroundNormalColor = primary
      customization.idScanCustomization.buttonBackgroundHighlightColor = primaryDark
      customization.idScanCustomization.buttonTextNormalColor = text
      customization.idScanCustomization.buttonTextHighlightColor = text
      customization.idScanCustomization.buttonCornerRadius = 12

      customization.cancelButtonCustomization.location = .topLeft

      FaceTec.sdk.setCustomization(customization)
      print("[AqoonsiFaceTec] Branding applied")
    }
  }

  // MARK: - Session Methods (v10)

  @objc(startFaceScan:sessionToken:)
  func startFaceScan(_ enrollmentId: String, sessionToken: String) {
    self.enrollmentIdentifier = enrollmentId
    self.currentSessionType = .liveness

    DispatchQueue.main.async {
      guard let instance = self.sdkInstance else {
        self.sendEvent(withName: "onFaceTecStatus", body: ["error": "SDK not initialized"])
        return
      }
      let viewController = instance.start3DLiveness(with: self)
      self.presentViewController(viewController)
    }
  }

  @objc(startEnrollment:sessionToken:)
  func startEnrollment(_ enrollmentId: String, sessionToken: String) {
    self.enrollmentIdentifier = enrollmentId
    self.currentSessionType = .enrollment

    DispatchQueue.main.async {
      guard let instance = self.sdkInstance else {
        self.sendEvent(withName: "onFaceTecStatus", body: ["error": "SDK not initialized"])
        return
      }
      let viewController = instance.start3DLivenessThen3DFaceMatch(with: self)
      self.presentViewController(viewController)
    }
  }

  @objc(startIDScan:sessionToken:)
  func startIDScan(_ enrollmentId: String, sessionToken: String) {
    self.enrollmentIdentifier = enrollmentId
    self.currentSessionType = .idScan

    DispatchQueue.main.async {
      guard let instance = self.sdkInstance else {
        self.sendEvent(withName: "onFaceTecStatus", body: ["error": "SDK not initialized"])
        return
      }
      let viewController = instance.startIDScanOnly(with: self)
      self.presentViewController(viewController)
    }
  }

  @objc(startPhotoIDMatch:sessionToken:)
  func startPhotoIDMatch(_ enrollmentId: String, sessionToken: String) {
    self.enrollmentIdentifier = enrollmentId
    self.currentSessionType = .photoIdMatch

    DispatchQueue.main.async {
      guard let instance = self.sdkInstance else {
        self.sendEvent(withName: "onFaceTecStatus", body: ["error": "SDK not initialized"])
        return
      }
      let viewController = instance.start3DLivenessThen3D2DPhotoIDMatch(with: self)
      self.presentViewController(viewController)
    }
  }

  @objc(startOfficialIDCapture:sessionToken:)
  func startOfficialIDCapture(_ enrollmentId: String, sessionToken: String) {
    self.enrollmentIdentifier = enrollmentId
    self.currentSessionType = .officialIdCapture

    DispatchQueue.main.async {
      guard let instance = self.sdkInstance else {
        self.sendEvent(withName: "onFaceTecStatus", body: ["error": "SDK not initialized"])
        return
      }
      let viewController = instance.startSecureOfficialIDPhotoCapture(with: self)
      self.presentViewController(viewController)
    }
  }

  // MARK: - Helper Methods

  private func presentViewController(_ viewController: UIViewController) {
    if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
       let rootViewController = scene.windows.first?.rootViewController {
      viewController.modalPresentationStyle = .fullScreen
      rootViewController.present(viewController, animated: true, completion: nil)
    } else {
      print("[AqoonsiFaceTec] Could not find root View Controller")
      self.sendEvent(withName: "onFaceTecStatus", body: ["error": "Could not present FaceTec UI"])
    }
  }

  @objc(getSDKVersion:rejecter:)
  func getSDKVersion(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let version = FaceTec.sdk.version
    resolve(version)
  }

  @objc(getUserAgentString:rejecter:)
  func getUserAgentString(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    let bundleId = Bundle.main.bundleIdentifier ?? "com.aqoonsi.app"
    let userAgent = "facetec|sdk|ios|\(bundleId)|\(self.currentDeviceKeyIdentifier)||\(UIDevice.current.model)|\(appVersion)|\(Locale.current.identifier)|\(Locale.current.languageCode ?? "en")|\(UUID().uuidString)"
    resolve(userAgent)
  }

  // MARK: - FaceTecSessionRequestProcessor (v10)

  func onSessionRequest(sessionRequestBlob: String, sessionRequestCallback: FaceTecSessionRequestProcessorCallback) {
    self.sessionRequestCallback = sessionRequestCallback

    let phase = self.isInitializing ? "initialization" : "session"
    print("[AqoonsiFaceTec] Handling \(phase) request natively")

    handleSessionRequest(sessionRequestBlob: sessionRequestBlob, callback: sessionRequestCallback)
  }

  private func handleSessionRequest(sessionRequestBlob: String, callback: FaceTecSessionRequestProcessorCallback) {
    guard !self.serverUrl.isEmpty else {
      print("[AqoonsiFaceTec] Server URL not configured — call setServerUrl() or configureServer() first")
      callback.abortOnCatastrophicError()
      return
    }

    let apiUrl = self.serverUrl
    let endpointPath = self.sessionEndpointOverride ?? "/v1/kyc/process-request"
    let endpoint = "\(apiUrl)\(endpointPath)"

    // Enforce HTTPS unless targeting localhost (development)
    if let urlObj = URL(string: apiUrl),
       urlObj.scheme == "http",
       let host = urlObj.host,
       host != "localhost" && host != "127.0.0.1" {
      print("[AqoonsiFaceTec] Insecure server URL rejected — HTTPS required for non-localhost: \(apiUrl)")
      callback.abortOnCatastrophicError()
      return
    }

    // Capture overrides but don't clear — they must persist across all blob requests
    // in a multi-step session (e.g., liveness → document scan)
    let extraBody = self.sessionExtraBody

    guard let url = URL(string: endpoint) else {
      print("[AqoonsiFaceTec] Invalid server URL: \(endpoint)")
      callback.abortOnCatastrophicError()
      return
    }

    print("[AqoonsiFaceTec] POST \(endpoint) (blob: \(sessionRequestBlob.count) chars)")

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 120
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(self.currentDeviceKeyIdentifier, forHTTPHeaderField: "X-Device-Key")

    let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    let bundleId = Bundle.main.bundleIdentifier ?? "com.aqoonsi.app"
    let deviceModel = UIDevice.current.model
    let locale = Locale.current.identifier
    let lang = Locale.current.languageCode ?? "en"
    let sessionId = UUID().uuidString
    let userAgent = "facetec|sdk|ios|\(bundleId)|\(self.currentDeviceKeyIdentifier)||\(deviceModel)|\(appVersion)|\(locale)|\(lang)|\(sessionId)"
    request.setValue(userAgent, forHTTPHeaderField: "X-User-Agent")

    if !self.apiKey.isEmpty {
      request.setValue("Bearer \(self.apiKey)", forHTTPHeaderField: "Authorization")
    }

    var body: [String: Any] = [
      "sessionRequestBlob": sessionRequestBlob
    ]
    if !self.enrollmentIdentifier.isEmpty {
      body["externalDatabaseRefID"] = self.enrollmentIdentifier
    }

    // Merge extra body fields (e.g., hubiyePhoto for Somali flow)
    if let extra = extraBody {
      for (key, value) in extra {
        body[key] = value
      }
    }

    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    } catch {
      print("[AqoonsiFaceTec] Failed to serialize request body: \(error)")
      callback.abortOnCatastrophicError()
      return
    }

    let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      guard self != nil else {
        callback.abortOnCatastrophicError()
        return
      }

      if let error = error {
        print("[AqoonsiFaceTec] Request failed: \(error)")
        callback.abortOnCatastrophicError()
        return
      }

      guard let data = data else {
        print("[AqoonsiFaceTec] No data received from server")
        callback.abortOnCatastrophicError()
        return
      }

      do {
        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
          let responseBlob = json["responseBlob"] as? String

          if let blob = responseBlob, !blob.isEmpty {
            print("[AqoonsiFaceTec] Response received (\(blob.count) chars), processing...")
            callback.processResponse(blob)
          } else {
            if let responseString = String(data: data, encoding: .utf8) {
              print("[AqoonsiFaceTec] Raw response: \(responseString)")
            }
            print("[AqoonsiFaceTec] No response blob in response")
            callback.abortOnCatastrophicError()
          }
        } else {
          if let responseString = String(data: data, encoding: .utf8) {
            print("[AqoonsiFaceTec] Raw response: \(responseString)")
          }
          print("[AqoonsiFaceTec] Invalid response format")
          callback.abortOnCatastrophicError()
        }
      } catch {
        print("[AqoonsiFaceTec] Failed to parse response: \(error)")
        callback.abortOnCatastrophicError()
      }
    }

    task.resume()
  }

  func onFaceTecExit(sessionResult: FaceTecSessionResult) {
    self.lastSessionStatus = sessionResult.sessionStatus

    let body: [String: Any] = [
      "sessionType": self.currentSessionType.rawValue,
      "status": sessionResult.sessionStatus.rawValue,
      "statusDescription": self.descriptionForSessionStatus(sessionResult.sessionStatus),
      "success": sessionResult.sessionStatus == .sessionCompleted
    ]

    self.sendEvent(withName: "onFaceTecExit", body: body)

    self.sessionRequestCallback = nil
  }

  // MARK: - Response Handling from React Native

  @objc(proceedToNextStep:)
  func proceedToNextStep(_ responseBlob: String) {
    if let callback = self.sessionRequestCallback {
      callback.processResponse(responseBlob)
    }
  }

  @objc(updateUploadProgress:)
  func updateUploadProgress(_ progress: Float) {
    if let callback = self.sessionRequestCallback {
      callback.updateProgress(progress)
    }
  }

  @objc(abortSession)
  func abortSession() {
    if let callback = self.sessionRequestCallback {
      callback.abortOnCatastrophicError()
    }
  }

  @objc(cancel)
  func cancel() {
    abortSession()
  }

  @objc(retry)
  func retry() {
    abortSession()
  }

  @objc(onFaceTecSDKCompletelyDone)
  func onFaceTecSDKCompletelyDone() {
    self.sessionRequestCallback = nil
  }
}

// MARK: - UIColor Extension

extension UIColor {
  convenience init?(hexString: String) {
    var hex = hexString.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()

    if hex.hasPrefix("#") {
      hex.remove(at: hex.startIndex)
    }

    guard hex.count == 6 else { return nil }

    var rgbValue: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&rgbValue)

    let r = CGFloat((rgbValue & 0xFF0000) >> 16) / 255.0
    let g = CGFloat((rgbValue & 0x00FF00) >> 8) / 255.0
    let b = CGFloat(rgbValue & 0x0000FF) / 255.0

    self.init(red: r, green: g, blue: b, alpha: 1.0)
  }

  func darker(by percentage: CGFloat) -> UIColor {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    self.getRed(&r, green: &g, blue: &b, alpha: &a)
    return UIColor(
      red: max(r - percentage, 0),
      green: max(g - percentage, 0),
      blue: max(b - percentage, 0),
      alpha: a
    )
  }
}
