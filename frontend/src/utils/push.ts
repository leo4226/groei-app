/** Web-push subscribe/unsubscribe helpers (#139).
 *  Requires the push-only service worker in public/sw.js (registered in main.tsx,
 *  prod only — push is not testable against the dev server). */
import { notifications } from '../api/client'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Whether *this* device/browser currently holds a push subscription.
 *  Subscriptions are per-device, so the Settings toggle reflects this rather
 *  than the account-wide pref (which can be true on another device). */
export async function isPushSubscribedHere(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    return (await registration.pushManager.getSubscription()) != null
  } catch {
    return false
  }
}

export type PushAvailabilityState =
  | 'supported'
  | 'ios-not-standalone'
  | 'ios-standalone-unsupported'
  | 'unsupported'

export interface PushAvailability {
  state: PushAvailabilityState
  diagnostic: string
}

/** Returns structured info about why push is/isn't available on this device,
 *  so the Settings page can show a targeted message. */
export function pushAvailabilityInfo(): PushAvailability {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  if (isIos && !standalone) {
    return { state: 'ios-not-standalone', diagnostic: 'iOS=true standalone=false pushSupported=' + supported }
  }
  if (isIos && standalone && !supported) {
    return { state: 'ios-standalone-unsupported', diagnostic: 'iOS=true standalone=true pushSupported=false' }
  }
  if (!supported) {
    return { state: 'unsupported', diagnostic: 'iOS=' + isIos + ' standalone=' + standalone + ' pushSupported=false' }
  }
  return { state: 'supported', diagnostic: 'iOS=' + isIos + ' standalone=' + standalone + ' pushSupported=true' }
}

/** Ask permission, subscribe the browser, register the subscription server-side.
 *  Throws Error('permission-denied') when the user refuses. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission-denied')

  const { key } = await notifications.vapidKey()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  })
  const json = subscription.toJSON()
  await notifications.pushSubscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  })
}

/** Unsubscribe the browser and remove the subscription server-side. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await notifications.pushUnsubscribe(subscription.endpoint)
    await subscription.unsubscribe()
  }
}
