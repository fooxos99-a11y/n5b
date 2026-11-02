package sa.nukhab.app;

import com.getcapacitor.JSObject;
import com.huawei.hms.push.HmsMessageService;
import com.huawei.hms.push.RemoteMessage;

public class HuaweiMessageService extends HmsMessageService {
    @Override public void onNewToken(String token) {
        if (token != null && !token.isEmpty()) HuaweiPushNotificationsPlugin.emit("registration", new JSObject().put("value", token));
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        JSObject data = new JSObject();
        message.getDataOfMap().forEach(data::put);
        HuaweiPushNotificationsPlugin.emit("pushNotificationReceived", new JSObject().put("id", message.getMessageId()).put("data", data));
    }
}
