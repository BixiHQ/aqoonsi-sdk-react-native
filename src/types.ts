// Aqoonsi React Native SDK Types

export type VerificationType = 'SOMALI_NID' | 'INTERNATIONAL_DOC' | 'LIVENESS';
export type VerificationStatus = 'PENDING' | 'OTP_SENT' | 'PROCESSING' | 'VERIFIED' | 'FAILED';

export interface AqoonsiConfig {
  apiKey: string;
  apiUrl: string;
  // FaceTec credentials (optional - can be fetched from API)
  deviceKeyIdentifier?: string;
  faceScanEncryptionKey?: string;
  productionKeyText?: string;
}

export interface AqoonsiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SessionResponse {
  success: boolean;
  sessionId: string;
  verificationId: string;
  resumed?: boolean;
  enrolled?: boolean;
  error?: string;
}

export interface OTPResponse {
  success: boolean;
  otpConsentId?: string;
  message?: string;
  errorCode?: string;
}

export interface ProfileData {
  id_number: string;
  full_name: string;
  date_of_birth: string;
  mother_name?: string;
  residential_status?: string;
  status: string;
}

export interface ProfileResponse {
  success: boolean;
  seedingData?: ProfileData;
  photo?: string; // Base64
  errorCode?: string;
  message?: string;
}

export interface VerificationResult {
  success: boolean;
  verificationId: string;
  status: VerificationStatus;
  fullName?: string;
  dateOfBirth?: string;
  idNumber?: string;
  documentType?: string;
  documentCountry?: string;
  livenessProven: boolean;
  faceMatchLevel: number;
  ageEstimate?: number;
  failureReason?: string;
  error?: string;
}

export interface FaceScanResult {
  enrollmentIdentifier: string;
  sessionType?: string;
  faceScan?: string;
  auditTrailImage?: string;
  lowQualityAuditTrailImage?: string;
  sessionId?: string; // Added by caller, not from FaceTec event
}

export interface IDScanResult {
  enrollmentIdentifier: string;
  sessionType?: string;
  idScan?: string;
  frontImage?: string;
  backImage?: string;
  // Face scan data (for Photo ID Match)
  faceScan?: string;
  auditTrailImage?: string;
  lowQualityAuditTrailImage?: string;
  sessionId?: string;
}

// Credentials from Aqoonsi API
export interface FaceTecCredentials {
  deviceKeyIdentifier: string;
  publicFaceMapEncryptionKey: string;
  licenseText?: string;
}

export interface UpgradeSessionResponse {
  success: boolean;
  verificationId: string;
  parentVerificationId: string;
  sessionId: string;
  upgradeType: string;
}

// Verification status (re-verification support)
export interface VerificationStatusResponse {
  verified: boolean;
  expired: boolean;
  requiresReverification: boolean;
  verification?: VerificationResult;
}

// Callbacks
export interface AqoonsiCallbacks {
  onSessionStarted?: (verificationId: string) => void;
  onOTPSent?: (otpConsentId: string) => void;
  onProfileReceived?: (profile: ProfileResponse) => void;
  onVerificationComplete?: (result: VerificationResult) => void;
  onLivenessComplete?: (result: VerificationResult) => void;
  onUpgradeComplete?: (result: VerificationResult) => void;
  onError?: (error: AqoonsiError) => void;
}
