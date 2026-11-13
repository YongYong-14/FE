package expo.modules.vehiclebluetooth

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper

/** Android가 허용하는 ACL 이벤트만 받는다. 앱을 강제로 앞에 띄우지 않는다. */
class VehicleBluetoothReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!VehicleBluetoothStore.permitted(context)) return
    val connected = when (intent.action) {
      BluetoothDevice.ACTION_ACL_CONNECTED -> true
      BluetoothDevice.ACTION_ACL_DISCONNECTED -> false
      else -> return
    }
    val device = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
      else @Suppress("DEPRECATION") intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
    val address = runCatching { device?.address }.getOrNull() ?: return
    // 이 action은 Android의 보호된 시스템 브로드캐스트다.
    val changed = VehicleBluetoothStore.update(context, address, connected)
    if (!changed || address != VehicleBluetoothStore.address(context)) return
    if (connected) {
      VehicleBluetoothNotifier.cancel(context)
      return
    }
    // 앱이 화면에 있으면 앱이 직접 위치 확인을 열므로 알림을 띄우지 않는다.
    // 처음 상태만 확인된 경우(주차 이벤트 없음)에도 알리지 않는다.
    if (VehicleBluetoothStore.pendingDisconnect(context) && !VehicleBluetoothNotifier.foreground())
      VehicleBluetoothNotifier.showParkingDetected(context)
    runCatching { captureLocation(context, address) }
  }

  private fun captureLocation(context: Context, address: String) {
    val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!fine) return
    val foreground = VehicleBluetoothNotifier.foreground()
    if (!foreground && Build.VERSION.SDK_INT >= 29 && context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) return
    val status = VehicleBluetoothStore.snapshot(context)
    val event = status["event"] as? Map<*, *> ?: return
    if (event["connected"] != false) return
    val at = event["at"] as? Long ?: return
    val manager = context.getSystemService(LocationManager::class.java) ?: return
    // 최근 실제 측위가 있으면 먼저 보관하고, 최대 7초 동안 새 측위를 한 번만 요청한다.
    for (provider in manager.getProviders(true)) {
      runCatching { manager.getLastKnownLocation(provider) }.getOrNull()?.let { VehicleBluetoothStore.saveParkingFix(context, address, at, it) }
    }
    if (Build.VERSION.SDK_INT < 30) return
    val provider = when {
      manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> return
    }
    val pending = goAsync()
    val handler = Handler(Looper.getMainLooper())
    val cancellation = CancellationSignal()
    val ended = java.util.concurrent.atomic.AtomicBoolean(false)
    val finish = { if (ended.compareAndSet(false, true)) { cancellation.cancel(); pending.finish() } }
    handler.postDelayed({ finish() }, 7000)
    try {
      manager.getCurrentLocation(provider, cancellation, context.mainExecutor) { location ->
        if (!ended.get() && location != null) VehicleBluetoothStore.saveParkingFix(context, address, at, location)
        finish()
      }
    } catch (_: Exception) { finish() }
  }
}
