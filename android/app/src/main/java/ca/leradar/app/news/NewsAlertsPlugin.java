package ca.leradar.app.news;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/** Pont JS ↔ notifications de nouveaux articles (sondage local, sans push). */
@CapacitorPlugin(name = "NewsAlerts", permissions = {
    @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
})
public class NewsAlertsPlugin extends Plugin {
    private static String pendingLink;

    public static void handleIntent(Intent intent) {
        if (intent == null) return;
        String link = intent.getStringExtra(NewsAlertsWorker.EXTRA_LINK);
        if (link != null && !link.isEmpty()) {
            pendingLink = link;
            intent.removeExtra(NewsAlertsWorker.EXTRA_LINK);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        handleIntent(intent);
        if (pendingLink != null) {
            JSObject o = new JSObject();
            o.put("link", pendingLink);
            notifyListeners("open", o);
        }
    }

    private JSObject state() {
        NewsAlertsSettings s = new NewsAlertsSettings(getContext());
        JSObject o = new JSObject();
        o.put("enabled", s.enabled());
        o.put("intervalHours", s.intervalHours());
        o.put("quiet", s.quiet());
        o.put("quietStart", s.quietStart());
        o.put("quietEnd", s.quietEnd());
        o.put("types", new JSArray(s.types()));
        o.put("regions", new JSArray(s.regions()));
        o.put("permission", granted() ? "granted" : "denied");
        return o;
    }

    private boolean granted() {
        return Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void getSettings(PluginCall call) { call.resolve(state()); }

    private static List<String> strings(JSArray arr) {
        List<String> out = new ArrayList<>();
        if (arr == null) return out;
        try {
            for (Object v : arr.toList()) if (v instanceof String) out.add((String) v);
        } catch (JSONException ignored) { /* liste vide */ }
        return out;
    }

    @PluginMethod
    public void setSettings(PluginCall call) {
        NewsAlertsSettings s = new NewsAlertsSettings(getContext());
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", s.enabled()));
        Integer interval = call.getInt("intervalHours", s.intervalHours());
        boolean quiet = Boolean.TRUE.equals(call.getBoolean("quiet", s.quiet()));
        List<String> types = call.getData().has("types") ? strings(call.getArray("types")) : s.types();
        List<String> regions = call.getData().has("regions") ? strings(call.getArray("regions")) : s.regions();
        s.save(enabled, interval == null ? 2 : interval, quiet, types, regions);
        NewsAlertsWorker.apply(getContext());
        call.resolve(state());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (granted()) { call.resolve(state()); return; }
        requestPermissionForAlias("notifications", call, "permissionDone");
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) { call.resolve(state()); }

    @PluginMethod
    public void consumeLaunchLink(PluginCall call) {
        JSObject o = new JSObject();
        o.put("link", pendingLink == null ? "" : pendingLink);
        pendingLink = null;
        call.resolve(o);
    }
}
