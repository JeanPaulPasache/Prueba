import 'package:supabase_flutter/supabase_flutter.dart';
import 'todo.dart';

class TodoService {
  final _client = Supabase.instance.client;

  // 1. Obtener la lista de tareas ordenadas
  Future<List<Todo>> getTodos() async {
    final response = await _client
        .from('todos')
        .select()
        .order('created_at', ascending: false);

    final data = response as List<dynamic>;
    return data.map((map) => Todo.fromMap(map as Map<String, dynamic>)).toList();
  }

  // 2. Insertar una nueva tarea
  Future<Todo> addTodo(String title) async {
    final response = await _client
        .from('todos')
        .insert({'title': title})
        .select()
        .single();

    return Todo.fromMap(response);
  }

  // 3. Cambiar estado completado/incompleto
  Future<void> toggleTodoStatus(String id, bool currentStatus) async {
    await _client
        .from('todos')
        .update({'is_completed': !currentStatus})
        .eq('id', id);
  }
}