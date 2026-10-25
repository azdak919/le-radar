package ca.leradar.app.cast;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import androidx.mediarouter.app.MediaRouteControllerDialog;
import androidx.mediarouter.media.MediaRouteSelector;
import androidx.mediarouter.media.MediaRouter;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;

import ca.leradar.app.radio.RadioPlaybackService;

/**
 * Cast natif (saveur full) : sélecteur de routes androidx.mediarouter, session
 * Google Cast vers le Default Media Receiver, flux en direct de la station.
 * Au démarrage de la session, la lecture locale (RadioPlaybackService) est
 * mise en pause : jamais deux lectures à la fois.
 */
@CapacitorPlugin(name = "LeRadarCast")
public class CastPlugin extends Plugin {
  private CastContext cast;
  private String pendingUrl, pendingTitle, pendingArtist;

  private final SessionManagerListener<CastSession> listener = new SessionManagerListener<CastSession>() {
    @Override public void onSessionStarted(@NonNull CastSession s, @NonNull String id) { onConnected(s); }
    @Override public void onSessionResumed(@NonNull CastSession s, boolean b) { onConnected(s); }
    @Override public void onSessionEnded(@NonNull CastSession s, int e) { emit(false); }
    @Override public void onSessionStarting(@NonNull CastSession s) {}
    @Override public void onSessionStartFailed(@NonNull CastSession s, int e) { emit(false); }
    @Override public void onSessionEnding(@NonNull CastSession s) {}
    @Override public void onSessionResuming(@NonNull CastSession s, @NonNull String id) {}
    @Override public void onSessionResumeFailed(@NonNull CastSession s, int e) {}
    @Override public void onSessionSuspended(@NonNull CastSession s, int r) {}
  };

  @Override
  public void load() {
    try {
      cast = CastContext.getSharedInstance(getContext());
      cast.getSessionManager().addSessionManagerListener(listener, CastSession.class);
    } catch (RuntimeException e) {
      cast = null; // Pas de services Google Play : Cast indisponible.
    }
  }

  private CastSession session() {
    return cast == null ? null : cast.getSessionManager().getCurrentCastSession();
  }

  private void onConnected(CastSession s) {
    pauseLocal();
    if (pendingUrl != null) loadOn(s, pendingUrl, pendingTitle, pendingArtist);
    emit(true);
  }

  private void pauseLocal() {
    Intent intent = new Intent(getContext(), RadioPlaybackService.class);
    intent.setAction(RadioPlaybackService.ACTION_PAUSE);
    try { getContext().startService(intent); } catch (RuntimeException ignored) { }
  }

  private void emit(boolean connected) {
    JSObject d = new JSObject();
    d.put("connected", connected);
    CastSession s = session();
    if (s != null && s.getCastDevice() != null) d.put("device", s.getCastDevice().getFriendlyName());
    notifyListeners("cast", d);
  }

  private void loadOn(CastSession s, String url, String title, String artist) {
    RemoteMediaClient client = s.getRemoteMediaClient();
    if (client == null) return;
    MediaMetadata meta = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK);
    meta.putString(MediaMetadata.KEY_TITLE, title == null ? "" : title);
    meta.putString(MediaMetadata.KEY_ARTIST, artist == null || artist.isEmpty() ? "Le Radar" : artist);
    MediaInfo info = new MediaInfo.Builder(url)
        .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
        .setContentType(url.contains(".m3u8") ? "application/x-mpegurl" : "audio/mpeg")
        .setMetadata(meta)
        .build();
    client.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build());
    pendingUrl = null;
  }

  @PluginMethod
  public void isAvailable(PluginCall call) {
    JSObject r = new JSObject();
    r.put("available", cast != null);
    r.put("connected", session() != null && session().isConnected());
    call.resolve(r);
  }

  /** Bouton Cast : sélecteur natif (ou contrôleur si déjà connecté). */
  @PluginMethod
  public void showPicker(PluginCall call) {
    if (cast == null) { call.reject("cast unavailable"); return; }
    pendingUrl = call.getString("url");
    pendingTitle = call.getString("title", "");
    pendingArtist = call.getString("artist", "");
    getActivity().runOnUiThread(() -> {
      MediaRouteSelector selector = cast.getMergedSelector();
      if (selector == null) { call.reject("no selector"); return; }
      CastSession s = session();
      if (s != null && s.isConnected()) {
        if (pendingUrl != null) { pauseLocal(); loadOn(s, pendingUrl, pendingTitle, pendingArtist); }
        new MediaRouteControllerDialog(getActivity()).show();
      } else {
        MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(getActivity());
        dialog.setRouteSelector(selector);
        dialog.show();
      }
      call.resolve();
    });
  }

  @PluginMethod
  public void load(PluginCall call) {
    CastSession s = session();
    if (s == null || !s.isConnected()) { call.reject("not connected"); return; }
    getActivity().runOnUiThread(() -> {
      pauseLocal();
      loadOn(s, call.getString("url", ""), call.getString("title", ""), call.getString("artist", ""));
      call.resolve();
    });
  }

  @PluginMethod
  public void end(PluginCall call) {
    if (cast != null) getActivity().runOnUiThread(() -> cast.getSessionManager().endCurrentSession(true));
    call.resolve();
  }
}
