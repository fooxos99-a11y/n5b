package sa.nukhab.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.huawei.agconnect.config.AGConnectServicesConfig;
import com.huawei.hms.aaid.HmsInstanceId;
import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "HuaweiPushNotifications", permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "receive"))
public class HuaweiPushNotificationsPlugin extends Plugin {
    private static WeakReference<HuaweiPushNotificationsPlugin> instance = new WeakReference<>(null);
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override public void load() {
        instance = new WeakReference<>(this);
        handleOnNewIntent(getActivity().getIntent());
    }

    @PluginMethod public void checkPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) call.resolve(new JSObject().put("receive", "granted"));
        else super.checkPermissions(call);
    }

    @PluginMethod public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("receive") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("receive", "granted"));
        } else requestPermissionForAlias("receive", call, "permissionResult");
    }

    @PermissionCallback private void permissionResult(PluginCall call) { checkPermissions(call); }

    private String appId() { return AGConnectServicesConfig.fromContext(getContext()).getString("client/app_id"); }

    @PluginMethod public void register(PluginCall call) {
        executor.execute(() -> {
            try {
                String token = HmsInstanceId.getInstance(getContext()).getToken(appId(), "HCM");
                if (token != null && !token.isEmpty()) emit("registration", new JSObject().put("value", token));
                call.resolve();
            } catch (Exception error) {
                emit("registrationError", new JSObject().put("error", "HMS_REGISTRATION_FAILED"));
                call.reject("Huawei push registration failed.", error);
            }
        });
    }

    @PluginMethod public void unregister(PluginCall call) {
        executor.execute(() -> {
            try {
                HmsInstanceId.getInstance(getContext()).deleteToken(appId(), "HCM");
                call.resolve();
            } catch (Exception error) { call.reject("Huawei push unregistration failed.", error); }
        });
    }

    static void emit(String event, JSObject data) {
        HuaweiPushNotificationsPlugin plugin = instance.get();
        if (plugin != null) plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners(event, data, true));
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !intent.hasExtra("nukhabNotificationId")) return;
        JSObject notification = new JSObject().put("data", new JSObject().put("notificationId", intent.getStringExtra("nukhabNotificationId")));
        notifyListeners("pushNotificationActionPerformed", new JSObject().put("actionId", "tap").put("notification", notification), true);
    }

    @Override protected void handleOnDestroy() {
        executor.shutdown();
        if (instance.get() == this) instance.clear();
        super.handleOnDestroy();
    }
}
