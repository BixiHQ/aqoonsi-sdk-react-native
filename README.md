# Aqoonsi KYC React Native SDK

Official React Native SDK for Aqoonsi KYC platform. Works with `@bixiltd/react-native-facetec`.

## Installation

```bash
npm install @aqoonsi/sdk-react-native
# or
yarn add @aqoonsi/sdk-react-native
```

## Prerequisites

- `@bixiltd/react-native-facetec` must be installed and configured

## Quick Start

```typescript
import AqoonsiSDK from '@aqoonsi/sdk-react-native';
import { sdk as FaceTec } from '@bixiltd/react-native-facetec';

const aqoonsi = new AqoonsiSDK({
  apiKey: 'your-api-key',
  apiUrl: 'https://api.aqoonsi.com',
  deviceKeyIdentifier: 'your-device-key',
  faceScanEncryptionKey: 'your-encryption-key',
  productionKeyText: 'your-production-key',
});

// Initialize with FaceTec SDK
await aqoonsi.initialize(FaceTec, {
  onVerificationComplete: (result) => {
    console.log('Verified:', result.fullName);
  },
  onError: (error) => {
    console.error('Error:', error.message);
  },
});
```

## Somali National ID Verification (Hubiye)

```typescript
// 1. Start verification session
const verificationId = await aqoonsi.startVerification('SOMALI_NID', 'user-123');

// 2. Initiate OTP (user receives SMS)
const otpConsentId = await aqoonsi.initiateSomaliOTP('85912651729');

// 3. Verify OTP and get profile
const profile = await aqoonsi.verifySomaliOTP('85912651729', '123456');
console.log('Profile:', profile.seedingData?.full_name);

// 4. Start face scan with FaceTec
const sessionToken = await aqoonsi.getSessionToken();
FaceTec.startFaceScan(verificationId, sessionToken);

// 5. Handle face scan result (in FaceTec callback)
FaceTec.onFaceScanResult(async (event) => {
  const result = await aqoonsi.completeSomaliVerification({
    faceScan: event.faceScan,
    auditTrailImage: event.auditTrailImage,
    lowQualityAuditTrailImage: event.lowQualityAuditTrailImage,
    sessionId: sessionToken,
  });

  if (result.success) {
    console.log('Verified!', result.fullName);
  }
});
```

## International Document Verification

```typescript
// 1. Start verification session
const verificationId = await aqoonsi.startVerification('INTERNATIONAL_DOC', 'user-123');

// 2. Start ID scan with FaceTec
const sessionToken = await aqoonsi.getSessionToken();
FaceTec.startIDScan(verificationId, sessionToken);

// 3. Handle ID scan result (in FaceTec callback)
FaceTec.onIDScanResult(async (event) => {
  const result = await aqoonsi.completeInternationalVerification({
    faceScan: event.faceScan,
    auditTrailImage: event.auditTrailImage,
    lowQualityAuditTrailImage: event.lowQualityAuditTrailImage,
    sessionId: sessionToken,
    idScanFrontImage: event.idScanFrontImage,
    idScanBackImage: event.idScanBackImage,
  });

  if (result.success) {
    console.log('Verified!', result.fullName);
    console.log('Document:', result.documentType, result.documentCountry);
  }
});
```

## Integration with Existing edir App

The edir app has been pre-configured with Aqoonsi SDK. To use:

### 1. Install dependencies

The SDK is already added as a local dependency in `package.json`:
```json
"@aqoonsi/sdk-react-native": "file:../../aqoonsi/aqoonsi-sdk-react-native"
```

Run `npm install` or `yarn` to link it.

### 2. Use SomaliKycScreen

A ready-to-use `SomaliKycScreen` is available at `/app/screens/SomaliKycScreen.tsx`. It handles:
- SDK initialization with existing FaceTec credentials
- OTP flow for Somali National ID verification
- Profile display after OTP verification
- Face scan for identity matching

Navigate to it from anywhere:
```typescript
navigation.navigate('SomaliKyc', { screen: 'Settings' });
```

### 3. Configure API URL

Update the `AQOONSI_API_URL` in `SomaliKycScreen.tsx`:
```typescript
// Development
const AQOONSI_API_URL = "http://localhost:3000";

// Production
const AQOONSI_API_URL = "https://api.aqoonsi.com";
```

### 4. Custom Integration (Optional)

For custom flows:

```typescript
import AqoonsiSDK from '@aqoonsi/sdk-react-native';
import { sdk as FaceTec } from '@bixiltd/react-native-facetec';

const aqoonsi = new AqoonsiSDK({
  apiKey: Config.AQOONSI_API_KEY,
  apiUrl: Config.AQOONSI_API_URL,
});

const initializeSDK = async () => {
  const creds = await fetchFacetecCreds();

  await aqoonsi.initialize(FaceTec, {
    onVerificationComplete: async (result) => {
      if (result.success) {
        await getProfile();
        Alert.alert('Verified', 'Your identity has been verified.');
      }
    },
  });

  // Choose verification type based on user
  if (isSomaliUser) {
    await aqoonsi.startVerification('SOMALI_NID', me?.uid);
  } else {
    await aqoonsi.startVerification('INTERNATIONAL_DOC', me?.uid);
  }
};
```

## API Reference

### `AqoonsiSDK`

| Method | Description |
|--------|-------------|
| `initialize(faceTec, callbacks?)` | Initialize SDK with FaceTec |
| `startVerification(type, externalUserId?)` | Start a new verification session |
| `getSessionToken()` | Get FaceTec session token |
| `initiateSomaliOTP(idNumber)` | Send OTP for Somali ID verification |
| `verifySomaliOTP(idNumber, otpCode)` | Verify OTP and get profile |
| `completeSomaliVerification(faceScanResult)` | Complete Somali verification |
| `completeInternationalVerification(idScanResult)` | Complete international verification |
| `getVerificationId()` | Get current verification ID |
| `getHubiyePhoto()` | Get Hubiye photo (after OTP verified) |
| `cancelVerification()` | Cancel current session |

### Types

```typescript
type VerificationType = 'SOMALI_NID' | 'INTERNATIONAL_DOC';
type VerificationStatus = 'PENDING' | 'OTP_SENT' | 'PROCESSING' | 'VERIFIED' | 'FAILED';

interface VerificationResult {
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
}
```

## License

MIT
