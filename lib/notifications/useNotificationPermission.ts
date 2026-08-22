'use client'

// Mirrors components/ui/ThemeToggle.tsx's useSyncExternalStore pattern -
// Notification.permission is a browser-only value that can differ between
// the server render (always "unsupported") and the client, and this is the
// React-sanctioned way to reconcile that without a hydration mismatch or a
// setState-in-effect (the Notification API has no native "permission
// changed" event, same reason ThemeToggle needs its own CustomEvent for
// theme changes - requestPermission() callers dispatch this one themselves).

import { useSyncExternalStore } from 'react'

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

const PERMISSION_CHANGE_EVENT = 'gym-meals-notification-permission-change'

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(PERMISSION_CHANGE_EVENT, callback)
  return () => window.removeEventListener(PERMISSION_CHANGE_EVENT, callback)
}

function getSnapshot(): NotificationPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

function getServerSnapshot(): NotificationPermissionState {
  return 'unsupported'
}

export function useNotificationPermission(): NotificationPermissionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Call after Notification.requestPermission() resolves so every mounted
// useNotificationPermission() re-reads the fresh value.
export function notifyPermissionChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PERMISSION_CHANGE_EVENT))
}
