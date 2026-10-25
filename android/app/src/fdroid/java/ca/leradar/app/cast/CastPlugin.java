package ca.leradar.app.cast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Saveur F-Droid : aucun SDK Google, Cast indisponible (le bouton reste caché). */
@CapacitorPlugin(name = "LeRadarCast")
public class CastPlugin extends Plugin {
  @PluginMethod
  public void isAvailable(PluginCall call) {
    JSObject r = new JSObject();
    r.put("available", false);
    r.put("connected", false);
    call.resolve(r);
  }

  @PluginMethod
  public void showPicker(PluginCall call) { call.reject("cast unavailable"); }

  @PluginMethod
  public void load(PluginCall call) { call.reject("cast unavailable"); }

  @PluginMethod
  public void end(PluginCall call) { call.resolve(); }
}
