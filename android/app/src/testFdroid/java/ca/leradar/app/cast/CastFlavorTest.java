package ca.leradar.app.cast;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.getcapacitor.annotation.CapacitorPlugin;

import org.junit.Test;

/** Saveur F-Droid : même nom de plugin, et aucun SDK Google Cast sur le classpath. */
public class CastFlavorTest {
  @Test public void pluginNameMatchesJs() {
    assertEquals("LeRadarCast", CastPlugin.class.getAnnotation(CapacitorPlugin.class).name());
  }

  @Test public void noGoogleCastSdk() {
    try {
      Class.forName("com.google.android.gms.cast.framework.CastContext");
      fail("le SDK Cast (non libre) ne doit pas être dans la saveur fdroid");
    } catch (ClassNotFoundException expected) { /* ok */ }
  }
}
