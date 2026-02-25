// Aqoonsi KYC React Native SDK
// Unified SDK with embedded FaceTec native module

import { AqoonsiAPI } from './api';
import type {
  AqoonsiConfig,
  AqoonsiCallbacks,
  AqoonsiError,
  VerificationType,
  VerificationResult,
  VerificationStatusResponse,
  ProfileResponse,
  FaceTecCredentials,
} from './types';

export * from './types';
export { AqoonsiAPI } from './api';

// Re-export the embedded FaceTec SDK wrapper
import { sdk as embeddedFaceTecSdk } from './native/FaceTecSDK';
export { FaceTecSDK, sdk as faceTecSdk } from './native/FaceTecSDK';
export { FaceTecSessionStatus } from './native/types';
export type {
  FaceTecConfig,
  FaceTecExitResult,
  FaceTecStatusEvent,
  FaceTecEventSubscription,
} from './native/types';
export type { FaceTecExitEvent } from './native/FaceTecSDK';

// FaceTec SDK interface (compatible with both embedded and external FaceTec modules)
type FaceTecSDKInterface = {
  initialize: (config: {
    serverUrl?: string;
    apiKey?: string;
    deviceKeyIdentifier: string;
    faceScanEncryptionKey: string;
    productionKeyText?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  startFaceScan: (enrollmentId: string, sessionToken: string) => void;
  startEnrollment: (enrollmentId: string, sessionToken: string) => void;
  startIDScan: (enrollmentId: string, sessionToken: string) => void;
  startPhotoIDMatch: (enrollmentId: string, sessionToken: string) => void;
  onFaceTecExit: (callback: (result: { status: number; statusDescription: string; success: boolean }) => void) => { remove: () => void };
  proceedToNextStep: (scanResultBlob: string) => void;
  cancel: () => void;
  setBrandingColors: (primary: string, text: string, success: string) => void;
  setSessionConfig: (endpoint: string, extraBody: Record<string, unknown>) => void;
  clearSessionConfig: () => void;
};

export class AqoonsiSDK {
  private config: AqoonsiConfig;
  private api: AqoonsiAPI;
  private callbacks: AqoonsiCallbacks = {};
  private faceTecSDK: FaceTecSDKInterface | null = null;
  private isInitialized = false;

  // Current session state
  private verificationId: string | null = null;
  private verificationType: VerificationType | null = null;
  private hubiyePhoto: string | null = null;
  private otpConsentId: string | null = null;
  private parentVerificationId: string | null = null;

  constructor(config: AqoonsiConfig) {
    this.config = config;
    this.api = new AqoonsiAPI(config.apiKey, config.apiUrl);
  }

  /**
   * Fetch FaceTec credentials from Aqoonsi API
   * Use this if you don't want to bundle credentials in your app
   */
  async fetchCredentials(): Promise<FaceTecCredentials> {
    try {
      const creds = await this.api.getCredentials();
      if (!creds.success) {
        throw new Error('Failed to fetch credentials');
      }
      return {
        deviceKeyIdentifier: creds.deviceKeyIdentifier,
        publicFaceMapEncryptionKey: creds.publicFaceMapEncryptionKey,
        licenseText: creds.licenseText,
      };
    } catch (error) {
      this.handleError('CREDENTIALS_FAILED', (error as Error).message);
      throw error;
    }
  }

  /**
   * Initialize the SDK with FaceTec.
   * FaceTec SDK is optional — if not provided, uses the embedded native module.
   *
   * Usage:
   *   await aqoonsi.initialize({ onVerificationComplete: ... })     // uses embedded FaceTec
   *   await aqoonsi.initialize(externalFaceTec, { onComplete: ... }) // uses external FaceTec
   *
   * If credentials are not provided in config, they will be fetched from Aqoonsi API automatically.
   */
  async initialize(
    callbacksOrFaceTec?: AqoonsiCallbacks | FaceTecSDKInterface,
    callbacks?: AqoonsiCallbacks
  ): Promise<{ success: boolean; message?: string }> {
    if (__DEV__) {
      const maskedKey = this.config.apiKey
        ? '...' + this.config.apiKey.slice(-4)
        : 'not set';
      console.log('[AqoonsiSDK] initialize() called');
      console.log('[AqoonsiSDK] config.apiUrl:', this.config.apiUrl);
      console.log('[AqoonsiSDK] config.apiKey:', maskedKey);
      console.log('[AqoonsiSDK] config.deviceKeyIdentifier:', this.config.deviceKeyIdentifier ? 'provided' : 'not provided');
    }

    // Determine if first arg is FaceTec SDK or callbacks
    let faceTecSDK: FaceTecSDKInterface;
    let resolvedCallbacks: AqoonsiCallbacks | undefined;

    if (callbacksOrFaceTec && 'startFaceScan' in callbacksOrFaceTec) {
      // First arg is FaceTec SDK (has startFaceScan method)
      faceTecSDK = callbacksOrFaceTec as FaceTecSDKInterface;
      resolvedCallbacks = callbacks;
    } else {
      // First arg is callbacks (or undefined), use embedded FaceTec
      faceTecSDK = embeddedFaceTecSdk;
      resolvedCallbacks = callbacksOrFaceTec as AqoonsiCallbacks | undefined;
    }

    if (resolvedCallbacks) {
      this.callbacks = resolvedCallbacks;
    }

    this.faceTecSDK = faceTecSDK;

    try {
      // Check API connectivity
      if (__DEV__) console.log('[AqoonsiSDK] Step 1: Checking API status...');
      const status = await this.api.checkStatus();
      if (__DEV__) console.log('[AqoonsiSDK] API status response:', JSON.stringify(status));
      if (!status.success || !status.running) {
        throw new Error('Aqoonsi API is not available');
      }
      if (__DEV__) console.log('[AqoonsiSDK] Step 1: API is available');

      // Get credentials - either from config or fetch from API
      let deviceKeyIdentifier = this.config.deviceKeyIdentifier;
      let faceScanEncryptionKey = this.config.faceScanEncryptionKey;
      let productionKeyText = this.config.productionKeyText;

      if (!deviceKeyIdentifier || !faceScanEncryptionKey) {
        if (__DEV__) console.log('[AqoonsiSDK] Step 2: Fetching credentials from API...');
        const creds = await this.fetchCredentials();
        if (__DEV__) {
          console.log('[AqoonsiSDK] Credentials received - hasDeviceKeyId:', !!creds.deviceKeyIdentifier);
          console.log('[AqoonsiSDK] Credentials received - hasPublicKey:', !!creds.publicFaceMapEncryptionKey);
          console.log('[AqoonsiSDK] Credentials received - hasLicense:', !!creds.licenseText);
        }
        deviceKeyIdentifier = creds.deviceKeyIdentifier;
        faceScanEncryptionKey = creds.publicFaceMapEncryptionKey;
        productionKeyText = creds.licenseText;
        if (__DEV__) console.log('[AqoonsiSDK] Step 2: Credentials fetched');
      } else {
        if (__DEV__) console.log('[AqoonsiSDK] Step 2: Using credentials from config');
      }

      // Initialize FaceTec
      if (deviceKeyIdentifier && faceScanEncryptionKey) {
        if (__DEV__) {
          console.log('[AqoonsiSDK] Step 3: Initializing FaceTec SDK...');
          console.log('[AqoonsiSDK] FaceTec init params - serverUrl:', this.config.apiUrl);
          console.log('[AqoonsiSDK] FaceTec init params - hasPublicKey:', !!faceScanEncryptionKey);
          console.log('[AqoonsiSDK] FaceTec init params - hasLicense:', !!productionKeyText);
        }

        const result = await faceTecSDK.initialize({
          serverUrl: this.config.apiUrl,
          apiKey: this.config.apiKey,
          deviceKeyIdentifier,
          faceScanEncryptionKey,
          productionKeyText,
        });

        if (__DEV__) console.log('[AqoonsiSDK] FaceTec init result:', JSON.stringify(result));

        if (!result.success) {
          if (__DEV__) console.log('[AqoonsiSDK] Step 3: FaceTec init FAILED');
          return result;
        }
        if (__DEV__) console.log('[AqoonsiSDK] Step 3: FaceTec initialized');
      }

      this.isInitialized = true;
      if (__DEV__) console.log('[AqoonsiSDK] Init complete');
      return { success: true };
    } catch (error) {
      if (__DEV__) console.error('[AqoonsiSDK] Init error:', error);
      const err = this.createError('INIT_FAILED', (error as Error).message);
      this.callbacks.onError?.(err);
      return { success: false, message: err.message };
    }
  }

  /**
   * Start a new KYC verification session, or resume one where the face scan
   * completed but the document scan was not finished.
   * Returns { verificationId, resumed } — if resumed is true, call
   * startIDScanOnly() instead of startDocumentScan() to skip the face scan.
   *
   * Note: externalUserId should be injected server-side by your backend proxy,
   * not passed from client code. Only pass it for server-to-server calls.
   */
  async startVerification(
    type: VerificationType,
    externalUserId?: string
  ): Promise<{ verificationId: string; resumed: boolean; enrolled: boolean }> {
    this.ensureInitialized();

    try {
      const session = await this.api.createSession(type, externalUserId);
      if (!session.success) {
        throw new Error(session.error || 'Failed to create session');
      }

      this.verificationId = session.verificationId;
      this.verificationType = type;
      this.callbacks.onSessionStarted?.(session.verificationId);

      return {
        verificationId: session.verificationId,
        resumed: !!session.resumed,
        enrolled: !!session.enrolled,
      };
    } catch (error) {
      this.handleError('SESSION_FAILED', (error as Error).message);
      throw error;
    }
  }

  /**
   * Get FaceTec session token for face scan
   */
  async getSessionToken(): Promise<string> {
    this.ensureInitialized();

    const result = await this.api.getSessionToken();
    if (!result.success || !result.sessionToken) {
      throw new Error('Failed to get session token');
    }
    return result.sessionToken;
  }

  // --- Somali Path ---

  /**
   * Initiate OTP for Somali National ID verification
   */
  async initiateSomaliOTP(idNumber: string): Promise<string> {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (this.verificationType !== 'SOMALI_NID') {
      throw new Error('Invalid verification type for Somali path');
    }

    try {
      const result = await this.api.initiateSomaliOTP(
        this.verificationId!,
        idNumber
      );

      if (!result.success) {
        throw new Error(result.errorCode || 'Failed to send OTP');
      }

      this.otpConsentId = result.otpConsentId!;
      this.callbacks.onOTPSent?.(this.otpConsentId);

      return this.otpConsentId;
    } catch (error) {
      this.handleError('OTP_FAILED', (error as Error).message);
      throw error;
    }
  }

  /**
   * Verify OTP and get profile for Somali National ID
   */
  async verifySomaliOTP(
    idNumber: string,
    otpCode: string
  ): Promise<ProfileResponse> {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.otpConsentId) {
      throw new Error('OTP not initiated');
    }

    try {
      const result = await this.api.verifySomaliOTP(
        this.verificationId!,
        idNumber,
        this.otpConsentId,
        otpCode
      );

      if (!result.success) {
        throw new Error(result.errorCode || 'OTP verification failed');
      }

      // Store photo for face matching
      this.hubiyePhoto = result.photo || null;
      this.callbacks.onProfileReceived?.(result);

      return result;
    } catch (error) {
      this.handleError('OTP_VERIFY_FAILED', (error as Error).message);
      throw error;
    }
  }

  /**
   * Start a liveness face scan session (v10 blob-based).
   * Configures the native FaceTec module to include verificationId in blob requests.
   * Call this after startVerification('LIVENESS').
   */
  startLivenessScan(): void {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.faceTecSDK) {
      throw new Error('FaceTec SDK not initialized');
    }

    this.faceTecSDK.setSessionConfig('/v1/kyc/process-request', {
      verificationId: this.verificationId!,
    });

    this.faceTecSDK.startFaceScan(this.verificationId!, '');
  }

  /**
   * Start a combined liveness + document ID scan session (v10 blob-based).
   * Uses FaceTec's start3DLivenessThen3D2DPhotoIDMatch for proper face-document linking.
   * The SDK handles liveness check and 3D:2D face matching in a single session.
   * Call this after startVerification('INTERNATIONAL_DOC').
   */
  startDocumentScan(): void {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.faceTecSDK) {
      throw new Error('FaceTec SDK not initialized');
    }

    this.faceTecSDK.setSessionConfig('/v1/kyc/process-request', {
      verificationId: this.verificationId!,
    });

    this.faceTecSDK.startPhotoIDMatch(this.verificationId!, '');
  }

  /**
   * Start a standalone document ID scan session without face matching (v10 blob-based).
   * Uses FaceTec's startIDScanOnly — captures document and runs OCR but does NOT
   * perform 3D:2D face matching. Use this when only document capture is needed.
   */
  startIDScanOnly(): void {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.faceTecSDK) {
      throw new Error('FaceTec SDK not initialized');
    }

    this.faceTecSDK.setSessionConfig('/v1/kyc/process-request', {
      verificationId: this.verificationId!,
    });

    this.faceTecSDK.startIDScan(this.verificationId!, '');
  }

  /**
   * Start a 3D enrollment or re-verification session (v10 blob-based).
   * Uses FaceTec's start3DLivenessThen3DFaceMatch:
   * - If externalDatabaseRefID is NOT enrolled → 3D Enrollment
   * - If externalDatabaseRefID IS enrolled → 3D:3D Re-Verification (match level 0 or 15)
   * Call this for returning users, followed by startIDScanOnly() for document capture.
   */
  startEnrollmentScan(): void {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.faceTecSDK) {
      throw new Error('FaceTec SDK not initialized');
    }

    this.faceTecSDK.setSessionConfig('/v1/kyc/process-request', {
      verificationId: this.verificationId!,
    });

    this.faceTecSDK.startEnrollment(this.verificationId!, '');
  }

  /**
   * Start a Somali face scan session (v10 blob-based).
   * Configures the native FaceTec module to send blobs to /v1/kyc/process-somali
   * with the Hubiye photo, so liveness + 3D:2D match happen in one call.
   * Call this after verifySomaliOTP() has stored the Hubiye photo.
   */
  startSomaliFaceScan(): void {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.faceTecSDK) {
      throw new Error('FaceTec SDK not initialized');
    }

    if (!this.hubiyePhoto) {
      throw new Error('Hubiye photo not available. Complete OTP verification first.');
    }

    // Configure native module to send blob to Somali endpoint with extra fields
    this.faceTecSDK.setSessionConfig('/v1/kyc/process-somali', {
      hubiyePhoto: this.hubiyePhoto,
      verificationId: this.verificationId!,
      sessionType: 'somali',
    });

    // Start face scan - native module will use the configured endpoint
    this.faceTecSDK.startFaceScan(this.verificationId!, '');
  }

  // --- Upgrade Path (Progressive KYC) ---

  /**
   * Start an upgrade session to add document verification to an existing liveness verification.
   * No new face scan needed — backend matches the stored FaceMap.
   */
  async startUpgradeSession(
    parentVerificationId: string,
    upgradeType: string,
    externalUserId?: string
  ): Promise<string> {
    this.ensureInitialized();

    try {
      const result = await this.api.startUpgradeSession(
        parentVerificationId,
        upgradeType,
        externalUserId
      );

      if (!result.success) {
        throw new Error('Failed to create upgrade session');
      }

      this.verificationId = result.verificationId;
      this.parentVerificationId = parentVerificationId;
      this.callbacks.onSessionStarted?.(result.verificationId);

      return result.verificationId;
    } catch (error) {
      this.handleError('UPGRADE_SESSION_FAILED', (error as Error).message);
      throw error;
    }
  }

  /**
   * Complete a Somali NID upgrade using the Hubiye photo from OTP verification.
   * Requires startUpgradeSession() and verifySomaliOTP() to have been called first.
   */
  async completeUpgradeSomali(): Promise<VerificationResult> {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.parentVerificationId) {
      throw new Error('Not in upgrade mode. Call startUpgradeSession() first.');
    }

    if (!this.hubiyePhoto) {
      throw new Error('Hubiye photo not available. Complete OTP verification first.');
    }

    try {
      const result = await this.api.completeUpgradeSomali(
        this.verificationId!,
        this.hubiyePhoto
      );

      this.callbacks.onUpgradeComplete?.(result);
      this.callbacks.onVerificationComplete?.(result);
      this.resetSession();

      return result;
    } catch (error) {
      this.handleError('UPGRADE_FAILED', (error as Error).message);
      throw error;
    }
  }

  /**
   * Complete an international document upgrade with ID scan images.
   * No face scan needed — backend matches the stored FaceMap.
   */
  async completeUpgradeInternational(
    idScanFrontImage: string,
    idScanBackImage?: string
  ): Promise<VerificationResult> {
    this.ensureInitialized();
    this.ensureVerificationStarted();

    if (!this.parentVerificationId) {
      throw new Error('Not in upgrade mode. Call startUpgradeSession() first.');
    }

    try {
      const result = await this.api.completeUpgradeInternational(
        this.verificationId!,
        idScanFrontImage,
        idScanBackImage
      );

      this.callbacks.onUpgradeComplete?.(result);
      this.callbacks.onVerificationComplete?.(result);
      this.resetSession();

      return result;
    } catch (error) {
      this.handleError('UPGRADE_FAILED', (error as Error).message);
      throw error;
    }
  }

  // --- Utilities ---

  /**
   * Check verification status for an external user.
   * Returns whether the user is verified, expired, or requires re-verification.
   *
   * Note: prefer routing this through your backend proxy which injects the UID
   * server-side. Only pass externalUserId for server-to-server calls.
   */
  async getVerificationStatus(externalUserId?: string): Promise<VerificationStatusResponse> {
    this.ensureInitialized();
    return this.api.getVerificationStatus(externalUserId);
  }

  getVerificationId(): string | null {
    return this.verificationId;
  }

  getHubiyePhoto(): string | null {
    return this.hubiyePhoto;
  }

  cancelVerification(): void {
    this.faceTecSDK?.cancel();
    this.resetSession();
  }

  /**
   * Set branding colors on the embedded FaceTec UI.
   * Passthrough to the underlying FaceTec SDK.
   */
  setBrandingColors(primaryColor: string, textColor: string, successColor: string): void {
    this.faceTecSDK?.setBrandingColors(primaryColor, textColor, successColor);
  }

  /**
   * Listen for FaceTec session exit events.
   * Passthrough to the underlying FaceTec SDK.
   */
  onFaceTecExit(handler: (result: { sessionType: string; status: number; statusDescription: string; success: boolean }) => void): { remove: () => void } {
    if (!this.faceTecSDK) {
      throw new Error('FaceTec SDK not initialized');
    }
    return this.faceTecSDK.onFaceTecExit(handler);
  }

  /**
   * Set an existing verification ID and type on the SDK instance.
   * Use this when reusing a session across screens (e.g., face scan → document scan).
   */
  setVerificationId(id: string, type?: VerificationType): void {
    this.verificationId = id;
    this.verificationType = type || 'INTERNATIONAL_DOC';
  }

  // --- Private Methods ---

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
  }

  private ensureVerificationStarted(): void {
    if (!this.verificationId) {
      throw new Error('No verification in progress. Call startVerification() first.');
    }
  }

  private resetSession(): void {
    this.verificationId = null;
    this.verificationType = null;
    this.hubiyePhoto = null;
    this.otpConsentId = null;
    this.parentVerificationId = null;
  }

  private createError(code: string, message: string): AqoonsiError {
    return { code, message };
  }

  private handleError(code: string, message: string): void {
    const error = this.createError(code, message);
    this.callbacks.onError?.(error);
  }
}

export default AqoonsiSDK;
