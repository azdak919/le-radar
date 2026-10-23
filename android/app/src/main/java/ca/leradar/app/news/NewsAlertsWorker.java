package ca.leradar.app.news;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.TimeUnit;

import ca.leradar.app.MainActivity;
import ca.leradar.app.R;

/**
 * Sondage périodique de https://le-radar.ca/news.json (aucun serveur, aucun
 * service Google). Requête conditionnelle (ETag) : un 304 ne coûte presque rien.
 */
public class NewsAlertsWorker extends Worker {
    public static final String FEED_URL = "https://le-radar.ca/news.json";
    public static final String EXTRA_LINK = "ca.leradar.app.NEWS_LINK";
    static final String PERIODIC = "news-alerts";
    static final String ONCE = "news-alerts-prime";
    static final String GROUP = "ca.leradar.app.NEWS";
    static final int SUMMARY_ID = 7100;

    public NewsAlertsWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void apply(Context context) {
        NewsAlertsSettings s = new NewsAlertsSettings(context);
        WorkManager wm = WorkManager.getInstance(context);
        if (!s.enabled()) {
            wm.cancelUniqueWork(PERIODIC);
            return;
        }
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(NewsAlertsWorker.class, s.intervalHours(), TimeUnit.HOURS)
            .setConstraints(c).build();
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req);
        if (!s.primed()) {
            wm.enqueueUniqueWork(ONCE, ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(NewsAlertsWorker.class).setConstraints(c).build());
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        NewsAlertsSettings s = new NewsAlertsSettings(ctx);
        if (!s.enabled()) return Result.success();
        // Heures de silence : on ne marque rien comme vu, la nouveauté sortira à 7 h.
        if (s.primed() && s.quiet() && NewsAlertsDetector.inQuietHours(Calendar.getInstance(), s.quietStart(), s.quietEnd())) {
            return Result.success();
        }
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(FEED_URL).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("User-Agent", "LE-RADAR-App notifications");
            if (s.primed() && !s.etag().isEmpty()) conn.setRequestProperty("If-None-Match", s.etag());
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) return Result.success();
            if (code != HttpURLConnection.HTTP_OK) return Result.retry();
            String body = read(conn.getInputStream());
            List<NewsAlertsDetector.Item> items = NewsFeedParser.parse(body);
            NewsAlertsDetector.Result r = NewsAlertsDetector.detect(items, s.seen(), s.primed(),
                s.types(), s.regions(), System.currentTimeMillis());
            if (!r.fresh.isEmpty()) post(ctx, r.fresh);
            s.saveSeen(r.seen, conn.getHeaderField("ETag"));
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static String read(InputStream in) throws java.io.IOException {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    static String channelFor(String type) {
        return "cegep".equals(type) ? "news-cegep" : "news-universite";
    }

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("news-universite", "Nouveaux articles · universités", NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(new NotificationChannel("news-cegep", "Nouveaux articles · cégeps", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static PendingIntent open(Context ctx, String link, int req) {
        Intent i = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (link != null) i.putExtra(EXTRA_LINK, link);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void post(Context ctx, List<NewsAlertsDetector.Item> fresh) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureChannels(ctx);
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        int shown = Math.min(fresh.size(), 5);
        for (int i = 0; i < shown; i++) {
            NewsAlertsDetector.Item it = fresh.get(i);
            int id = NewsAlertsDetector.canonical(it.link).hashCode();
            nm.notify(id, new NotificationCompat.Builder(ctx, channelFor(it.type))
                .setSmallIcon(R.drawable.ic_radio_notification)
                .setContentTitle(it.source.isEmpty() ? "LE-RADAR" : it.source)
                .setContentText(it.title)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(it.title))
                .setGroup(GROUP).setAutoCancel(true).setWhen(it.dateMs > 0 ? it.dateMs : System.currentTimeMillis())
                .setContentIntent(open(ctx, it.link, id)).build());
        }
        if (fresh.size() > 1) {
            NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle();
            for (int i = 0; i < shown; i++) inbox.addLine(fresh.get(i).title);
            String title = fresh.size() + " nouveaux articles";
            inbox.setBigContentTitle(title);
            nm.notify(SUMMARY_ID, new NotificationCompat.Builder(ctx, channelFor(fresh.get(0).type))
                .setSmallIcon(R.drawable.ic_radio_notification).setContentTitle(title)
                .setContentText("LE-RADAR").setStyle(inbox).setGroup(GROUP).setGroupSummary(true)
                .setAutoCancel(true).setContentIntent(open(ctx, null, SUMMARY_ID)).build());
        }
    }
}
