import { Capacitor, registerPlugin } from '@capacitor/core';
import { studentsApi } from '@/services/studentsApi';
import { requestNativeNotificationPermission } from '@/lib/nativeNotificationPermission';
import { notificationRoles } from '../../shared/notification-roles.js';

let device = null;
const isHuawei = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('HuaweiPushNotifications');
const pushPlatform = () => isHuawei() ? 'huawei' : Capacitor.getPlatform();
const pushPlugin = async () => isHuawei() ? registerPlugin('HuaweiPushNotifications') : (await import('@capacitor/push-notifications')).PushNotifications;
export const isNativeNotificationsAvailable = () => Capacitor.isNativePlatform() && notificationRoles.includes(localStorage.getItem('wajeh_role'));

export async function listenForDeviceNotifications({ onNotification, onOpen, onError }) {
  if (!isNativeNotificationsAvailable()) return () => {};
  const PushNotifications = await pushPlugin();
  const handles = [];
  try {
    const listeners = [['registration', ({ value }) => {
      device = { platform: pushPlatform(), token: value };
      void studentsApi.registerNotificationDevice(device).catch(() => onError('تعذر تسجيل الجهاز للإشعارات.'));
    }],
    ['registrationError', () => onError('تعذر تفعيل إشعارات الجهاز.')],
    ['pushNotificationReceived', onNotification],
    ['pushNotificationActionPerformed', onOpen]];
    for (const [event, listener] of listeners) {
      handles.push(await PushNotifications.addListener(event, listener));
    }
    const permission = await requestNativeNotificationPermission(PushNotifications);
    const status = await studentsApi.getPushStatus();
    if (status[pushPlatform()] && permission.receive === 'granted') await PushNotifications.register();
    return () => { for (const handle of handles) void handle.remove(); };
  } catch (error) {
    await Promise.all(handles.map((handle) => handle.remove()));
    throw error;
  }
}

export async function enableDeviceNotifications() {
  const PushNotifications = await pushPlugin();
  const permission = await requestNativeNotificationPermission(PushNotifications);
  if (permission.receive !== 'granted') throw new Error('اسمح بالإشعارات من إعدادات الجهاز.');
  const status = await studentsApi.getPushStatus();
  if (!status[pushPlatform()]) throw new Error('خدمة إشعارات الجهاز لم تُفعّل بعد.');
  await PushNotifications.register();
}

export async function unregisterDeviceNotifications({ unregisterDevice = studentsApi.unregisterNotificationDevice } = {}) {
  if (!Capacitor.isNativePlatform()) return;
  const PushNotifications = await pushPlugin();
  try { if (device) await unregisterDevice(device); }
  finally { device = null; await PushNotifications.unregister(); }
}
