package ca.leradar.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import ca.leradar.app.news.NewsAlertsPlugin;
import ca.leradar.app.radio.RadioPlaybackPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(RadioPlaybackPlugin.class);
    registerPlugin(NewsAlertsPlugin.class);
    NewsAlertsPlugin.handleIntent(getIntent());
    super.onCreate(savedInstanceState);
  }
}
