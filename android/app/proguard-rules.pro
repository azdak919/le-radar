# LE-RADAR — R8 / ProGuard (release minifyEnabled true)
#
# Capacitor already ships consumer ProGuard rules via capacitor-android
# (node_modules/@capacitor/android/capacitor/proguard-rules.pro). The keeps
# below mirror those and cover WebView / reflection used by the bridge so a
# local or F-Droid R8 pass cannot strip PluginMethod entry points.

-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes SourceFile,LineNumberTable

# Capacitor v3+ plugins
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.** { *; }

# Capacitor v2 legacy annotations (still referenced by some plugins)
-keep @com.getcapacitor.NativePlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Cordova plugin bridge (capacitor-cordova-android-plugins)
-keep public class * extends org.apache.cordova.* {
    public <methods>;
    public <fields>;
}

# WebView JS bridges (@JavascriptInterface) — keep public members
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# App entry (BridgeActivity subclass)
-keep class ca.leradar.app.MainActivity { *; }

# Local RadioPlayback Capacitor plugin + Media3 (release minifyEnabled true)
-keep class ca.leradar.app.radio.** { *; }
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**
