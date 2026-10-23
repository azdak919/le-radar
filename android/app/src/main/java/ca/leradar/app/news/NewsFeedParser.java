package ca.leradar.app.news;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Lit les items de news.json (champs title, link, source, type, region, date). */
public final class NewsFeedParser {
    private NewsFeedParser() {}

    public static List<NewsAlertsDetector.Item> parse(String body) throws JSONException {
        JSONObject root = new JSONObject(body);
        JSONArray arr = root.optJSONArray("items");
        List<NewsAlertsDetector.Item> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            out.add(new NewsAlertsDetector.Item(
                o.optString("title", ""), o.optString("link", ""), o.optString("source", ""),
                o.optString("type", ""), o.optString("region", ""), parseDate(o.optString("date", ""))));
        }
        return out;
    }

    static long parseDate(String iso) {
        if (iso == null || iso.length() < 19) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            return f.parse(iso.substring(0, 19)).getTime();
        } catch (ParseException e) {
            return 0;
        }
    }
}
