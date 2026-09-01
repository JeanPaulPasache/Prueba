import 'package:flutter/material.dart';
import 'package:music_app_flutter/pages/library.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: LibraryPage(),
    );
  }
}
