package ca.leradar.app.cast;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.framework.OptionsProvider;

import org.junit.Test;

/** Saveur full : plugin Cast réel, récepteur par défaut de Google. */
public class CastFlavorTest {
  @Test public void pluginNameMatchesJs() {
    assertEquals("LeRadarCast", CastPlugin.class.getAnnotation(CapacitorPlugin.class).name());
  }

  @Test public void optionsProviderUsesDefaultReceiver() {
    assertTrue(OptionsProvider.class.isAssignableFrom(CastOptionsProvider.class));
    assertEquals("CC1AD845", CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID);
  }
}
