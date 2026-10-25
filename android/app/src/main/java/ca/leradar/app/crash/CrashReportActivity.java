package ca.leradar.app.crash;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Page « Rapport de plantage » : trace locale, Copier / Partager / Fermer. Sans dépendance AppCompat. */
public class CrashReportActivity extends Activity {
  /** Lit puis efface le rapport en attente ; null s'il n'y en a pas. */
  public static String takePending(android.content.Context c) {
    File f = CrashLogger.reportFile(c);
    if (!f.exists()) return null;
    try {
      String s = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
      return s;
    } catch (Throwable t) { return null; } finally { f.delete(); }
  }

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    String trace = getIntent().getStringExtra("trace");
    if (trace == null) trace = "(rapport vide)";
    final String report = trace;
    int pad = (int) (16 * getResources().getDisplayMetrics().density);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(pad, pad * 2, pad, pad);
    root.setBackgroundColor(Color.rgb(20, 22, 28));
    TextView title = new TextView(this);
    title.setText("Rapport de plantage");
    title.setTextSize(22); title.setTypeface(Typeface.DEFAULT_BOLD); title.setTextColor(Color.WHITE);
    TextView hint = new TextView(this);
    hint.setText("Le Radar a planté au dernier lancement. Ce rapport reste sur le téléphone : copiez-le ou partagez-le si vous voulez l'envoyer.");
    hint.setTextColor(Color.rgb(200, 203, 212)); hint.setPadding(0, pad / 2, 0, pad / 2);
    TextView body = new TextView(this);
    body.setText(report); body.setTextIsSelectable(true); body.setTypeface(Typeface.MONOSPACE);
    body.setTextSize(11); body.setTextColor(Color.rgb(235, 235, 235));
    ScrollView scroll = new ScrollView(this);
    scroll.addView(body);
    LinearLayout.LayoutParams fill = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
    LinearLayout row = new LinearLayout(this);
    Button copy = new Button(this); copy.setText("Copier");
    Button share = new Button(this); share.setText("Partager");
    Button close = new Button(this); close.setText("Fermer");
    copy.setOnClickListener(v -> {
      ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
      if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Rapport de plantage Le Radar", report));
      Toast.makeText(this, "Rapport copié", Toast.LENGTH_SHORT).show();
    });
    share.setOnClickListener(v -> {
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType("text/plain");
      send.putExtra(Intent.EXTRA_SUBJECT, "Rapport de plantage Le Radar");
      send.putExtra(Intent.EXTRA_TEXT, report);
      startActivity(Intent.createChooser(send, "Partager le rapport"));
    });
    close.setOnClickListener(v -> finish());
    row.addView(copy); row.addView(share); row.addView(close);
    root.addView(title); root.addView(hint); root.addView(scroll, fill); root.addView(row);
    setContentView(root);
  }
}
