package ca.leradar.app.news;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Réglages et mémoire locale (SharedPreferences). Rien ne quitte l'appareil. */
public final class NewsAlertsSettings {
    static final String FILE = "news_alerts";
    private static final String SEP = "\u001f";
    final SharedPreferences prefs;

    public NewsAlertsSettings(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public boolean enabled() { return prefs.getBoolean("enabled", false); }
    public int intervalHours() { return NewsAlertsDetector.clampInterval(prefs.getInt("interval", 2)); }
    public boolean quiet() { return prefs.getBoolean("quiet", true); }
    public int quietStart() { return 22; }
    public int quietEnd() { return 7; }
    public List<String> types() { return list("types"); }
    public List<String> regions() { return list("regions"); }
    public List<String> seen() { return list("seen"); }
    public boolean primed() { return prefs.getBoolean("primed", false); }
    public String etag() { return prefs.getString("etag", ""); }

    List<String> list(String key) {
        String raw = prefs.getString(key, "");
        if (raw == null || raw.isEmpty()) return new ArrayList<>();
        return new ArrayList<>(Arrays.asList(raw.split(SEP)));
    }

    static String join(List<String> values) {
        StringBuilder b = new StringBuilder();
        for (String v : values) {
            if (v == null || v.isEmpty()) continue;
            if (b.length() > 0) b.append(SEP);
            b.append(v.replace(SEP, ""));
        }
        return b.toString();
    }

    public void save(boolean enabled, int interval, boolean quiet, List<String> types, List<String> regions) {
        SharedPreferences.Editor e = prefs.edit()
            .putBoolean("enabled", enabled)
            .putInt("interval", NewsAlertsDetector.clampInterval(interval))
            .putBoolean("quiet", quiet)
            .putString("types", join(types))
            .putString("regions", join(regions));
        // Réactivation : on remémorise le fil sans notifier.
        if (!enabled) e.putBoolean("primed", false).remove("etag");
        e.apply();
    }

    public void saveSeen(List<String> seen, String etag) {
        prefs.edit().putString("seen", join(seen)).putBoolean("primed", true)
            .putString("etag", etag == null ? "" : etag).apply();
    }
}
