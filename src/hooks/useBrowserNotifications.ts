import { useCallback, useEffect, useState } from 'react';

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      console.warn('Notifications not supported in this browser');
      return 'denied';
    }

    // Check if we are in an iframe
    const isInIframe = window.self !== window.top;
    if (isInIframe && Notification.permission === 'default') {
      console.warn('Notification permission requests may be blocked in an iframe. Try opening the app in a new tab.');
    }

    try {
      // Modern browsers return a promise
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (err) {
      // Fallback for older browsers that use a callback
      return new Promise<NotificationPermission>((resolve) => {
        try {
          Notification.requestPermission((result) => {
            setPermission(result);
            resolve(result);
          });
        } catch (innerErr) {
          console.error('Notification permission request failed:', innerErr);
          resolve('denied');
        }
      });
    }
  }, []);

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof Notification === 'undefined') return;
    
    // If permission is default, we can't show it yet
    if (Notification.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    try {
      const notification = new Notification(title, {
        icon: 'https://cdn-icons-png.flaticon.com/512/3119/3119338.png', // Generic notification icon
        badge: 'https://cdn-icons-png.flaticon.com/512/3119/3119338.png',
        silent: true, // We handle sound separately via useNotificationSound
        ...options,
      });

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }

      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        notification.close();
      };
      
      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (err) {
      console.error('Error showing notification:', err);
    }
  }, []);

  return { permission, requestPermission, showNotification };
}
