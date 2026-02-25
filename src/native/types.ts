/**
 * @aqoonsi/sdk-react-native - FaceTec type definitions
 */

export interface FaceTecConfig {
  serverUrl: string
  apiKey?: string
  deviceKeyIdentifier: string
  faceScanEncryptionKey: string
  productionKeyText?: string
}

export enum FaceTecSessionStatus {
  SessionCompleted = 0,
  RequestAborted = 1,
  CameraPermissionDenied = 2,
  UserCancelledFaceScan = 3,
  UserCancelledIDScan = 4,
  ContextSwitch = 5,
  LandscapeNotAllowed = 6,
  ReversePortraitNotAllowed = 7,
  LockedOut = 8,
  CameraError = 9,
  UnknownInternalError = 10,
}

export interface FaceTecExitResult {
  status: FaceTecSessionStatus
  statusDescription: string
  sessionType: string
}

export interface FaceTecStatusEvent {
  error?: string
}

export type FaceTecEventType =
  | "onFaceTecExit"
  | "onFaceTecStatus"

export type FaceTecEventHandler<T> = (event: T) => void

export interface FaceTecEventSubscription {
  remove: () => void
}
