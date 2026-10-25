package ca.leradar.app.cast;

import android.content.Context;

import androidx.annotation.NonNull;

import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.framework.CastOptions;
import com.google.android.gms.cast.framework.OptionsProvider;
import com.google.android.gms.cast.framework.SessionProvider;

import java.util.List;

/** Récepteur par défaut de Google (Default Media Receiver) : aucun récepteur à héberger. */
public class CastOptionsProvider implements OptionsProvider {
  @NonNull @Override
  public CastOptions getCastOptions(@NonNull Context context) {
    return new CastOptions.Builder()
        .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
        .setStopReceiverApplicationWhenEndingSession(true)
        .build();
  }

  @Override
  public List<SessionProvider> getAdditionalSessionProviders(@NonNull Context context) { return null; }
}
