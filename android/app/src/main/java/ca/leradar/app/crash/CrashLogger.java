package ca.leradar.app.crash;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Enregistreur de plantage LOCAL : installé par un ContentProvider
 * (initOrder max), donc avant Application.onCreate et avant MainActivity.
 * Écrit la trace dans files/crash/last.txt puis laisse le gestionnaire
 * système terminer. Rien n'est envoyé à un serveur.
 */
public class CrashLogger extends ContentProvider {
  public static File reportFile(Context c) { return new File(new File(c.getFilesDir(), "crash"), "last.txt"); }

  public static void install(Context ctx) {
    final Context app = ctx.getApplicationContext() != null ? ctx.getApplicationContext() : ctx;
    final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
    if (previous instanceof Handler) return;
    Thread.setDefaultUncaughtExceptionHandler(new Handler(app, previous));
  }

  static final class Handler implements Thread.UncaughtExceptionHandler {
    private final Context app; private final Thread.UncaughtExceptionHandler previous;
    Handler(Context app, Thread.UncaughtExceptionHandler previous) { this.app = app; this.previous = previous; }
    @Override public void uncaughtException(Thread t, Throwable e) {
      try {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        String version = "?";
        try { version = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName; } catch (Throwable ignored) { }
        pw.println("Le Radar " + version + " (" + app.getPackageName() + ")");
        pw.println("Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") — " + Build.MANUFACTURER + " " + Build.MODEL);
        pw.println(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.CANADA_FRENCH).format(new Date()));
        pw.println("Fil : " + t.getName());
        pw.println();
        e.printStackTrace(pw);
        pw.flush();
        File f = reportFile(app);
        f.getParentFile().mkdirs();
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(sw.toString().getBytes(StandardCharsets.UTF_8)); }
      } catch (Throwable ignored) { }
      if (previous != null) previous.uncaughtException(t, e);
      else { android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10); }
    }
  }

  @Override public boolean onCreate() { if (getContext() != null) install(getContext()); return true; }
  @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
  @Override public String getType(Uri u) { return null; }
  @Override public Uri insert(Uri u, ContentValues v) { return null; }
  @Override public int delete(Uri u, String s, String[] a) { return 0; }
  @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
