class Todo {
  final String id;
  final String title;
  final bool isCompleted;
  final DateTime createdAt;

  Todo({
    required this.id,
    required this.title,
    required this.isCompleted,
    required this.createdAt,
  });

  // Mapear el JSON de Supabase a objeto Dart (protegido contra nulos)
  factory Todo.fromMap(Map<String, dynamic> map) {
    return Todo(
      id: map['id']?.toString() ?? '',
      title: map['title'] as String? ?? 'Sin título',
      isCompleted: map['is_completed'] as bool? ?? false,
      createdAt: map['created_at'] != null
          ? DateTime.parse(map['created_at'] as String)
          : DateTime.now(),
    );
  }
}