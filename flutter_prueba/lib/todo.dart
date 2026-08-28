class Tareas {
  final String? id;
  final String? usuarioId;
  final String? listaId;
  final String? parentTaskId;
  final String? patronRecurrenciaId;
  final DateTime? fechaOcurrencia;
  final String titulo;
  final String? descripcion;
  final String prioridad;
  final bool estaCompletada;
  final DateTime? completadaAt;
  final DateTime? fechaLimite;
  final String? horaLimite;
  final int? recordatorioMinutos;
  final int orden;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String zonaHoraria;
  final bool notificado;
  final DateTime? notifyAt;

  Tareas({
    this.id,
    this.usuarioId,
    this.listaId,
    this.parentTaskId,
    this.patronRecurrenciaId,
    this.fechaOcurrencia,
    required this.titulo,
    this.descripcion,
    this.prioridad = 'ninguna',
    this.estaCompletada = false,
    this.completadaAt,
    this.fechaLimite,
    this.horaLimite,
    this.recordatorioMinutos,
    this.orden = 0,
    this.createdAt,
    this.updatedAt,
    this.zonaHoraria = 'America/Lima',
    this.notificado = false,
    this.notifyAt,
  });

  factory Tareas.fromMap(Map<String, dynamic> map) {
    DateTime? parseDate(dynamic value) {
      if (value == null) return null;
      return DateTime.tryParse(value.toString());
    }

    return Tareas(
      id: map['id']?.toString(),
      usuarioId: map['usuario_id']?.toString(),
      listaId: map['lista_id']?.toString(),
      parentTaskId: map['parent_task_id']?.toString(),
      patronRecurrenciaId: map['patron_recurrencia_id']?.toString(),
      fechaOcurrencia: parseDate(map['fecha_ocurrencia']),
      titulo: map['titulo']?.toString() ?? 'Sin título',
      descripcion: map['descripcion']?.toString(),
      prioridad: map['prioridad']?.toString() ?? 'ninguna',
      estaCompletada: map['esta_completada'] as bool? ?? false,
      completadaAt: parseDate(map['completada_at']),
      fechaLimite: parseDate(map['fecha_limite']),
      horaLimite: map['hora_limite']?.toString(),
      recordatorioMinutos: map['recordatorio_minutos'] as int?,
      orden: map['orden'] as int? ?? 0,
      createdAt: parseDate(map['created_at']),
      updatedAt: parseDate(map['updated_at']),
      zonaHoraria: map['zona_horaria']?.toString() ?? 'America/Lima',
      notificado: map['notificado'] as bool? ?? false,
      notifyAt: parseDate(map['notify_at'])?.toLocal(),
    );
  }

  /// Mapa optimizado para inserciones (omite nulos innecesarios)
  Map<String, dynamic> toInsertMap({String? customUsuarioId}) {
    final finalUsuarioId = customUsuarioId ?? usuarioId;
    return {
      if (finalUsuarioId != null) 'usuario_id': finalUsuarioId,
      if (listaId != null) 'lista_id': listaId,
      'titulo': titulo,
      if (parentTaskId != null) 'parent_task_id': parentTaskId,
      if (patronRecurrenciaId != null) 'patron_recurrencia_id': patronRecurrenciaId,
      if (fechaOcurrencia != null) 'fecha_ocurrencia': fechaOcurrencia!.toUtc().toIso8601String(),
      if (descripcion != null) 'descripcion': descripcion,
      'prioridad': prioridad,
      'esta_completada': estaCompletada,
      if (fechaLimite != null) 'fecha_limite': fechaLimite!.toUtc().toIso8601String(),
      if (horaLimite != null) 'hora_limite': horaLimite,
      if (recordatorioMinutos != null) 'recordatorio_minutos': recordatorioMinutos,
      'orden': orden,
      'zona_horaria': zonaHoraria,
      'notificado': notificado,
      if (notifyAt != null) 'notify_at': notifyAt!.toUtc().toIso8601String(),
    };
  }
}
