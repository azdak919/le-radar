package ca.leradar.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import ca.leradar.app.crash.CrashLogger;
import ca.leradar.app.crash.CrashReportActivity;
import ca.leradar.app.news.NewsAlertsPlugin;
import ca.leradar.app.radio.RadioPlaybackPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    CrashLogger.install(this);
    String pending = CrashReportActivity.takePending(this);
    registerPlugin(RadioPlaybackPlugin.class);
    registerPlugin(NewsAlertsPlugin.class);
    NewsAlertsPlugin.handleIntent(getIntent());
    super.onCreate(savedInstanceState);
    if (pending != null) {
      startActivity(new Intent(this, CrashReportActivity.class).putExtra("trace", pending));
    }
  }
}
