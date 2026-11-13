package expo.modules.vehiclebluetooth

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

/**
 * 앱이 화면에 없을 때 등록 차량 연결이 끊기면 위치 확인을 안내하는 알림.
 * 앱을 강제로 앞에 띄우지 않고, 사용자가 알림을 눌러야 홈으로 들어온다.
 */
internal object VehicleBluetoothNotifier {
  private const val CHANNEL = "parking-detection"
  private const val ID = 4101
  /** 홈이 열리면 새 주차 건의 위치 확인 화면으로 이어진다. */
  private const val LINK = "seulkkamalkka://home"

  fun foreground(): Boolean {
    val process = ActivityManager.RunningAppProcessInfo().also { ActivityManager.getMyMemoryState(it) }
    return process.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun allowed(context: Context, manager: NotificationManager): Boolean {
    if (Build.VERSION.SDK_INT >= 33 &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
    return manager.areNotificationsEnabled()
  }

  fun showParkingDetected(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (!allowed(context, manager)) return
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "주차 감지", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "등록 차량의 블루투스 연결이 끊기면 주차 위치 확인을 안내해요."
        }
      )
    }
    val link = Intent(Intent.ACTION_VIEW, Uri.parse(LINK)).setPackage(context.packageName)
    val open = (if (link.resolveActivity(context.packageManager) != null) link
      else context.packageManager.getLaunchIntentForPackage(context.packageName)) ?: return
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pending = PendingIntent.getActivity(
      context, ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL)
      else @Suppress("DEPRECATION") Notification.Builder(context)
    val notification = builder
      .setSmallIcon(R.drawable.vehicle_bluetooth_parking)
      .setContentTitle("주차를 감지했어요")
      .setContentText("위치를 확인해 주세요")
      .setContentIntent(pending)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .build()
    runCatching { manager.notify(ID, notification) }
  }

  /** 재연결됐거나 앱이 이벤트를 처리했으면 남은 알림을 지운다. */
  fun cancel(context: Context) {
    runCatching { context.getSystemService(NotificationManager::class.java)?.cancel(ID) }
  }
}
