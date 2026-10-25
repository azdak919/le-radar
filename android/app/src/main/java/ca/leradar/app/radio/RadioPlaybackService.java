package ca.leradar.app.radio;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.CommandButton;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaSession;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;

import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ca.leradar.app.MainActivity;
import ca.leradar.app.R;

/**
 * Service de premier plan : ExoPlayer + MediaLibrarySession (Media3, Apache-2.0).
 *
 * - Notification MediaStyle (précédente / lecture-pause / suivante / arrêter),
 *   contrôles à l'écran verrouillé.
 * - Métadonnées AVRCP pour l'autoradio Bluetooth (titre, sous-titre, album,
 *   pochette) et commandes du volant : piste suivante/précédente = station.
 * - Android Auto : arborescence des stations (toutes, suivies, par ville).
 *
 * Les stations forment une liste de lecture : changer de « piste » change de
 * station. La liste est gardée dans les préférences pour qu'Android Auto puisse
 * parcourir les stations même quand l'app n'est pas ouverte.
 */
public class RadioPlaybackService extends MediaLibraryService {

  public static final String ACTION_PLAY = "ca.leradar.app.radio.PLAY";
  public static final String ACTION_PAUSE = "ca.leradar.app.radio.PAUSE";
  public static final String ACTION_STOP = "ca.leradar.app.radio.STOP";
  public static final String ACTION_UPDATE_META = "ca.leradar.app.radio.UPDATE_META";
  public static final String ACTION_SET_STATIONS = "ca.leradar.app.radio.SET_STATIONS";

  public static final String EXTRA_URL = "url";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_ARTIST = "artist";
  public static final String EXTRA_STATION_ID = "stationId";
  public static final String EXTRA_NOW = "now";
  public static final String EXTRA_STATIONS = "stations";
  public static final String EXTRA_FAVORITES = "favorites";

  static final String PREFS = "radar_radio";
  static final String PREF_STATIONS = "stations";
  static final String PREF_FAVORITES = "favorites";

  private static final String ROOT_ID = "racine";
  private static final String ALL_ID = "toutes";
  private static final String FAV_ID = "suivies";
  private static final String CITY_ID = "villes";
  private static final String CITY_PREFIX = "ville:";
  private static final String STATION_PREFIX = "station:";
  private static final String CMD_STOP = "ca.leradar.app.radio.CMD_STOP";
  /** Pause plus longue : on coupe la connexion (pas de données en pause). */
  private static final long DROP_AFTER_PAUSE_MS = 60_000L;
  /** Au-delà, la reprise repart du direct au lieu d'un vieux tampon. */
  private static final long LIVE_EDGE_AFTER_MS = 5_000L;

  static final class Station {
    String id = "";
    String name = "";
    String fullName = "";
    String institution = "";
    String city = "";
    String stream = "";
    String artwork = "";
  }

  @Nullable private ExoPlayer exoPlayer;
  @Nullable private Player sessionPlayer;
  @Nullable private MediaLibrarySession session;
  private final Map<String, Station> stations = new LinkedHashMap<>();
  private final Set<String> favorites = new HashSet<>();
  private final Map<String, String> nowById = new HashMap<>();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private long pausedAt = 0L;
  private final Runnable dropConnection = () -> {
    if (exoPlayer != null && !exoPlayer.getPlayWhenReady()) exoPlayer.stop();
  };

  private static volatile boolean running = false;

  static boolean isRunning() { return running; }

  @Override
  public void onCreate() {
    super.onCreate();
    running = true;
    DefaultMediaNotificationProvider provider = new DefaultMediaNotificationProvider.Builder(this)
      .setChannelName(R.string.radio_notification_channel)
      .build();
    provider.setSmallIcon(R.drawable.ic_radio_notification);
    setMediaNotificationProvider(provider);

    AudioAttributes attrs = new AudioAttributes.Builder()
      .setUsage(C.USAGE_MEDIA)
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .build();
    exoPlayer = new ExoPlayer.Builder(this)
      .setAudioAttributes(attrs, true)
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_NETWORK)
      .build();
    exoPlayer.setRepeatMode(Player.REPEAT_MODE_ALL); // suivante après la dernière = première

