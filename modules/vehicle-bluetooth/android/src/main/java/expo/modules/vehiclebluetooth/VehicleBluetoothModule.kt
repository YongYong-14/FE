package expo.modules.vehiclebluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VehicleBluetoothModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext)
  private var receiver: VehicleBluetoothReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("VehicleBluetooth")
    Events("onChange")

    AsyncFunction("listPairedDevices") {
      check(VehicleBluetoothStore.permitted(context)) { "BLUETOOTH_PERMISSION_REQUIRED" }
      val adapter = VehicleBluetoothStore.adapter(context)
      check(adapter != null) { "BLUETOOTH_UNAVAILABLE" }
      check(adapter.isEnabled) { "BLUETOOTH_DISABLED" }
      adapter.bondedDevices.map { device ->
        val deviceClass = device.bluetoothClass?.deviceClass
        val kind = when (deviceClass) {
          BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO -> "car-audio"
          BluetoothClass.Device.AUDIO_VIDEO_HEADPHONES, BluetoothClass.Device.AUDIO_VIDEO_WEARABLE_HEADSET,
          BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE -> "earphone"
          BluetoothClass.Device.AUDIO_VIDEO_LOUDSPEAKER -> "speaker"
          else -> null
        }
        mapOf("address" to device.address, "name" to (device.name ?: "이름 없는 기기"), "kind" to kind)
      }.sortedBy { it["name"] }
    }

    AsyncFunction("track") { address: String?, key: String? ->
      // 추적 대상이 없어지면(로그아웃·차량 해제) 남은 알림도 지운다.
      if (address == null) VehicleBluetoothNotifier.cancel(context)
      VehicleBluetoothStore.track(context, address, key)
    }
    AsyncFunction("getSnapshot") { VehicleBluetoothStore.snapshot(context) }
    AsyncFunction("getParkingFix") { at: Double -> VehicleBluetoothStore.parkingFix(context, at.toLong()) }
    AsyncFunction("acknowledge") { id: String ->
      VehicleBluetoothStore.acknowledge(context, id)
      VehicleBluetoothNotifier.cancel(context)
    }
    AsyncFunction("refreshConnection") { promise: Promise -> refreshConnection(promise) }
    AsyncFunction("openBluetoothSettings") { openSettings(Settings.ACTION_BLUETOOTH_SETTINGS) }
    AsyncFunction("openBatterySettings") { openSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) }

    OnStartObserving {
      VehicleBluetoothStore.onChange = { sendEvent("onChange", emptyMap<String, Any>()) }
      val filter = IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
        addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
      }
      val next = VehicleBluetoothReceiver()
      // Bluetooth 시스템 구성요소가 보내는 이벤트를 받기 위해 EXPORTED가 필요하다.
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(next, filter, Context.RECEIVER_EXPORTED)
      else @Suppress("DEPRECATION") context.registerReceiver(next, filter)
      receiver = next
    }
    OnStopObserving {
      VehicleBluetoothStore.onChange = null
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
    }
    OnDestroy {
      VehicleBluetoothStore.onChange = null
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
    }
  }

  private fun openSettings(action: String) {
    context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  /** A2DP/HFP/보청기/LE Audio를 공개 API로 조회한다. 실제 연결은 OS가 관리한다. */
  private fun refreshConnection(promise: Promise) {
    val ctx = context
    val adapter = VehicleBluetoothStore.adapter(ctx)
    val address = VehicleBluetoothStore.address(ctx)
    if (!VehicleBluetoothStore.permitted(ctx) || adapter == null || address == null) {
      promise.resolve(VehicleBluetoothStore.snapshot(ctx)); return
    }
    if (!adapter.isEnabled) {
      VehicleBluetoothStore.update(ctx, address, false)
      promise.resolve(VehicleBluetoothStore.snapshot(ctx)); return
    }
    val profiles = mutableListOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET)
    if (Build.VERSION.SDK_INT >= 28) profiles.add(BluetoothProfile.HEARING_AID)
    if (Build.VERSION.SDK_INT >= 33) profiles.add(BluetoothProfile.LE_AUDIO)
    val handler = Handler(Looper.getMainLooper())
    handler.post {
      var remaining = profiles.size
      var connected = false
      var valid = true
      val audioDevice = runCatching { adapter.getRemoteDevice(address).bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.AUDIO_VIDEO }.getOrDefault(false)
      var finished = false
      val finish = {
        if (!finished) {
          finished = true
          // 조회 실패·비오디오 기기는 해제됐다고 단정하지 않는다.
          if (connected || (valid && remaining == 0 && audioDevice)) VehicleBluetoothStore.update(ctx, address, connected)
          promise.resolve(VehicleBluetoothStore.snapshot(ctx))
        }
      }
      handler.postDelayed({ finish() }, 2000)
      for (profile in profiles) {
        val accepted = runCatching { adapter.getProfileProxy(ctx, object : BluetoothProfile.ServiceListener {
          override fun onServiceConnected(id: Int, proxy: BluetoothProfile) {
            if (!finished) {
              connected = connected || runCatching { proxy.connectedDevices.any { it.address == address } }.onFailure { valid = false }.getOrDefault(false)
              remaining -= 1
              if (remaining == 0) finish()
            }
            runCatching { adapter.closeProfileProxy(id, proxy) }
          }
          override fun onServiceDisconnected(id: Int) = Unit
        }, profile) }.onFailure { valid = false }.getOrDefault(false)
        if (!accepted) remaining -= 1
      }
      if (remaining == 0) finish()
    }
  }
}
