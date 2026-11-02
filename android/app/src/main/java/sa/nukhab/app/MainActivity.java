package sa.nukhab.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSystemBarBackgroundPlugin.class);
        NativePushRegistrar.register(this);
        super.onCreate(savedInstanceState);
    }
}
