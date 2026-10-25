package ca.leradar.app.radio;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Thin bridge: JS radio bar ↔ {@link RadioPlaybackService} (Media3 ExoPlayer).
 * Registered from {@link ca.leradar.app.MainActivity}; no npm package needed.
 */
@CapacitorPlugin(
  name = "RadioPlayback",
  permissions = {
    @Permission(
      alias = "notifications",
      strings = { Manifest.permission.POST_NOTIFICATIONS }
    )
  }
)
public class RadioPlaybackPlugin extends Plugin {

  private static volatile RadioPlaybackPlugin instance;

  static void dispatchState(Bundle extras) {
    RadioPlaybackPlugin plugin = instance;
    if (plugin == null || extras == null) return;
    JSObject data = new JSObject();
    data.put("status", extras.getString("status", "idle"));
    data.put("stationId", extras.getString("stationId", ""));
    data.put("title", extras.getString("title", ""));
    data.put("artist", extras.getString("artist", ""));
    plugin.notifyListeners("state", data);
  }

  @Override
  public void load() {
    instance = this;
  }

  @Override
  protected void handleOnDestroy() {
    if (instance == this) instance = null;
    super.handleOnDestroy();
  }

  @PluginMethod
  public void play(PluginCall call) {
    String url = call.getString("url", "");
    if (url == null || url.isEmpty()) {
      call.reject("url required");
      return;
    }
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notificationPermsCallback");
      return;
    }
    startPlay(call);
  }

  @PermissionCallback
  private void notificationPermsCallback(PluginCall call) {
    // Playback still starts if the user denies notifications: the
    // foreground service can run; the shade entry may be limited.
    startPlay(call);
  }

  private void startPlay(PluginCall call) {
    Intent intent = new Intent(getContext(), RadioPlaybackService.class);
    intent.setAction(RadioPlaybackService.ACTION_PLAY);
    intent.putExtra(RadioPlaybackService.EXTRA_URL, call.getString("url", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_TITLE, call.getString("title", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_ARTIST, call.getString("artist", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_STATION_ID, call.getString("stationId", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_NOW, call.getString("now", ""));
    ContextCompat.startForegroundService(getContext(), intent);
    JSObject ok = new JSObject();
    ok.put("ok", true);
    call.resolve(ok);
  }

  @PluginMethod
  public void pause(PluginCall call) {
    Intent intent = new Intent(getContext(), RadioPlaybackService.class);
    intent.setAction(RadioPlaybackService.ACTION_PAUSE);
    startIfRunning(intent);
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    Intent intent = new Intent(getContext(), RadioPlaybackService.class);
    intent.setAction(RadioPlaybackService.ACTION_STOP);
    startIfRunning(intent);
    call.resolve();
  }

  @PluginMethod
  public void updateMetadata(PluginCall call) {
    Intent intent = new Intent(getContext(), RadioPlaybackService.class);
    intent.setAction(RadioPlaybackService.ACTION_UPDATE_META);
    intent.putExtra(RadioPlaybackService.EXTRA_TITLE, call.getString("title", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_ARTIST, call.getString("artist", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_STATION_ID, call.getString("stationId", ""));
    intent.putExtra(RadioPlaybackService.EXTRA_NOW, call.getString("now", ""));
    startIfRunning(intent);
    call.resolve();
  }

  /**
   * Liste des stations pour la voiture (suivante/précédente, Android Auto).
   * Gardée dans les préférences : Android Auto la lit même app fermée.
   */
  @PluginMethod
  public void setStations(PluginCall call) {
    com.getcapacitor.JSArray list = call.getArray("stations");
    com.getcapacitor.JSArray favs = call.getArray("favorites");
    String json = list == null ? "[]" : list.toString();
    String favJson = favs == null ? "[]" : favs.toString();
    getContext().getSharedPreferences(RadioPlaybackService.PREFS, android.content.Context.MODE_PRIVATE)
      .edit()
      .putString(RadioPlaybackService.PREF_STATIONS, json)
      .putString(RadioPlaybackService.PREF_FAVORITES, favJson)
      .apply();
    Intent intent = new Intent(getContext(), RadioPlaybackService.class);
    intent.setAction(RadioPlaybackService.ACTION_SET_STATIONS);
    intent.putExtra(RadioPlaybackService.EXTRA_STATIONS, json);
    intent.putExtra(RadioPlaybackService.EXTRA_FAVORITES, favJson);
    startIfRunning(intent);
    call.resolve();
  }

  /** Ne réveille pas le service (ni de notification) s'il ne joue rien. */
  private void startIfRunning(Intent intent) {
    if (!RadioPlaybackService.isRunning()) return;
    try { getContext().startService(intent); } catch (IllegalStateException ignored) { /* app en arrière-plan */ }
  }

  @PluginMethod
  public void getState(PluginCall call) {
    // State is pushed via the "state" listener; this is a thin stub for
    // callers that prefer a one-shot read after reconnect.
    JSObject data = new JSObject();
    data.put("status", "unknown");
    call.resolve(data);
  }
}
