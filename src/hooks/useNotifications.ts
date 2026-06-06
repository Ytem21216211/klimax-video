import { useEffect, useState, useCallback } from 'react';

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, []);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!('Notification' in window)) {
      return null;
    }

    if (Notification.permission === 'granted') {
      // Only send if page is not visible
      if (document.visibilityState !== 'visible') {
        const notification = new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        return notification;
      }
    }
    return null;
  }, []);

  return {
    permission,
    requestPermission,
    sendNotification,
    isSupported: typeof window !== 'undefined' && 'Notification' in window,
  };
};
