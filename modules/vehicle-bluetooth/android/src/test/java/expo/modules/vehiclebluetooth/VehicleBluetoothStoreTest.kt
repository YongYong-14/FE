package expo.modules.vehiclebluetooth

import android.app.Application
import android.content.Context
import android.location.Location
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Intent
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class VehicleBluetoothStoreTest {
  private lateinit var context: Application
  private val address = "AA:BB:CC:DD:EE:01"

  @Before fun reset() {
    context = RuntimeEnvironment.getApplication()
    context.getSharedPreferences("vehicle-bluetooth", Context.MODE_PRIVATE).edit().clear().commit()
    VehicleBluetoothStore.onChange = null
    VehicleBluetoothStore.track(context, address, "user:vehicle")
  }

  private fun event() = VehicleBluetoothStore.snapshot(context)["event"] as? Map<*, *>
  private fun disconnect(): Map<*, *> {
    VehicleBluetoothStore.update(context, address, true)
    VehicleBluetoothStore.update(context, address, false)
    return requireNotNull(event())
  }

  @Test fun registrationIsNotAParkingEvent() {
    assertNull(VehicleBluetoothStore.snapshot(context)["connected"])
    VehicleBluetoothStore.update(context, address, false)
    assertNull(event())
  }

  @Test fun anotherDeviceCannotTriggerTheRegisteredVehicle() {
    VehicleBluetoothStore.update(context, "AA:BB:CC:DD:EE:02", true)
    VehicleBluetoothStore.update(context, "AA:BB:CC:DD:EE:02", false)
    assertNull(event())
    assertNull(VehicleBluetoothStore.snapshot(context)["connected"])
  }

  @Test fun duplicateDisconnectPreservesTheOriginalEvent() {
    val first = disconnect()
    VehicleBluetoothStore.update(context, address, false)
    assertEquals(first["id"], event()?.get("id"))
    assertEquals(first["at"], event()?.get("at"))
  }

  @Test fun reconnectReplacesPendingDisconnectAndOldAcknowledgementCannotEraseIt() {
    val first = disconnect()
    VehicleBluetoothStore.update(context, address, true)
    VehicleBluetoothStore.acknowledge(context, first["id"] as String)
    assertEquals(true, event()?.get("connected"))
    assertNotEquals(first["id"], event()?.get("id"))
  }

  @Test fun aNewOwnerOrVehicleClearsOldEventsEvenForTheSameDevice() {
    disconnect()
    VehicleBluetoothStore.track(context, address, "other-user:other-vehicle")
    assertNull(event())
    assertNull(VehicleBluetoothStore.snapshot(context)["connected"])
  }

  @Test fun logoutStopsTrackingAndLateEventsAreIgnored() {
    disconnect()
    VehicleBluetoothStore.track(context, null, null)
    VehicleBluetoothStore.update(context, address, false)
    assertNull(event())
    assertNull(VehicleBluetoothStore.snapshot(context)["address"])
  }

  @Test fun pendingEventSurvivesWithoutAJsListener() {
    VehicleBluetoothStore.onChange = null
    val first = disconnect()
    VehicleBluetoothStore.track(context, address, "user:vehicle")
    assertEquals(first, event())
  }

  @Test fun aReconnectBeforeTheLatestDisconnectIsNotLost() {
    disconnect()
    org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofSeconds(1))
    VehicleBluetoothStore.update(context, address, true)
    val reconnectedAt = VehicleBluetoothStore.snapshot(context)["lastConnectedAt"]
    org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofSeconds(1))
    VehicleBluetoothStore.update(context, address, false)
    assertEquals(reconnectedAt, event()?.get("lastConnectedAt"))
    assertEquals(false, event()?.get("connected"))
  }

  @Test fun aclBroadcastDrivesTheRegisteredDeviceWithoutAJsListener() {
    val device = BluetoothAdapter.getDefaultAdapter().getRemoteDevice(address)
    val receiver = VehicleBluetoothReceiver()
    receiver.onReceive(context, Intent(BluetoothDevice.ACTION_ACL_CONNECTED).putExtra(BluetoothDevice.EXTRA_DEVICE, device))
    assertEquals(true, VehicleBluetoothStore.snapshot(context)["connected"])
    receiver.onReceive(context, Intent(BluetoothDevice.ACTION_ACL_DISCONNECTED).putExtra(BluetoothDevice.EXTRA_DEVICE, device))
    assertEquals(false, event()?.get("connected"))
    assertEquals(address, event()?.get("address"))
  }

  @Test fun parkingFixMustBelongToTheSameDisconnectAndBeRecent() {
    val at = disconnect()["at"] as Long
    val fix = Location("gps").apply { latitude = 37.322; longitude = 127.097; accuracy = 8f; time = at - 20_000 }
    VehicleBluetoothStore.saveParkingFix(context, address, at, fix)
    assertNull(VehicleBluetoothStore.parkingFix(context, at))
    fix.time = at
    VehicleBluetoothStore.saveParkingFix(context, address, at, fix)
    assertEquals(8.0, VehicleBluetoothStore.parkingFix(context, at)?.get("accuracy"))
    VehicleBluetoothStore.acknowledge(context, event()!!["id"] as String)
    assertNotNull(VehicleBluetoothStore.parkingFix(context, at))
    VehicleBluetoothStore.update(context, address, true)
    assertNull(VehicleBluetoothStore.parkingFix(context, at))
  }
}
