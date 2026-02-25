package com.aqoonsi.facetec;

import android.app.Activity;
import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.graphics.Color;

import com.facetec.sdk.FaceTecCustomization;
import com.facetec.sdk.FaceTecSDK;
import com.facetec.sdk.FaceTecSDKInstance;
import com.facetec.sdk.FaceTecSessionRequestProcessor;
import com.facetec.sdk.FaceTecSessionRequestProcessorCallback;
import com.facetec.sdk.FaceTecSessionResult;
import com.facetec.sdk.FaceTecSessionStatus;
import com.facetec.sdk.FaceTecInitializationError;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.json.JSONObject;

/**
 * Aqoonsi FaceTec React Native Module.
 *
 * FaceTec SDK v10.x - uses encrypted request/response blobs
 * with configurable endpoints for different verification flows.
 */
public class AqoonsiFaceTecModule extends ReactContextBaseJavaModule
    implements FaceTecSessionRequestProcessor, FaceTecSDK.InitializeCallback {

  private static final String TAG = "AqoonsiFaceTecModule";

  private FaceTecSDKInstance sdkInstance;
  private volatile FaceTecSessionRequestProcessorCallback sessionRequestCallback;
  private String enrollmentIdentifier = "";
  private SessionType currentSessionType = SessionType.LIVENESS;
  private volatile boolean isInitializing = false;
  private String serverUrl = "";
  private String apiKey = "";
  private String currentDeviceKeyIdentifier = "";

  // Session config overrides (for Somali flow, etc.)
  private volatile String sessionEndpointOverride = null;
  private volatile JSONObject sessionExtraBody = null;

  enum SessionType {
    LIVENESS("liveness"),
    ENROLLMENT("enrollment"),
    ID_SCAN("idScan"),
    PHOTO_ID_MATCH("photoIdMatch"),
    OFFICIAL_ID_CAPTURE("officialIdCapture");

    private final String value;

    SessionType(String value) {
      this.value = value;
    }

    public String getValue() {
      return value;
    }
  }

  AqoonsiFaceTecModule(ReactApplicationContext context) {
    super(context);
  }

  @NonNull
  @Override
  public String getName() {
    return "AqoonsiFaceTecModule";
  }

  @Override
  public void onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy();
    this.sessionRequestCallback = null;
    this.sdkInstance = null;
    this.isInitializing = false;
  }

  // ================== Server Configuration ==================

  @ReactMethod
  public void setServerUrl(String url) {
    this.serverUrl = url;
    Log.d(TAG, "Server URL set to: " + url);
  }

  @ReactMethod
  public void setApiKey(String key) {
    this.apiKey = key;
    Log.d(TAG, "API key set");
  }

  @ReactMethod
  public void configureServer(String url, String apiKey) {
    this.serverUrl = url;
    this.apiKey = apiKey;
    Log.d(TAG, "Server configured: " + url);
  }

  @ReactMethod
  public void setSessionConfig(String endpoint, String extraBodyJson) {
    this.sessionEndpointOverride = endpoint;
    try {
      this.sessionExtraBody = new JSONObject(extraBodyJson);
    } catch (Exception e) {
      this.sessionExtraBody = null;
    }
    Log.d(TAG, "Session config set - endpoint: " + endpoint);
  }

  @ReactMethod
  public void clearSessionConfig() {
    this.sessionEndpointOverride = null;
    this.sessionExtraBody = null;
    Log.d(TAG, "Session config cleared");
  }

  // ================== SDK Initialization (v10) ==================

  @ReactMethod
  public void initializeInDevelopmentMode(String deviceKeyIdentifier, String faceScanEncryptionKey,
      com.facebook.react.bridge.Callback callback) {
    initializeWithSessionRequest(deviceKeyIdentifier, callback);
  }

  @ReactMethod
  public void initializeInProductionMode(String productionKeyText, String deviceKeyIdentifier,
      String faceScanEncryptionKey, com.facebook.react.bridge.Callback callback) {
    initializeWithSessionRequest(deviceKeyIdentifier, callback);
  }

  private void initializeWithSessionRequest(String deviceKeyIdentifier,
      final com.facebook.react.bridge.Callback callback) {
    if (deviceKeyIdentifier == null || deviceKeyIdentifier.isEmpty()) {
      callback.invoke(false, "Device Key was invalid or empty.");
      return;
    }

    synchronized (this) {
      if (this.isInitializing) {
        callback.invoke(false, "Initialization already in progress.");
        return;
      }
      this.isInitializing = true;
    }

    this.currentDeviceKeyIdentifier = deviceKeyIdentifier;

    Context context = getReactApplicationContext();

    Activity currentActivity = getCurrentActivity();
    if (currentActivity == null) {
      this.isInitializing = false;
      callback.invoke(false, "No activity available");
      return;
    }

    currentActivity.runOnUiThread(() -> {
      try {
        FaceTecSDK.initializeWithSessionRequest(
            context,
            deviceKeyIdentifier,
            this,
            new FaceTecSDK.InitializeCallback() {
              @Override
              public void onFaceTecSDKInitializeSuccess(FaceTecSDKInstance instance) {
                sdkInstance = instance;
                isInitializing = false;
                Log.d(TAG, "FaceTec SDK v10 initialized successfully");

                applyDefaultCustomization();

                callback.invoke(true, "FaceTec SDK v10 initialized successfully.");
              }

              @Override
              public void onFaceTecSDKInitializeError(FaceTecInitializationError error) {
                isInitializing = false;
                String message = getInitErrorDescription(error);
                Log.e(TAG, "FaceTec SDK initialization failed: " + message);
                callback.invoke(false, message);
              }
            });
      } catch (Exception e) {
        isInitializing = false;
        Log.e(TAG, "Exception during initialization", e);
        callback.invoke(false, "Initialization exception: " + e.getMessage());
      }
    });
  }

  // ================== FaceTecSDK.InitializeCallback ==================

  @Override
  public void onFaceTecSDKInitializeSuccess(FaceTecSDKInstance instance) {
    this.sdkInstance = instance;
  }

  @Override
  public void onFaceTecSDKInitializeError(FaceTecInitializationError error) {
    Log.e(TAG, "SDK init error: " + getInitErrorDescription(error));
  }

  // ================== UI Customization ==================

  @ReactMethod
  public void setBrandingColors(String primaryColor, String textColor, String successColor) {
    try {
      int primary = Color.parseColor(primaryColor);
      int text = Color.parseColor(textColor);
      int success = Color.parseColor(successColor);
      int primaryDark = darkenColor(primary, 0.15f);
      int secondaryText = Color.parseColor("#64748B");

      FaceTecCustomization customization = new FaceTecCustomization();

      customization.getFrameCustomization().backgroundColor = text;
      customization.getFrameCustomization().borderColor = android.graphics.Color.TRANSPARENT;
      customization.getFrameCustomization().borderWidth = 0;
      customization.getFrameCustomization().cornerRadius = 0;

      customization.getOverlayCustomization().backgroundColor = text;
      customization.getOverlayCustomization().brandingImage = 0;
      customization.getOverlayCustomization().showBrandingImage = false;

      customization.securityWatermarkImage = FaceTecCustomization.FaceTecSecurityWatermarkImage.FACETEC;

      customization.getGuidanceCustomization().backgroundColors = text;
      customization.getGuidanceCustomization().foregroundColor = primary;
      customization.getGuidanceCustomization().readyScreenHeaderTextColor = primary;
      customization.getGuidanceCustomization().readyScreenSubtextTextColor = secondaryText;
      customization.getGuidanceCustomization().buttonBackgroundNormalColor = primary;
      customization.getGuidanceCustomization().buttonBackgroundHighlightColor = primaryDark;
      customization.getGuidanceCustomization().buttonTextNormalColor = text;
      customization.getGuidanceCustomization().buttonTextHighlightColor = text;
      customization.getGuidanceCustomization().buttonCornerRadius = 12;
      customization.getGuidanceCustomization().retryScreenImageBorderColor = primary;
      customization.getGuidanceCustomization().retryScreenOvalStrokeColor = primary;

      customization.getOvalCustomization().strokeColor = primary;
      customization.getOvalCustomization().progressColor1 = success;
      customization.getOvalCustomization().progressColor2 = success;

      customization.getFeedbackCustomization().backgroundColors = primary;
      customization.getFeedbackCustomization().textColor = text;
      customization.getFeedbackCustomization().cornerRadius = 8;

      customization.getResultScreenCustomization().backgroundColors = text;
      customization.getResultScreenCustomization().foregroundColor = primary;
      customization.getResultScreenCustomization().activityIndicatorColor = primary;
      customization.getResultScreenCustomization().resultAnimationBackgroundColor = success;
      customization.getResultScreenCustomization().resultAnimationForegroundColor = text;
      customization.getResultScreenCustomization().uploadProgressFillColor = success;
      customization.getResultScreenCustomization().uploadProgressTrackColor = primaryDark;

      customization.getIdScanCustomization().selectionScreenBackgroundColors = text;
      customization.getIdScanCustomization().selectionScreenForegroundColor = primary;
      customization.getIdScanCustomization().captureScreenForegroundColor = text;
      customization.getIdScanCustomization().captureScreenTextBackgroundColor = primary;
      customization.getIdScanCustomization().captureScreenTextBackgroundBorderColor = primary;
      customization.getIdScanCustomization().captureScreenTextBackgroundCornerRadius = 8;
      customization.getIdScanCustomization().reviewScreenBackgroundColors = text;
      customization.getIdScanCustomization().reviewScreenForegroundColor = primary;
      customization.getIdScanCustomization().reviewScreenTextBackgroundColor = primary;
      customization.getIdScanCustomization().reviewScreenTextBackgroundCornerRadius = 8;
      customization.getIdScanCustomization().buttonBackgroundNormalColor = primary;
      customization.getIdScanCustomization().buttonBackgroundHighlightColor = primaryDark;
      customization.getIdScanCustomization().buttonTextNormalColor = text;
      customization.getIdScanCustomization().buttonTextHighlightColor = text;
      customization.getIdScanCustomization().buttonCornerRadius = 12;
      customization.getIdScanCustomization().captureFrameStrokeColor = primary;

      customization.getCancelButtonCustomization().customImage = 0;

      FaceTecSDK.setCustomization(customization);
      Log.d(TAG, "FaceTec branding applied successfully");
    } catch (Exception e) {
      Log.e(TAG, "Error setting FaceTec branding", e);
    }
  }

  private void applyDefaultCustomization() {
    try {
      FaceTecCustomization customization = new FaceTecCustomization();

      customization.getFrameCustomization().borderWidth = 0;
      customization.getFrameCustomization().cornerRadius = 0;

      customization.securityWatermarkImage = FaceTecCustomization.FaceTecSecurityWatermarkImage.FACETEC;
      customization.getOverlayCustomization().showBrandingImage = false;

      FaceTecSDK.setCustomization(customization);
      Log.d(TAG, "Default customization applied on init");
    } catch (Exception e) {
      Log.e(TAG, "Error applying default customization", e);
    }
  }

  private int darkenColor(int color, float factor) {
    int a = Color.alpha(color);
    int r = Math.round(Color.red(color) * (1 - factor));
    int g = Math.round(Color.green(color) * (1 - factor));
    int b = Math.round(Color.blue(color) * (1 - factor));
    return Color.argb(a, Math.max(r, 0), Math.max(g, 0), Math.max(b, 0));
  }

  // ================== Session Methods (v10) ==================

  @ReactMethod
  public void startFaceScan(String enrollmentId, String sessionToken) {
    this.enrollmentIdentifier = enrollmentId;
    this.currentSessionType = SessionType.LIVENESS;
    launchSession("liveness");
  }

  @ReactMethod
  public void startEnrollment(String enrollmentId, String sessionToken) {
    this.enrollmentIdentifier = enrollmentId;
    this.currentSessionType = SessionType.ENROLLMENT;
    launchSession("enrollment");
  }

  @ReactMethod
  public void startIDScan(String enrollmentId, String sessionToken) {
    this.enrollmentIdentifier = enrollmentId;
    this.currentSessionType = SessionType.ID_SCAN;
    launchSession("idScan");
  }

  @ReactMethod
  public void startPhotoIDMatch(String enrollmentId, String sessionToken) {
    this.enrollmentIdentifier = enrollmentId;
    this.currentSessionType = SessionType.PHOTO_ID_MATCH;
    launchSession("photoIdMatch");
  }

  @ReactMethod
  public void startOfficialIDCapture(String enrollmentId, String sessionToken) {
    this.enrollmentIdentifier = enrollmentId;
    this.currentSessionType = SessionType.OFFICIAL_ID_CAPTURE;
    launchSession("officialIdCapture");
  }

  private void launchSession(String sessionType) {
    Activity currentActivity = getCurrentActivity();
    if (currentActivity == null) {
      sendErrorEvent("No active activity found");
      return;
    }

    currentActivity.runOnUiThread(() -> {
      if (sdkInstance == null) {
        sendErrorEvent("SDK not initialized");
        return;
      }

      try {
        android.content.Intent intent = null;

        switch (sessionType) {
          case "liveness":
            intent = sdkInstance.start3DLiveness(currentActivity, this);
            break;
          case "enrollment":
            intent = sdkInstance.start3DLivenessThen3DFaceMatch(currentActivity, this);
            break;
          case "idScan":
            intent = sdkInstance.startIDScanOnly(currentActivity, this);
            break;
          case "photoIdMatch":
            intent = sdkInstance.start3DLivenessThen3D2DPhotoIDMatch(currentActivity, this);
            break;
          case "officialIdCapture":
            intent = sdkInstance.startSecureOfficialIDPhotoCapture(currentActivity, this);
            break;
          default:
            sendErrorEvent("Unknown session type: " + sessionType);
            return;
        }

        if (intent != null) {
          currentActivity.startActivity(intent);
        }
      } catch (Exception e) {
        Log.e(TAG, "Error launching session", e);
        sendErrorEvent(e.getMessage());
      }
    });
  }

  // ================== FaceTecSessionRequestProcessor (v10) ==================

  @Override
  public void onSessionRequest(String sessionRequestBlob, FaceTecSessionRequestProcessorCallback callback) {
    this.sessionRequestCallback = callback;

    String phase = this.isInitializing ? "initialization" : "session";
    Log.d(TAG, "Handling " + phase + " request natively");
    handleSessionRequest(sessionRequestBlob, callback);
  }

  private void handleSessionRequest(String sessionRequestBlob, FaceTecSessionRequestProcessorCallback callback) {
    if (this.serverUrl.isEmpty()) {
      Log.e(TAG, "Server URL not configured — call setServerUrl() or configureServer() first");
      callback.abortOnCatastrophicError();
      return;
    }

    String apiUrl = this.serverUrl;
    String endpointPath = this.sessionEndpointOverride != null ? this.sessionEndpointOverride : "/v1/kyc/process-request";
    String endpoint = apiUrl + endpointPath;

    // Enforce HTTPS unless targeting localhost (development)
    try {
      java.net.URL urlObj = new java.net.URL(apiUrl);
      String host = urlObj.getHost();
      if ("http".equals(urlObj.getProtocol()) && !"localhost".equals(host) && !"127.0.0.1".equals(host)) {
        Log.e(TAG, "Insecure server URL rejected — HTTPS required for non-localhost: " + apiUrl);
        callback.abortOnCatastrophicError();
        return;
      }
    } catch (Exception e) {
      Log.e(TAG, "Invalid server URL: " + apiUrl, e);
      callback.abortOnCatastrophicError();
      return;
    }

    Log.d(TAG, "Using Aqoonsi API: " + endpoint);

    // Capture overrides but don't clear — they must persist across all blob requests
    // in a multi-step session (e.g., liveness → document scan)
    JSONObject extraBody = this.sessionExtraBody;

    new Thread(() -> {
      HttpURLConnection conn = null;
      try {
        URL url = new URL(endpoint);
        conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(120000);
        conn.setReadTimeout(120000);
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("X-User-Agent", buildUserAgent());
        conn.setRequestProperty("X-Device-Key", this.currentDeviceKeyIdentifier);

        if (!this.apiKey.isEmpty()) {
          conn.setRequestProperty("Authorization", "Bearer " + this.apiKey);
        }

        conn.setDoOutput(true);

        JSONObject body = new JSONObject();
        body.put("sessionRequestBlob", sessionRequestBlob);
        body.put("externalDatabaseRefID", this.enrollmentIdentifier);

        // Merge extra body fields (e.g., hubiyePhoto for Somali flow)
        if (extraBody != null) {
          java.util.Iterator<String> keys = extraBody.keys();
          while (keys.hasNext()) {
            String key = keys.next();
            body.put(key, extraBody.get(key));
          }
        }

        try (OutputStream os = conn.getOutputStream()) {
          os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }

        int responseCode = conn.getResponseCode();
        InputStream is = responseCode >= 400 ? conn.getErrorStream() : conn.getInputStream();

        StringBuilder response = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is))) {
          String line;
          while ((line = reader.readLine()) != null) {
            response.append(line);
          }
        }

        JSONObject json = new JSONObject(response.toString());
        String responseBlob = json.optString("responseBlob", "");

        if (!responseBlob.isEmpty()) {
          Log.d(TAG, "Received response blob, processing...");
          callback.processResponse(responseBlob);
        } else {
          Log.e(TAG, "No response blob found: " + response.toString());
          callback.abortOnCatastrophicError();
        }
      } catch (Exception e) {
        Log.e(TAG, "Session request failed: " + e.getMessage(), e);
        callback.abortOnCatastrophicError();
      } finally {
        if (conn != null) {
          conn.disconnect();
        }
      }
    }).start();
  }

  @Override
  public void onFaceTecExit(FaceTecSessionResult sessionResult) {
    FaceTecSessionStatus status = sessionResult.getStatus();

    WritableMap body = Arguments.createMap();
    body.putString("sessionType", this.currentSessionType.getValue());
    body.putInt("status", status.ordinal());
    body.putString("statusDescription", getSessionStatusDescription(status));
    body.putBoolean("success", status == FaceTecSessionStatus.SESSION_COMPLETED_SUCCESSFULLY);

    sendEvent("onFaceTecExit", body);

    this.sessionRequestCallback = null;
  }

  // ================== Response Handling from React Native ==================

  @ReactMethod
  public void proceedToNextStep(String responseBlob) {
    FaceTecSessionRequestProcessorCallback cb = sessionRequestCallback;
    if (cb != null) {
      cb.processResponse(responseBlob);
    }
  }

  @ReactMethod
  public void updateUploadProgress(float progress) {
    FaceTecSessionRequestProcessorCallback cb = sessionRequestCallback;
    if (cb != null) {
      cb.updateProgress(progress);
    }
  }

  @ReactMethod
  public void abortSession() {
    FaceTecSessionRequestProcessorCallback cb = sessionRequestCallback;
    if (cb != null) {
      cb.abortOnCatastrophicError();
    }
  }

  @ReactMethod
  public void cancel() {
    abortSession();
  }

  @ReactMethod
  public void retry() {
    abortSession();
  }

  @ReactMethod
  public void onFaceTecSDKCompletelyDone() {
    this.sessionRequestCallback = null;
  }

  // ================== Utility Methods ==================

  @ReactMethod
  public void getSDKVersion(com.facebook.react.bridge.Promise promise) {
    try {
      promise.resolve(FaceTecSDK.version());
    } catch (Exception e) {
      promise.reject("ERROR_VERSION", "Failed to get SDK version", e);
    }
  }

  @ReactMethod
  public void getUserAgentString(com.facebook.react.bridge.Promise promise) {
    try {
      promise.resolve(buildUserAgent());
    } catch (Exception e) {
      promise.reject("ERROR_USER_AGENT", "Failed to get user agent string", e);
    }
  }

  private String buildUserAgent() {
    Context context = getReactApplicationContext();
    String packageName = context.getPackageName();
    String appVersion = "1.0";
    try {
      appVersion = context.getPackageManager().getPackageInfo(packageName, 0).versionName;
    } catch (Exception ignored) {}
    String deviceModel = android.os.Build.MODEL;
    String locale = java.util.Locale.getDefault().toString();
    String lang = java.util.Locale.getDefault().getLanguage();
    String sessionId = java.util.UUID.randomUUID().toString();
    return "facetec|sdk|android|" + packageName + "|" + this.currentDeviceKeyIdentifier + "|" + android.provider.Settings.Secure.getString(getReactApplicationContext().getContentResolver(), android.provider.Settings.Secure.ANDROID_ID) + "|" + deviceModel + "|" + appVersion + "|" + locale + "|" + lang + "|" + sessionId;
  }

  // ================== Helper Methods ==================

  private void sendEvent(String eventName, @Nullable WritableMap params) {
    ReactApplicationContext reactContext = getReactApplicationContext();
    if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
          .emit(eventName, params);
    }
  }

  private void sendErrorEvent(String errorMessage) {
    WritableMap map = Arguments.createMap();
    map.putString("error", errorMessage);
    sendEvent("onFaceTecStatus", map);
  }

  private String getInitErrorDescription(FaceTecInitializationError error) {
    switch (error) {
      case DEVICE_NOT_SUPPORTED:
        return "Device is not supported.";
      case DEVICE_LOCKED_OUT:
        return "Device is locked out.";
      case DEVICE_IN_LANDSCAPE_MODE:
        return "Device is in landscape mode.";
      case DEVICE_IN_REVERSE_PORTRAIT_MODE:
        return "Device is in reverse portrait mode.";
      case LICENSE_EXPIRED_OR_INVALID:
        return "License is expired or invalid.";
      case NETWORK_ISSUES:
        return "Network issues during initialization.";
      case GRACE_PERIOD_EXCEEDED:
        return "Grace period exceeded.";
      default:
        return "Unknown initialization error.";
    }
  }

  private String getSessionStatusDescription(FaceTecSessionStatus status) {
    switch (status) {
      case SESSION_COMPLETED_SUCCESSFULLY:
        return "Session completed successfully.";
      case SESSION_UNSUCCESSFUL:
        return "Session was unsuccessful.";
      case USER_CANCELLED:
        return "User cancelled the session.";
      case USER_CANCELLED_VIA_HARDWARE_BUTTON:
        return "User cancelled via hardware button.";
      case USER_CANCELLED_VIA_CLICKABLE_READY_SCREEN_SUBTEXT:
        return "User cancelled via ready screen.";
      case CAMERA_PERMISSION_DENIED:
        return "Camera permission was denied.";
      case CONTEXT_SWITCH:
        return "App went to background.";
      case LANDSCAPE_MODE_NOT_ALLOWED:
        return "Landscape orientation not allowed.";
      case REVERSE_PORTRAIT_NOT_ALLOWED:
        return "Reverse portrait not allowed.";
      case LOCKED_OUT:
        return "Too many failed attempts. Please try again later.";
      case CAMERA_INITIALIZATION_ISSUE:
        return "Camera initialization issue.";
      case UNKNOWN_INTERNAL_ERROR:
        return "An unknown error occurred.";
      case TIMEOUT:
        return "Session timed out.";
      case ENCRYPTION_KEY_INVALID:
        return "Encryption key invalid.";
      case NON_PRODUCTION_MODE_KEY_INVALID:
        return "Development mode key invalid.";
      case NON_PRODUCTION_MODE_NETWORK_REQUIRED:
        return "Network required for development mode.";
      case MISSING_GUIDANCE_IMAGES:
        return "Missing guidance images.";
      case INITIALIZATION_NOT_COMPLETED:
        return "SDK initialization not completed.";
      case DEVICE_NOT_SUPPORTED:
        return "Device not supported.";
      case SESSION_EXPIRED:
        return "Session expired.";
      default:
        return "Unknown status: " + status.name();
    }
  }

  // Required for RN event emitter support
  @ReactMethod
  public void addListener(String eventName) {
    // Keep: Required for RN event emitter
  }

  @ReactMethod
  public void removeListeners(int count) {
    // Keep: Required for RN event emitter
  }
}
