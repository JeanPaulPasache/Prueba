import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'todo.dart';
import 'todo_service.dart';
import 'notifications/notifications_service.dart';

class TodoPage extends StatefulWidget {
  const TodoPage({super.key});

  @override
  State<TodoPage> createState() => _TodoPageState();
}

class _TodoPageState extends State<TodoPage> {
  final _todoService = TodoService();
  final _notificationService = NotificationService();
  late Future<List<Tareas>> _todosFuture;

  @override
  void initState() {
    super.initState();
    _refreshTodos();
  }

  void _refreshTodos() {
    setState(() {
      _todosFuture = _todoService.getTodos();
    });
  }

  String _formatDate(DateTime date) {
    String twoDigits(int value) => value.toString().padLeft(2, '0');
    return '${twoDigits(date.day)}/${twoDigits(date.month)}/${date.year}';
  }

  String _formatDateTime(DateTime date) {
    String twoDigits(int value) => value.toString().padLeft(2, '0');
    return '${_formatDate(date)} ${twoDigits(date.hour)}:${twoDigits(date.minute)}';
  }

  Future<void> _showCreateTaskDialog() async {
    final titleController = TextEditingController();
    final descriptionController = TextEditingController();
    String priority = 'ninguna';
    DateTime? selectedFechaLimite;
    DateTime? selectedNotifyAt;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            Future<void> pickDeadline() async {
              final picked = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
              );
              if (picked != null) {
                setModalState(() => selectedFechaLimite = picked);
              }
            }

