import 'dart:io';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:local_notifier/local_notifier.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _localNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  Future<void> init() async {
    // 1. Inicializar zonas horarias (Crítico para que notifyAt dispare a la hora exacta)
    tz.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('America/Lima'));

    if (Platform.isWindows) {
      // 2. Inicialización específica para Windows
      await localNotifier.setup(
        appName: 'GestorDeTareas',
        shortcutPolicy: ShortcutPolicy.requireCreate,
      );
    } else {
      // 3. Inicialización para Android e iOS
      const androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosSettings = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );

      const initSettings = InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      );

      await _localNotificationsPlugin.initialize(settings: initSettings);
    }
  }

  /// Programar una notificación para una fecha y hora específica
  Future<void> scheduleNotification({
    required int id,
    required String title,
    required String body,
    required DateTime scheduledDate,
  }) async {
    final tzScheduledDate = tz.TZDateTime.from(scheduledDate, tz.local);
    final nowTz = tz.TZDateTime.now(tz.local);

    print('⏰ [PROGRAMANDO NOTIFICACIÓN]');
    print('  - ID: $id');
    print('  - Título: $title');
    print('  - Hora actual (local): $nowTz');
    print('  - Hora programada (local): $tzScheduledDate');

    // Si la fecha ya pasó, no se programa
    if (tzScheduledDate.isBefore(nowTz)) {
      print('⚠️ La hora programada ya pasó, no se agenda.');
      return;
    }

    if (Platform.isWindows) {
      // En Windows: Calculamos la diferencia de tiempo para disparar la notificación
      final delay = scheduledDate.difference(DateTime.now());
      Future.delayed(delay, () {
        LocalNotification notification = LocalNotification(
          title: title,
          body: body,
        );
        notification.show();
      });
    } else {
      // En Android / iOS: Se registra en el sistema operativo
      await _localNotificationsPlugin.zonedSchedule(
        id: id,
        title: title,
        body: body,
        scheduledDate: tzScheduledDate,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'canal_tareas',
            'Recordatorio de Tareas',
            channelDescription: 'Canal para alertas de tareas pendientes',
            importance: Importance.max,
            priority: Priority.high,
            playSound: true,
            enableVibration: true,
          ),
          iOS: DarwinNotificationDetails(
            sound: 'default.caf',
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      );
      print('✅ Notificación agendada exitosamente en el sistema Android/iOS');
    }
  }
}