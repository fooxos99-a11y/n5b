package sa.nukhab.app;

import com.getcapacitor.BridgeActivity;

final class NativePushRegistrar {
    static void register(BridgeActivity activity) {
        activity.registerPlugin(HuaweiPushNotificationsPlugin.class);
    }
}
