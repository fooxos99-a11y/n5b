import { useEffect } from 'react';
import NativeUpdateDialog from '@/components/native/NativeUpdateDialog';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { useLocation, useNavigate } from '@/lib/router';
import useNativeSystemBars from '@/hooks/useNativeSystemBars';

const NativeAppBridge = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useNativeSystemBars();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    SplashScreen.hide().catch(() => {});

    let backButtonListener;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!window.dispatchEvent(new Event('nukhab-student-back', { cancelable: true }))) return;
      if (canGoBack && location.pathname !== '/') {
        navigate(-1);
        return;
      }
      CapacitorApp.exitApp();
    }).then((listener) => {
      backButtonListener = listener;
    });

    return () => {
      backButtonListener?.remove();
    };
  }, [location.pathname, navigate]);

  return <NativeUpdateDialog />;
};

export default NativeAppBridge;