    sessionPlayer = new ForwardingPlayer(exoPlayer) {
      @Override public void play() { beforePlay(); super.play(); }
      @Override public void setPlayWhenReady(boolean b) { if (b) beforePlay(); super.setPlayWhenReady(b); }
      @Override public void pause() { super.pause(); afterPause(); }
      @Override public void stop() { stopAll(); }
    };
    sessionPlayer.addListener(new Player.Listener() {
      @Override public void onEvents(@NonNull Player player, @NonNull Player.Events events) {
        if (events.containsAny(Player.EVENT_PLAYBACK_STATE_CHANGED, Player.EVENT_IS_PLAYING_CHANGED,
            Player.EVENT_PLAY_WHEN_READY_CHANGED, Player.EVENT_MEDIA_ITEM_TRANSITION, Player.EVENT_PLAYER_ERROR)) {
          emitFromPlayer();
        }
      }
      @Override public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
        if (!playWhenReady) afterPause();
      }
    });

    loadPrefs();

    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent activity = PendingIntent.getActivity(this, 0, open,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    CommandButton stopButton = new CommandButton.Builder(CommandButton.ICON_STOP)
      .setDisplayName("Arrêter")
      .setSessionCommand(new SessionCommand(CMD_STOP, Bundle.EMPTY))
      .build();

    session = new MediaLibrarySession.Builder(this, sessionPlayer, new LibraryCallback())
      .setSessionActivity(activity)
      .setId("le-radar-radio")
      .setCustomLayout(ImmutableList.of(stopButton))
      .build();
    // Sans contrôleur lié, Media3 ne suit pas la session : l'ajouter
    // explicitement garantit la notification et le premier plan.
    addSession(session);
  }

  // ─── Stations ────────────────────────────────────────────────────────────

  private void loadPrefs() {
    SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    parseStations(prefs.getString(PREF_STATIONS, "[]"));
    parseFavorites(prefs.getString(PREF_FAVORITES, "[]"));
  }

  private void parseStations(String json) {
    try {
      JSONArray arr = new JSONArray(json == null ? "[]" : json);
      Map<String, Station> next = new LinkedHashMap<>();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        Station s = new Station();
        s.id = o.optString("id", "").trim();
        s.name = o.optString("name", "").trim();
        s.fullName = o.optString("fullName", s.name).trim();
        s.institution = o.optString("institution", "").trim();
        s.city = o.optString("city", "").trim();
        s.stream = o.optString("stream", "").trim();
        s.artwork = o.optString("artwork", "").trim();
        if (s.id.isEmpty() || s.stream.isEmpty()) continue;
        if (s.name.isEmpty()) s.name = s.id;
        if (s.fullName.isEmpty()) s.fullName = s.name;
        next.put(s.id, s);
      }
      if (!next.isEmpty()) { stations.clear(); stations.putAll(next); }
    } catch (Exception ignored) { /* liste illisible : on garde l'ancienne */ }
  }

  private void parseFavorites(String json) {
    try {
      JSONArray arr = new JSONArray(json == null ? "[]" : json);
      favorites.clear();
      for (int i = 0; i < arr.length(); i++) favorites.add(arr.optString(i, ""));
    } catch (Exception ignored) { }
  }

  /** Ligne secondaire : « CHYZ 94,3 FM · Université Laval ». */
  static String subtitle(Station s) {
    String head = s.fullName.isEmpty() ? s.name : s.fullName;
    if (s.institution.isEmpty()) return head;
    return head + " · " + s.institution;
  }

  private MediaItem stationItem(Station s) {
    String now = nowById.get(s.id);
    boolean hasShow = now != null && !now.isEmpty();
    MediaMetadata.Builder meta = new MediaMetadata.Builder()
      .setTitle(hasShow ? now : s.name)
      .setDisplayTitle(hasShow ? now : s.name)
      .setArtist(subtitle(s))
      .setSubtitle(subtitle(s))
      .setAlbumTitle(getString(R.string.radio_album))
      .setStation(s.fullName)
      .setGenre(getString(R.string.radio_artist_fallback))
      .setMediaType(MediaMetadata.MEDIA_TYPE_RADIO_STATION)
      // Autoradios AVRCP 1.3/1.4 : « T-001 » = numéro de station / nombre de stations.
      // Durée laissée inconnue (direct) : AVRCP la transmet comme indéfinie.
      .setTrackNumber(Math.max(1, indexOf(s.id) + 1))
      .setTotalTrackCount(Math.max(1, stations.size()))
      .setIsBrowsable(false)
      .setIsPlayable(true);
    Uri art = artworkUri(s);
    if (art != null) meta.setArtworkUri(art);
    return new MediaItem.Builder()
      .setMediaId(STATION_PREFIX + s.id)
      .setUri(s.stream)
      .setMediaMetadata(meta.build())
      .build();
  }

  @Nullable
  private Uri artworkUri(Station s) {
    if (!s.artwork.isEmpty() && s.artwork.startsWith("https://")) return Uri.parse(s.artwork);
    return Uri.parse("android.resource://" + getPackageName() + "/" + R.mipmap.ic_launcher);
  }

  private MediaItem folder(String id, String title, int type) {
    return new MediaItem.Builder()
      .setMediaId(id)
      .setMediaMetadata(new MediaMetadata.Builder()
        .setTitle(title)
        .setIsBrowsable(true)
        .setIsPlayable(false)
        .setMediaType(type)
        .build())
      .build();
  }

  private List<MediaItem> allItems() {
    List<MediaItem> out = new ArrayList<>();
    for (Station s : stations.values()) out.add(stationItem(s));
    return out;
  }

  private int indexOf(String stationId) {
    int i = 0;
    for (String id : stations.keySet()) {
      if (id.equals(stationId)) return i;
      i++;
    }
    return -1;
  }

  @Nullable
  private Station stationFromMediaId(@Nullable String mediaId) {
    if (mediaId == null) return null;
    String id = mediaId.startsWith(STATION_PREFIX) ? mediaId.substring(STATION_PREFIX.length()) : mediaId;
    return stations.get(id);
  }

  private String currentStationId() {
    if (exoPlayer == null) return "";
    MediaItem item = exoPlayer.getCurrentMediaItem();
    if (item == null) return "";
    Station s = stationFromMediaId(item.mediaId);
    return s == null ? "" : s.id;
  }

  // ─── Lecture ─────────────────────────────────────────────────────────────

  private void beforePlay() {
    handler.removeCallbacks(dropConnection);
    if (exoPlayer == null) return;
    if (exoPlayer.getMediaItemCount() == 0) return;
    boolean stale = pausedAt > 0 && System.currentTimeMillis() - pausedAt > LIVE_EDGE_AFTER_MS;
    if (stale && exoPlayer.getPlaybackState() != Player.STATE_IDLE) exoPlayer.stop();
    if (exoPlayer.getPlaybackState() == Player.STATE_IDLE) {
      exoPlayer.seekToDefaultPosition();
      exoPlayer.prepare();
    }
    pausedAt = 0L;
  }

  private void afterPause() {
    if (pausedAt == 0L) pausedAt = System.currentTimeMillis();
    handler.removeCallbacks(dropConnection);
    handler.postDelayed(dropConnection, DROP_AFTER_PAUSE_MS);
  }

  private void playStation(String stationId, @Nullable Station fallback) {
    if (exoPlayer == null) return;
    if (!stations.containsKey(stationId) && fallback != null) stations.put(fallback.id, fallback);
    int index = indexOf(stationId);
    if (index < 0) return;
    handler.removeCallbacks(dropConnection);
    pausedAt = 0L;
    exoPlayer.setMediaItems(allItems(), index, C.TIME_UNSET);
    exoPlayer.prepare();
    exoPlayer.play();
  }

  private void stopAll() {
    handler.removeCallbacks(dropConnection);
    if (exoPlayer != null) {
      exoPlayer.stop();
      exoPlayer.clearMediaItems();
    }
    pausedAt = 0L;
    emitState("idle", "");
    stopSelf();
  }

  /** Met à jour l'émission à l'antenne sans couper le son. */
  private void refreshMetadata(String stationId) {
    if (exoPlayer == null) return;
    for (int i = 0; i < exoPlayer.getMediaItemCount(); i++) {
      MediaItem item = exoPlayer.getMediaItemAt(i);
      Station s = stationFromMediaId(item.mediaId);
      if (s == null || (!stationId.isEmpty() && !s.id.equals(stationId))) continue;
      MediaItem next = stationItem(s);
      if (!next.mediaMetadata.equals(item.mediaMetadata)) {
        exoPlayer.replaceMediaItem(i, item.buildUpon().setMediaMetadata(next.mediaMetadata).build());
      }
    }
  }

  @Override
  public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
    if (intent != null && intent.getAction() != null) handleAction(intent);
    return super.onStartCommand(intent, flags, startId);
  }

  private void handleAction(Intent intent) {
    String action = intent.getAction();
    if (ACTION_SET_STATIONS.equals(action)) {
      String json = intent.getStringExtra(EXTRA_STATIONS);
      String favs = intent.getStringExtra(EXTRA_FAVORITES);
      if (json != null) parseStations(json);
      if (favs != null) parseFavorites(favs);
      if (session != null) {
        session.notifyChildrenChanged(ROOT_ID, 3, null);
        session.notifyChildrenChanged(ALL_ID, stations.size(), null);
        session.notifyChildrenChanged(FAV_ID, favorites.size(), null);
      }
    } else if (ACTION_PLAY.equals(action)) {
      String url = intent.getStringExtra(EXTRA_URL);
      String id = safe(intent.getStringExtra(EXTRA_STATION_ID));
      if (url == null || url.isEmpty()) return;
      Station fallback = new Station();
      fallback.id = id.isEmpty() ? url : id;
      fallback.name = safe(intent.getStringExtra(EXTRA_TITLE));
      if (fallback.name.isEmpty()) fallback.name = getString(R.string.app_name);
      fallback.fullName = fallback.name;
      fallback.stream = url;
      String now = safe(intent.getStringExtra(EXTRA_NOW));
      if (!now.isEmpty()) nowById.put(fallback.id, now);
      playStation(fallback.id, fallback);
      emitState("loading", fallback.id);
    } else if (ACTION_PAUSE.equals(action)) {
      if (sessionPlayer != null) sessionPlayer.pause();
    } else if (ACTION_STOP.equals(action)) {
      stopAll();
    } else if (ACTION_UPDATE_META.equals(action)) {
      String id = safe(intent.getStringExtra(EXTRA_STATION_ID));
      if (id.isEmpty()) id = currentStationId();
      if (id.isEmpty()) return;
      String now = safe(intent.getStringExtra(EXTRA_NOW));
      if (now.isEmpty()) nowById.remove(id); else nowById.put(id, now);
      refreshMetadata(id);
    }
  }

  // ─── Pont vers l'app ─────────────────────────────────────────────────────

  private void emitFromPlayer() {
    String id = currentStationId();
    if (exoPlayer == null || id.isEmpty()) { emitState("idle", ""); return; }
    if (exoPlayer.getPlayerError() != null) { emitState("error", id); return; }
    if (exoPlayer.isPlaying()) { emitState("playing", id); return; }
    int st = exoPlayer.getPlaybackState();
    if (exoPlayer.getPlayWhenReady() && st != Player.STATE_ENDED) { emitState("loading", id); return; }
    emitState("paused", id);
  }

  private void emitState(String status, String id) {
    Bundle extras = new Bundle();
    extras.putString("status", status);
    extras.putString("stationId", id);
    Station s = stations.get(id);
    extras.putString("title", s == null ? "" : s.name);
    extras.putString("artist", s == null ? "" : subtitle(s));
    RadioPlaybackPlugin.dispatchState(extras);
  }

  // ─── Session / Android Auto ──────────────────────────────────────────────

  private final class LibraryCallback implements MediaLibrarySession.Callback {
    @NonNull
    @Override
    public MediaSession.ConnectionResult onConnect(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo c) {
      SessionCommands commands = MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
        .add(new SessionCommand(CMD_STOP, Bundle.EMPTY))
        .build();
      return new MediaSession.ConnectionResult.AcceptedResultBuilder(s)
        .setAvailableSessionCommands(commands)
        .build();
    }

    @NonNull
    @Override
    public ListenableFuture<SessionResult> onCustomCommand(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo c,
        @NonNull SessionCommand command, @NonNull Bundle args) {
      if (CMD_STOP.equals(command.customAction)) {
        stopAll();
        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
      }
      return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED));
    }

    @NonNull
    @Override
    public ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(@NonNull MediaLibrarySession s,
        @NonNull MediaSession.ControllerInfo c, @Nullable LibraryParams params) {
      return Futures.immediateFuture(LibraryResult.ofItem(
        folder(ROOT_ID, getString(R.string.app_name), MediaMetadata.MEDIA_TYPE_FOLDER_RADIO_STATIONS), params));
    }

    @NonNull
    @Override
    public ListenableFuture<LibraryResult<MediaItem>> onGetItem(@NonNull MediaLibrarySession s,
        @NonNull MediaSession.ControllerInfo c, @NonNull String mediaId) {
      Station st = stationFromMediaId(mediaId);
      if (st != null) return Futures.immediateFuture(LibraryResult.ofItem(stationItem(st), null));
      return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
    }

    @NonNull
    @Override
    public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(@NonNull MediaLibrarySession s,
        @NonNull MediaSession.ControllerInfo c, @NonNull String parentId, int page, int pageSize,
        @Nullable LibraryParams params) {
      ImmutableList.Builder<MediaItem> out = ImmutableList.builder();
      if (ROOT_ID.equals(parentId)) {
        if (!favorites.isEmpty()) out.add(folder(FAV_ID, getString(R.string.radio_browse_favorites), MediaMetadata.MEDIA_TYPE_FOLDER_RADIO_STATIONS));
        out.add(folder(ALL_ID, getString(R.string.radio_browse_all), MediaMetadata.MEDIA_TYPE_FOLDER_RADIO_STATIONS));
        out.add(folder(CITY_ID, getString(R.string.radio_browse_city), MediaMetadata.MEDIA_TYPE_FOLDER_MIXED));
      } else if (ALL_ID.equals(parentId)) {
        for (Station st : stations.values()) out.add(stationItem(st));
      } else if (FAV_ID.equals(parentId)) {
        for (Station st : stations.values()) if (favorites.contains(st.id)) out.add(stationItem(st));
      } else if (CITY_ID.equals(parentId)) {
        Set<String> seen = new HashSet<>();
        for (Station st : stations.values()) {
          String city = st.city.isEmpty() ? "Québec" : st.city;
          if (seen.add(city)) out.add(folder(CITY_PREFIX + city, city, MediaMetadata.MEDIA_TYPE_FOLDER_RADIO_STATIONS));
        }
      } else if (parentId.startsWith(CITY_PREFIX)) {
        String city = parentId.substring(CITY_PREFIX.length());
        for (Station st : stations.values()) {
          String sc = st.city.isEmpty() ? "Québec" : st.city;
          if (sc.equals(city)) out.add(stationItem(st));
        }
      } else {
        return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
      }
      return Futures.immediateFuture(LibraryResult.ofItemList(out.build(), params));
    }

    /** Choisir une station dans la voiture : toute la liste suit, pour que
     *  « suivante » / « précédente » au volant changent de station. */
    @NonNull
    @Override
    public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onSetMediaItems(@NonNull MediaSession s,
        @NonNull MediaSession.ControllerInfo c, @NonNull List<MediaItem> items, int startIndex, long startPositionMs) {
      String wanted = "";
      if (!items.isEmpty()) {
        MediaItem pick = items.get(Math.max(0, Math.min(startIndex < 0 ? 0 : startIndex, items.size() - 1)));
        Station st = stationFromMediaId(pick.mediaId);
        if (st != null) wanted = st.id;
      }
      int index = indexOf(wanted);
      if (index < 0) index = 0;
      pausedAt = 0L;
      return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(allItems(), index, C.TIME_UNSET));
    }

    @NonNull
    @Override
    public ListenableFuture<List<MediaItem>> onAddMediaItems(@NonNull MediaSession s,
        @NonNull MediaSession.ControllerInfo c, @NonNull List<MediaItem> items) {
      List<MediaItem> out = new ArrayList<>();
      for (MediaItem item : items) {
        Station st = stationFromMediaId(item.mediaId);
        if (st != null) out.add(stationItem(st));
      }
      return Futures.immediateFuture(out);
    }

    /** Reprise « Lecture » depuis la voiture ou le casque après un arrêt. */
    @NonNull
    @Override
    public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(@NonNull MediaSession s,
        @NonNull MediaSession.ControllerInfo c) {
      SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      int index = Math.max(0, indexOf(prefs.getString("last", "")));
      return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(allItems(), index, C.TIME_UNSET));
    }
  }

  @Nullable
  @Override
  public MediaLibrarySession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
    return session;
  }

  @Override
  public void onUpdateNotification(@NonNull MediaSession s, boolean startInForegroundRequired) {
    String id = currentStationId();
    if (!id.isEmpty()) getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("last", id).apply();
    super.onUpdateNotification(s, startInForegroundRequired);
  }

  @Override
  public void onTaskRemoved(@Nullable Intent rootIntent) {
    if (exoPlayer == null || !exoPlayer.getPlayWhenReady() || exoPlayer.getMediaItemCount() == 0) stopAll();
  }

  @Override
  public void onDestroy() {
    running = false;
    handler.removeCallbacks(dropConnection);
    if (session != null) { session.release(); session = null; }
    sessionPlayer = null;
    if (exoPlayer != null) { exoPlayer.release(); exoPlayer = null; }
    super.onDestroy();
  }

  private static String safe(@Nullable String value) {
    return value == null ? "" : value.trim();
  }
}