            Future<void> pickReminder() async {
              final datePicked = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
              );
              if (datePicked != null && context.mounted) {
                final timePicked = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.now(),
                );
                if (timePicked != null) {
                  setModalState(() {
                    selectedNotifyAt = DateTime(
                      datePicked.year,
                      datePicked.month,
                      datePicked.day,
                      timePicked.hour,
                      timePicked.minute,
                    );
                  });
                }
              }
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Nueva Tarea',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: titleController,
                      decoration: const InputDecoration(
                        labelText: 'Título *',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.title),
                      ),
                      autofocus: true,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: descriptionController,
                      decoration: const InputDecoration(
                        labelText: 'Descripción (opcional)',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.notes),
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Text('Prioridad: ', style: TextStyle(fontWeight: FontWeight.w500)),
                        const SizedBox(width: 8),
                        DropdownButton<String>(
                          value: priority,
                          items: const [
                            DropdownMenuItem(value: 'ninguna', child: Text('Ninguna')),
                            DropdownMenuItem(value: 'baja', child: Text('Baja 🟢')),
                            DropdownMenuItem(value: 'media', child: Text('Media 🟡')),
                            DropdownMenuItem(value: 'alta', child: Text('Alta 🔴')),
                          ],
                          onChanged: (val) {
                            if (val != null) {
                              setModalState(() => priority = val);
                            }
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ActionChip(
                          avatar: const Icon(Icons.event, size: 18),
                          label: Text(
                            selectedFechaLimite == null
                                ? 'Fecha límite'
                                : 'Límite: ${_formatDate(selectedFechaLimite!)}',
                          ),
                          onPressed: pickDeadline,
                        ),
                        ActionChip(
                          avatar: const Icon(Icons.alarm, size: 18),
                          label: Text(
                            selectedNotifyAt == null
                                ? 'Recordatorio'
                                : 'Aviso: ${_formatDateTime(selectedNotifyAt!)}',
                          ),
                          onPressed: pickReminder,
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.calendar_month, color: Colors.blue),
                            label: const Text('Exportar a Calendar'),
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(48),
                            ),
                            onPressed: () async {
                              final titulo = titleController.text.trim();
                              if (titulo.isEmpty) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Ingresa al menos el título para exportar a Calendar'),
                                  ),
                                );
                                return;
                              }

                              final descripcion = descriptionController.text.trim();
                              final startDate = selectedNotifyAt ?? selectedFechaLimite ?? DateTime.now();
                              final endDate = startDate.add(const Duration(hours: 1));

                              String formatGCalDate(DateTime dt) {
                                final utc = dt.toUtc();
                                String twoDigits(int n) => n.toString().padLeft(2, '0');
                                return '${utc.year}${twoDigits(utc.month)}${twoDigits(utc.day)}T'
                                    '${twoDigits(utc.hour)}${twoDigits(utc.minute)}${twoDigits(utc.second)}Z';
                              }

                              final datesParam = '${formatGCalDate(startDate)}/${formatGCalDate(endDate)}';
                              final uri = Uri.https('calendar.google.com', '/calendar/render', {
                                'action': 'TEMPLATE',
                                'text': titulo,
                                if (descripcion.isNotEmpty) 'details': descripcion,
                                'dates': datesParam,
                              });

                              try {
                                if (await canLaunchUrl(uri)) {
                                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                                } else {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('No se pudo abrir Google Calendar')),
                                    );
                                  }
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('Error al abrir Calendar: $e')),
                                  );
                                }
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            icon: const Icon(Icons.save),
                            label: const Text('Guardar Tarea'),
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(48),
                            ),
                            onPressed: () async {
                              final titulo = titleController.text.trim();
                              if (titulo.isEmpty) return;

                              try {
                                final nuevaTarea = Tareas(
                                  titulo: titulo,
                                  descripcion: descriptionController.text.trim().isEmpty
                                      ? null
                                      : descriptionController.text.trim(),
                                  prioridad: priority,
                                  fechaLimite: selectedFechaLimite,
                                  notifyAt: selectedNotifyAt,
                                );

                                final tareaCreada = await _todoService.addTodo(nuevaTarea);

                                // Programar recordatorio si se seleccionó fecha
                                if (tareaCreada.notifyAt != null && tareaCreada.id != null) {
                                  await _notificationService.scheduleNotification(
                                    id: tareaCreada.id.hashCode,
                                    title: '⏰ Recordatorio de tarea',
                                    body: tareaCreada.titulo,
                                    scheduledDate: tareaCreada.notifyAt!,
                                  );
                                }

                                if (mounted) {
                                  Navigator.pop(ctx);
                                  _refreshTodos();
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('Error al guardar: $e')),
                                  );
                                }
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Color _getPriorityColor(String prioridad) {
    switch (prioridad.toLowerCase()) {
      case 'alta':
        return Colors.red;
      case 'media':
        return Colors.orange;
      case 'baja':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestor de Tareas'),
        backgroundColor: Colors.teal,
        foregroundColor: Colors.white,
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateTaskDialog,
        backgroundColor: Colors.teal,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nueva Tarea'),
      ),
      body: FutureBuilder<List<Tareas>>(
        future: _todosFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Text('Error: ${snapshot.error}'),
              ),
            );
          }

          final todos = snapshot.data ?? [];
          if (todos.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.task_alt, size: 64, color: Colors.grey),
                  SizedBox(height: 12),
                  Text(
                    'No hay tareas aún.',
                    style: TextStyle(color: Colors.grey, fontSize: 16),
                  ),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.only(left: 12, right: 12, top: 12, bottom: 80),
            itemCount: todos.length,
            separatorBuilder: (_, __) => const SizedBox(height: 6),
            itemBuilder: (context, index) {
              final todo = todos[index];
              return Card(
                elevation: 1.5,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                    color: todo.estaCompletada
                        ? Colors.grey.shade300
                        : _getPriorityColor(todo.prioridad).withValues(alpha: 0.3),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: ListTile(
                    leading: Checkbox(
                      value: todo.estaCompletada,
                      onChanged: (_) async {
                        if (todo.id != null) {
                          await _todoService.toggleTodoStatus(
                            todo.id!,
                            todo.estaCompletada,
                          );
                          _refreshTodos();
                        }
                      },
                    ),
                    title: Text(
                      todo.titulo,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        decoration: todo.estaCompletada
                            ? TextDecoration.lineThrough
                            : null,
                        color: todo.estaCompletada ? Colors.grey : Colors.black87,
                      ),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (todo.descripcion != null && todo.descripcion!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4, bottom: 6),
                            child: Text(
                              todo.descripcion!,
                              style: TextStyle(
                                color: todo.estaCompletada ? Colors.grey : Colors.black54,
                              ),
                            ),
                          ),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            if (todo.prioridad != 'ninguna')
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _getPriorityColor(todo.prioridad).withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Prioridad ${todo.prioridad}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: _getPriorityColor(todo.prioridad),
                                  ),
                                ),
                              ),
                            if (todo.fechaLimite != null)
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.event, size: 14, color: Colors.blueGrey),
                                  const SizedBox(width: 3),
                                  Text(
                                    _formatDate(todo.fechaLimite!),
                                    style: const TextStyle(fontSize: 11, color: Colors.blueGrey),
                                  ),
                                ],
                              ),
                            if (todo.notifyAt != null)
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.alarm, size: 14, color: Colors.deepPurple),
                                  const SizedBox(width: 3),
                                  Text(
                                    _formatDateTime(todo.notifyAt!),
                                    style: const TextStyle(fontSize: 11, color: Colors.deepPurple),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ],
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                      onPressed: () async {
                        if (todo.id != null) {
                          await _todoService.deleteTodo(todo.id!);
                          _refreshTodos();
                        }
                      },
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}