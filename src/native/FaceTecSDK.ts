/**
 * @aqoonsi/sdk-react-native - FaceTec SDK wrapper
 * FaceTec SDK v10 wrapper using AqoonsiFaceTecModule native module.
 *
 * v10 uses encrypted request/response blobs:
 * 1. SDK sends `onSessionRequest` with encrypted `requestBlob`
 * 2. Native module sends `requestBlob` to Aqoonsi backend
 * 3. Backend proxies to FaceTec Server and gets `responseBlob`
 * 4. Native module calls `processResponse(responseBlob)` to continue
 * 5. SDK sends `onFaceTecExit` when session completes
 */

import { NativeModules, NativeEventEmitter } from "react-native"
import type {
  FaceTecConfig,
  FaceTecExitResult,
  FaceTecStatusEvent,
  FaceTecEventType,
  FaceTecEventHandler,
  FaceTecEventSubscription,
} from "./types"

const { AqoonsiFaceTecModule } = NativeModules

if (!AqoonsiFaceTecModule) {
  throw new Error(
    "AqoonsiFaceTecModule is not linked. Please ensure the native module is properly installed."
  )
}

const eventEmitter = new NativeEventEmitter(AqoonsiFaceTecModule)

export interface FaceTecExitEvent {
  sessionType: string
  status: number
  statusDescription: string
  success: boolean
}

export class FaceTecSDK {
  private static instance: FaceTecSDK | null = null
  private isInitialized = false
  private config: FaceTecConfig | null = null

  private constructor() {}

  static getInstance(): FaceTecSDK {
    if (!FaceTecSDK.instance) {
      FaceTecSDK.instance = new FaceTecSDK()
    }
    return FaceTecSDK.instance
  }

  // ================== Initialization ==================

  setServerUrl(url: string): void {
    AqoonsiFaceTecModule.setServerUrl(url)
  }

  setApiKey(apiKey: string): void {
    AqoonsiFaceTecModule.setApiKey(apiKey)
  }

  configureServer(url: string, apiKey: string): void {
    AqoonsiFaceTecModule.configureServer(url, apiKey)
  }

  /**
   * Set session config override for the next session request.
   * Use this to route FaceTec blob requests to a different endpoint
   * with additional body fields (e.g., Somali verification with hubiyePhoto).
   * Config is auto-cleared after the next session request completes.
   */
  setSessionConfig(endpoint: string, extraBody: Record<string, unknown>): void {
    AqoonsiFaceTecModule.setSessionConfig(endpoint, JSON.stringify(extraBody))
  }

  clearSessionConfig(): void {
    AqoonsiFaceTecModule.clearSessionConfig()
  }

  async initialize(config: FaceTecConfig): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      this.config = config

      if (config.serverUrl) {
        if (config.apiKey) {
          AqoonsiFaceTecModule.configureServer(config.serverUrl, config.apiKey)
        } else {
          AqoonsiFaceTecModule.setServerUrl(config.serverUrl)
        }
      }

      const callback = (success: boolean, message: string) => {
        this.isInitialized = success
        resolve({ success, message })
      }

      if (config.productionKeyText) {
        AqoonsiFaceTecModule.initializeInProductionMode(
          config.productionKeyText,
          config.deviceKeyIdentifier,
          config.faceScanEncryptionKey,
          callback
        )
      } else {
        AqoonsiFaceTecModule.initializeInDevelopmentMode(
          config.deviceKeyIdentifier,
          config.faceScanEncryptionKey,
          callback
        )
      }
    })
  }

  getIsInitialized(): boolean {
    return this.isInitialized
  }

  // ================== Face Verification Sessions ==================

  startFaceScan(enrollmentId: string, sessionToken: string = ""): void {
    this.checkInitialized()
    AqoonsiFaceTecModule.startFaceScan(enrollmentId, sessionToken)
  }

  startEnrollment(enrollmentId: string, sessionToken: string = ""): void {
    this.checkInitialized()
    AqoonsiFaceTecModule.startEnrollment(enrollmentId, sessionToken)
  }

  // ================== Document Verification Sessions ==================

  startIDScan(enrollmentId: string, sessionToken: string = ""): void {
    this.checkInitialized()
    AqoonsiFaceTecModule.startIDScan(enrollmentId, sessionToken)
  }

  startPhotoIDMatch(enrollmentId: string, sessionToken: string = ""): void {
    this.checkInitialized()
    AqoonsiFaceTecModule.startPhotoIDMatch(enrollmentId, sessionToken)
  }

  startOfficialIDCapture(enrollmentId: string, sessionToken: string = ""): void {
    this.checkInitialized()
    AqoonsiFaceTecModule.startOfficialIDCapture(enrollmentId, sessionToken)
  }

  // ================== Response Handling (v10) ==================

  proceedToNextStep(responseBlob: string): void {
    AqoonsiFaceTecModule.proceedToNextStep(responseBlob)
  }

  updateUploadProgress(progress: number): void {
    AqoonsiFaceTecModule.updateUploadProgress(progress)
  }

  abortSession(): void {
    AqoonsiFaceTecModule.abortSession()
  }

  cancel(): void {
    AqoonsiFaceTecModule.cancel()
  }

  onComplete(): void {
    AqoonsiFaceTecModule.onFaceTecSDKCompletelyDone()
  }

  // ================== UI Customization ==================

  setBrandingColors(primaryColor: string, textColor: string, successColor: string): void {
    AqoonsiFaceTecModule.setBrandingColors(primaryColor, textColor, successColor)
  }

  // ================== Utility Methods ==================

  async getSDKVersion(): Promise<string> {
    return AqoonsiFaceTecModule.getSDKVersion()
  }

  async getUserAgentString(): Promise<string> {
    return AqoonsiFaceTecModule.getUserAgentString()
  }

  // ================== Event Handling (v10) ==================

  onFaceTecExit(handler: FaceTecEventHandler<FaceTecExitEvent>): FaceTecEventSubscription {
    const subscription = eventEmitter.addListener("onFaceTecExit", handler)
    return { remove: () => subscription.remove() }
  }

  onFaceTecStatus(handler: FaceTecEventHandler<FaceTecStatusEvent>): FaceTecEventSubscription {
    const subscription = eventEmitter.addListener("onFaceTecStatus", handler)
    return { remove: () => subscription.remove() }
  }

  addListener<T>(event: FaceTecEventType, handler: FaceTecEventHandler<T>): FaceTecEventSubscription {
    const subscription = eventEmitter.addListener(event, handler)
    return { remove: () => subscription.remove() }
  }

  // ================== Private Methods ==================

  private checkInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("FaceTec SDK is not initialized. Call initialize() first.")
    }
  }
}

export const sdk = FaceTecSDK.getInstance()
