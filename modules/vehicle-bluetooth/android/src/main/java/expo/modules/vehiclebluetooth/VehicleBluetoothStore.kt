package expo.modules.vehiclebluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject
import java.util.UUID

/** JS가 중지된 동안에도 등록한 한 기기의 최신 미처리 이벤트를 보관한다. */
internal object VehicleBluetoothStore {
  private const val FILE = "vehicle-bluetooth"
  var onChange: (() -> Unit)? = null

  fun adapter(context: Context): BluetoothAdapter? =
    context.getSystemService(BluetoothManager::class.java)?.adapter

  fun permitted(context: Context) = Build.VERSION.SDK_INT < 31 ||
    context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  @Synchronized
  fun track(context: Context, address: String?, key: String?) {
    val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    if (prefs.getString("key", null) == key && prefs.getString("address", null) == address) return
    prefs.edit().clear().putString("address", address).putString("key", key).commit()
  }

  fun address(context: Context): String? = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("address", null)

  @Synchronized
  fun update(context: Context, address: String, connected: Boolean): Boolean {
    val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    if (prefs.getString("address", null) != address) return false
    val known = prefs.contains("connected")
    if (known && prefs.getBoolean("connected", false) == connected) return false
    val edit = prefs.edit().putBoolean("connected", connected)
    // 초기 상태 조회는 이벤트가 아니다. 미연결 기기 등록을 주차로 처리하지 않는다.
    val at = System.currentTimeMillis()
    edit.putLong("changedAt", at).remove("parkingFix")
    if (connected) edit.putLong("lastConnectedAt", at)
    if (known) edit.putString("pending", JSONObject().put("id", UUID.randomUUID().toString())
      .put("address", address).put("connected", connected).put("at", at)
      .put("lastConnectedAt", prefs.getLong("lastConnectedAt", 0)).toString())
    edit.commit()
    onChange?.invoke()
    return true
  }

  @Synchronized
  fun acknowledge(context: Context, id: String) {
    val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    val event = prefs.getString("pending", null)?.let { JSONObject(it) }
    if (event?.optString("id") == id) prefs.edit().remove("pending").commit()
  }

  /** 아직 앱이 처리하지 않은 연결 해제 이벤트가 있는지. */
  fun pendingDisconnect(context: Context): Boolean {
    val event = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("pending", null)?.let { JSONObject(it) }
    return event != null && !event.optBoolean("connected", true)
  }

  @Synchronized
  fun saveParkingFix(context: Context, address: String, detectedAt: Long, location: android.location.Location) {
    val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    if (prefs.getString("address", null) != address || prefs.getBoolean("connected", true) ||
      prefs.getLong("changedAt", 0) != detectedAt) return
    if (!location.latitude.isFinite() || !location.longitude.isFinite() ||
      kotlin.math.abs(location.latitude) > 90 || kotlin.math.abs(location.longitude) > 180 ||
      !location.hasAccuracy() || !location.accuracy.isFinite() || location.accuracy < 0 ||
      kotlin.math.abs(location.time - detectedAt) > 15_000) return
    val existing = prefs.getString("parkingFix", null)?.let { JSONObject(it) }
    if (existing != null && existing.getDouble("accuracy") < location.accuracy) return
    prefs.edit().putString("parkingFix", JSONObject().put("detectedAt", detectedAt)
      .put("latitude", location.latitude).put("longitude", location.longitude)
      .put("accuracy", location.accuracy.toDouble()).put("timestamp", location.time).toString()).commit()
  }

  fun parkingFix(context: Context, detectedAt: Long): Map<String, Any>? {
    val fix = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("parkingFix", null)?.let { JSONObject(it) } ?: return null
    if (fix.getLong("detectedAt") != detectedAt) return null
    return mapOf("latitude" to fix.getDouble("latitude"), "longitude" to fix.getDouble("longitude"),
      "accuracy" to fix.getDouble("accuracy"), "timestamp" to fix.getLong("timestamp"))
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    val allowed = permitted(context)
    val adapter = adapter(context)
    val event = prefs.getString("pending", null)?.let { JSONObject(it) }
    return mapOf(
      "supported" to (adapter != null),
      "enabled" to (allowed && runCatching { adapter?.isEnabled == true }.getOrDefault(false)),
      "connected" to if (allowed && prefs.contains("connected")) prefs.getBoolean("connected", false) else null,
      "address" to prefs.getString("address", null),
      "lastConnectedAt" to prefs.getLong("lastConnectedAt", 0),
      "event" to event?.let { mapOf("id" to it.getString("id"), "address" to it.getString("address"),
        "connected" to it.getBoolean("connected"), "at" to it.getLong("at"), "lastConnectedAt" to it.optLong("lastConnectedAt", 0)) }
    )
  }
}
