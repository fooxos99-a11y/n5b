package sa.nukhab.app;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeSystemBarBackground")
public class NativeSystemBarBackgroundPlugin extends Plugin {
    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        String color = call.getString("color");
        if (color == null || !color.matches("#[0-9a-fA-F]{6}")) {
            call.reject("Expected a six-digit background color.");
            return;
        }
        int backgroundColor = Color.parseColor(color);
        getBridge().executeOnMainThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(backgroundColor);
            if (getBridge().getWebView().getParent() instanceof View) {
                ((View) getBridge().getWebView().getParent()).setBackgroundColor(backgroundColor);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setNavigationBarContrastEnforced(false);
                window.setStatusBarContrastEnforced(false);
            }
            // Android 15+ paints transparent bars from the WebView safe areas.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                window.setStatusBarColor(backgroundColor);
                window.setNavigationBarColor(backgroundColor);
            }
            call.resolve();
        });
    }
}
