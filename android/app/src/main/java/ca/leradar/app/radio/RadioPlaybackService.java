package ca.leradar.app.radio;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import ca.leradar.app.MainActivity;
import ca.leradar.app.R;

/**
 * Foreground media-playback service: ExoPlayer + Media3 MediaSession.
 * Keeps the live radio stream alive when the WebView is frozen, and
 * surfaces lock-screen / notification controls (FOSS, Apache-2.0).
 *
 * Pause drops the live connection (no idle bandwidth) but keeps
 * stationId/lastUrl so notification / lock-screen Play can resume.
 */
public class RadioPlaybackService extends MediaSessionService {

  public static final String ACTION_PLAY = "ca.leradar.app.radio.PLAY";
  public static final String ACTION_PAUSE = "ca.leradar.app.radio.PAUSE";
  public static final String ACTION_STOP = "ca.leradar.app.radio.STOP";
  public static final String ACTION_UPDATE_META = "ca.leradar.app.radio.UPDATE_META";

  public static final String EXTRA_URL = "url";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_ARTIST = "artist";
  public static final String EXTRA_STATION_ID = "stationId";

  @Nullable
  private ExoPlayer exoPlayer;
  @Nullable
  private Player sessionPlayer;
  @Nullable
  private MediaSession mediaSession;
  private String stationId = "";
  private String title = "";
  private String artist = "";
  private String lastUrl = "";
  private boolean paused = false;

  @Override
  public void onCreate() {
    super.onCreate();
    DefaultMediaNotificationProvider notificationProvider =
      new DefaultMediaNotificationProvider.Builder(this).build();
    notificationProvider.setSmallIcon(R.drawable.ic_radio_notification);
    setMediaNotificationProvider(notificationProvider);
    AudioAttributes audioAttributes = new AudioAttributes.Builder()
      .setUsage(C.USAGE_MEDIA)
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .build();
    exoPlayer = new ExoPlayer.Builder(this)
      .setAudioAttributes(audioAttributes, /* handleAudioFocus= */ true)
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_NETWORK)
      .build();

    // Notification Play after a connection-dropping pause must reattach lastUrl.
    sessionPlayer = new ForwardingPlayer(exoPlayer) {
      @Override
      public void play() {
        ensureMediaAttached();
        super.play();
      }

      @Override
      public void setPlayWhenReady(boolean playWhenReady) {
        if (playWhenReady) ensureMediaAttached();
        super.setPlayWhenReady(playWhenReady);
      }
    };

