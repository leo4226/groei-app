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

/** iOS Safari only allows push for home-screen-installed PWAs (iOS 16.4+). */
export function iosNeedsInstall(): boolean {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return isIos && !standalone
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
