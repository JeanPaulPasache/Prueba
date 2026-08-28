import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'todo.dart';

class TodoService {
  final _client = Supabase.instance.client;

  // 1. Obtener la lista de tareas ordenadas
  Future<List<Tareas>> getTodos() async {
    final response = await _client
        .from('tareas')
        .select()
        .order('created_at', ascending: false);

    final data = response as List<dynamic>;
    return data.map((map) => Tareas.fromMap(map as Map<String, dynamic>)).toList();
  }

  // 2. Insertar una nueva tarea pasando el modelo Tareas
  Future<Tareas> addTodo(Tareas tarea, {String? usuarioId}) async {
    final payload = tarea.toInsertMap(customUsuarioId: usuarioId);
    debugPrint('➡️ [Supabase INSERT payload]: $payload');

    final response = await _client
        .from('tareas')
        .insert(payload)
        .select()
        .single();

    debugPrint('⬅️ [Supabase INSERT response]: $response');
    return Tareas.fromMap(response);
  }

  // 3. Cambiar estado completado/incompleto
  Future<void> toggleTodoStatus(String id, bool currentStatus) async {
    await _client
        .from('tareas')
        .update({
          'esta_completada': !currentStatus,
          'completada_at': !currentStatus ? DateTime.now().toIso8601String() : null,
          'updated_at': DateTime.now().toIso8601String(),
        })
        .eq('id', id);
  }

  // 4. Eliminar una tarea
  Future<void> deleteTodo(String id) async {
    await _client.from('tareas').delete().eq('id', id);
  }
}