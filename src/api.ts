// Aqoonsi API Client for React Native

import type {
  SessionResponse,
  OTPResponse,
  ProfileResponse,
  VerificationResult,
  VerificationStatusResponse,
  VerificationType,
  UpgradeSessionResponse,
} from './types';

export class AqoonsiAPI {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    console.log(`[AqoonsiAPI] ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      console.log(`[AqoonsiAPI] Response status: ${response.status}`);

      const contentType = response.headers.get('content-type') || '';
      let data: any;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { error: text || `HTTP ${response.status}` };
      }
      console.log(`[AqoonsiAPI] Response data:`, JSON.stringify(data).substring(0, 200));

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data as T;
    } catch (error) {
      console.error(`[AqoonsiAPI] Request failed:`, error);
      throw error;
    }
  }

  // --- Session Management ---

  async createSession(
    type: VerificationType,
    externalUserId?: string
  ): Promise<SessionResponse> {
    const body: Record<string, unknown> = { type };
    if (externalUserId) {
      body.externalUserId = externalUserId;
    }
    return this.request<SessionResponse>('POST', '/v1/kyc/session', body);
  }

  async getVerification(verificationId: string): Promise<VerificationResult> {
    return this.request<VerificationResult>(
      'GET',
      `/v1/kyc/verification/${verificationId}`
    );
  }

  async getVerificationStatus(externalUserId?: string): Promise<VerificationStatusResponse> {
    const query = externalUserId
      ? `?externalUserId=${encodeURIComponent(externalUserId)}`
      : '';
    return this.request<VerificationStatusResponse>(
      'GET',
      `/v1/kyc/verification/status${query}`
    );
  }

  // --- FaceTec ---

  async getSessionToken(): Promise<{ sessionToken: string; success: boolean }> {
    return this.request('GET', '/v1/kyc/session-token');
  }

  async getCredentials(): Promise<{
    success: boolean;
    deviceKeyIdentifier: string;
    publicFaceMapEncryptionKey: string;
    licenseText?: string;
  }> {
    return this.request('GET', '/v1/kyc/keys');
  }

  async checkStatus(): Promise<{
    running: boolean;
    success: boolean;
    serverInfo?: {
      coreServerSDKVersion: string;
      facetecServerWebserviceVersion: string;
    };
  }> {
    return this.request('GET', '/v1/kyc/status');
  }

  // --- Somali Path (Hubiye) ---

  async initiateSomaliOTP(
    verificationId: string,
    idNumber: string
  ): Promise<OTPResponse> {
    return this.request<OTPResponse>('POST', '/v1/kyc/somali/initiate', {
      verificationId,
      idNumber,
    });
  }

  async verifySomaliOTP(
    verificationId: string,
    idNumber: string,
    otpConsentId: string,
    otpCode: string
  ): Promise<ProfileResponse> {
    return this.request<ProfileResponse>('POST', '/v1/kyc/somali/verify-otp', {
      verificationId,
      idNumber,
      otpConsentId,
      otpCode,
    });
  }

  // --- Upgrade Path (Progressive KYC) ---

  async startUpgradeSession(
    parentVerificationId: string,
    upgradeType: string,
    externalUserId?: string
  ): Promise<UpgradeSessionResponse> {
    const body: Record<string, unknown> = { parentVerificationId, upgradeType };
    if (externalUserId) {
      body.externalUserId = externalUserId;
    }
    return this.request<UpgradeSessionResponse>('POST', '/v1/kyc/upgrade', body);
  }

  async completeUpgradeSomali(
    verificationId: string,
    hubiyePhoto: string
  ): Promise<VerificationResult> {
    return this.request<VerificationResult>('POST', '/v1/kyc/upgrade/somali/match', {
      verificationId,
      hubiyePhoto,
    });
  }

  async completeUpgradeInternational(
    verificationId: string,
    idScanFrontImage: string,
    idScanBackImage?: string
  ): Promise<VerificationResult> {
    return this.request<VerificationResult>('POST', '/v1/kyc/upgrade/international/verify', {
      verificationId,
      idScanFrontImage,
      idScanBackImage,
    });
  }
}