    sessionPlayer.addListener(new Player.Listener() {
      @Override
      public void onPlaybackStateChanged(int playbackState) {
        emitFromPlayer();
      }

      @Override
      public void onIsPlayingChanged(boolean isPlaying) {
        if (isPlaying) paused = false;
        emitFromPlayer();
      }

      @Override
      public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
        if (!playWhenReady
            && (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST
              || reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY
              || reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS)) {
          dropLiveConnection(/* keepStation= */ true);
          paused = true;
          emitState("paused");
        }
      }

      @Override
      public void onPlayerError(androidx.media3.common.PlaybackException error) {
        paused = false;
        emitState("error");
      }
    });

    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent sessionActivity = PendingIntent.getActivity(
      this,
      0,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    mediaSession = new MediaSession.Builder(this, sessionPlayer)
      .setSessionActivity(sessionActivity)
      .setId("le-radar-radio")
      .build();
  }

  private void ensureMediaAttached() {
    if (exoPlayer == null || lastUrl.isEmpty()) return;
    if (exoPlayer.getMediaItemCount() > 0) return;
    exoPlayer.setMediaItem(buildMediaItem(lastUrl));
    exoPlayer.prepare();
  }

  @Override
  public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
    if (intent != null && intent.getAction() != null) {
      handleAction(intent);
    }
    return super.onStartCommand(intent, flags, startId);
  }

  private void handleAction(Intent intent) {
    if (exoPlayer == null) return;
    String action = intent.getAction();
    if (ACTION_PLAY.equals(action)) {
      String url = intent.getStringExtra(EXTRA_URL);
      if (url == null || url.isEmpty()) return;
      stationId = safe(intent.getStringExtra(EXTRA_STATION_ID));
      title = safe(intent.getStringExtra(EXTRA_TITLE));
      artist = safe(intent.getStringExtra(EXTRA_ARTIST));
      if (title.isEmpty()) title = getString(R.string.app_name);
      lastUrl = url;
      paused = false;
      exoPlayer.setMediaItem(buildMediaItem(url));
      exoPlayer.prepare();
      exoPlayer.play();
      emitState("loading");
    } else if (ACTION_PAUSE.equals(action)) {
      dropLiveConnection(/* keepStation= */ true);
      paused = true;
      emitState("paused");
    } else if (ACTION_STOP.equals(action)) {
      stopPlaybackAndService();
    } else if (ACTION_UPDATE_META.equals(action)) {
      String nextTitle = intent.getStringExtra(EXTRA_TITLE);
      String nextArtist = intent.getStringExtra(EXTRA_ARTIST);
      if (nextTitle != null && !nextTitle.isEmpty()) title = nextTitle;
      if (nextArtist != null) artist = nextArtist;
      if (exoPlayer.getMediaItemCount() == 0) return;
      MediaItem current = exoPlayer.getCurrentMediaItem();
      if (current == null) return;
      exoPlayer.replaceMediaItem(
        exoPlayer.getCurrentMediaItemIndex(),
        current.buildUpon().setMediaMetadata(buildMetadata()).build()
      );
    }
  }

  private MediaItem buildMediaItem(String url) {
    return new MediaItem.Builder()
      .setUri(url)
      .setMediaId(stationId.isEmpty() ? url : stationId)
      .setMediaMetadata(buildMetadata())
      .build();
  }

  private MediaMetadata buildMetadata() {
    return new MediaMetadata.Builder()
      .setTitle(title.isEmpty() ? getString(R.string.app_name) : title)
      .setArtist(artist.isEmpty() ? getString(R.string.radio_artist_fallback) : artist)
      .setAlbumTitle(getString(R.string.app_name))
      .setIsBrowsable(false)
      .setIsPlayable(true)
      .build();
  }

  /** Cut the live HTTP stream; keep stationId/lastUrl for resume. */
  private void dropLiveConnection(boolean keepStation) {
    if (exoPlayer == null) return;
    exoPlayer.stop();
    exoPlayer.clearMediaItems();
    if (!keepStation) {
      stationId = "";
      lastUrl = "";
      title = "";
      artist = "";
    }
  }

  private void stopPlaybackAndService() {
    dropLiveConnection(/* keepStation= */ false);
    paused = false;
    emitState("idle");
    stopSelf();
  }

  private void emitFromPlayer() {
    if (exoPlayer == null || stationId.isEmpty()) {
      emitState("idle");
      return;
    }
    if (exoPlayer.getPlayerError() != null) {
      emitState("error");
      return;
    }
    if (exoPlayer.isPlaying()) {
      paused = false;
      emitState("playing");
      return;
    }
    int state = exoPlayer.getPlaybackState();
    if (state == Player.STATE_BUFFERING
        || (state == Player.STATE_READY && exoPlayer.getPlayWhenReady())
        || (state == Player.STATE_IDLE && exoPlayer.getPlayWhenReady() && exoPlayer.getMediaItemCount() > 0)) {
      emitState("loading");
      return;
    }
    emitState("paused");
  }

  private void emitState(String status) {
    Bundle extras = new Bundle();
    extras.putString("status", status);
    extras.putString("stationId", stationId);
    extras.putString("title", title);
    extras.putString("artist", artist);
    RadioPlaybackPlugin.dispatchState(extras);
  }

  @Override
  public void onUpdateNotification(MediaSession session, boolean startInForegroundRequired) {
    // startForegroundService from the plugin requires a prompt foreground
    // promotion; keep the media notification while a station is selected.
    super.onUpdateNotification(session, startInForegroundRequired || !stationId.isEmpty());
  }

  @Nullable
  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
    return mediaSession;
  }

  @Override
  public void onTaskRemoved(@Nullable Intent rootIntent) {
    if (exoPlayer == null || (!exoPlayer.isPlaying() && stationId.isEmpty())) {
      stopPlaybackAndService();
    }
  }

  @Override
  public void onDestroy() {
    if (mediaSession != null) {
      mediaSession.release();
      mediaSession = null;
    }
    sessionPlayer = null;
    if (exoPlayer != null) {
      exoPlayer.release();
      exoPlayer = null;
    }
    super.onDestroy();
  }

  private static String safe(@Nullable String value) {
    return value == null ? "" : value.trim();
  }
}
