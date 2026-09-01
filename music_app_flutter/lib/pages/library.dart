import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:on_audio_query/on_audio_query.dart';
import 'package:permission_handler/permission_handler.dart';

class LibraryPage extends StatefulWidget {
  const LibraryPage({super.key});

  @override
  State<LibraryPage> createState() => _LibraryPageState();
}

class _LibraryPageState extends State<LibraryPage> {
  final OnAudioQuery _audioQuery = OnAudioQuery();
  bool _hasPermission = false;
  bool _isLoading = true;
  List<SongModel> _songs = [];
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _checkPermissionAndFetch();
  }

  Future<void> _checkPermissionAndFetch() async {
    try {
      bool permissionStatus = await _audioQuery.permissionsStatus();
      if (!permissionStatus) {
        permissionStatus = await _audioQuery.permissionsRequest();
      }

      setState(() {
        _hasPermission = permissionStatus;
      });

      if (permissionStatus) {
        final songs = await _audioQuery.querySongs();
        setState(() {
          _songs = songs;
          _isLoading = false;
        });
      } else {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: appBar(),
      drawer: slidingBar(context),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 50, color: Colors.redAccent),
              const SizedBox(height: 12),
              Text(
                'Detalle del error:\n$_errorMessage',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 14),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _isLoading = true;
                    _errorMessage = null;
                  });
                  _checkPermissionAndFetch();
                },
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }

    if (!_hasPermission) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.folder_off, size: 60, color: Colors.white54),
            const SizedBox(height: 16),
            const Text(
              'Se requieren permisos para leer tu música',
              style: TextStyle(color: Colors.white, fontSize: 16),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _checkPermissionAndFetch,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.white24),
              child: const Text('Conceder permiso', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );
    }

    if (_songs.isEmpty) {
      return const Center(
        child: Text(
          'No se encontraron canciones .mp3',
          style: TextStyle(color: Colors.white, fontSize: 16),
        ),
      );
    }

    return ListView.builder(
      itemCount: _songs.length,
      itemBuilder: (context, index) {
        final song = _songs[index];
        final rawMap = song.getMap;
        final rawTitle = rawMap['title'] as String?;
        final rawDisplayName = rawMap['_display_name_wo_ext'] as String?;
        final rawArtist = rawMap['artist'] as String?;

        final title = (rawTitle != null && rawTitle.isNotEmpty)
            ? rawTitle
            : ((rawDisplayName != null && rawDisplayName.isNotEmpty) ? rawDisplayName : "Sin título");
        final artist = (rawArtist == null || rawArtist == "<unknown>" || rawArtist.isEmpty)
            ? "Desconocido"
            : rawArtist;

        return ListTile(
          leading: QueryArtworkWidget(
            id: song.id,
            type: ArtworkType.AUDIO,
            nullArtworkWidget: Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: Colors.grey[900],
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.music_note,
                color: Colors.white,
              ),
            ),
            artworkBorder: BorderRadius.circular(8),
          ),
          title: Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            artist == "<unknown>" ? "Desconocido" : artist,
            style: const TextStyle(color: Colors.white70),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: const Icon(
            Icons.more_vert,
            color: Colors.white54,
          ),
          onTap: () {
            // Conectar reproductor
          },
        );
      },
    );
  }

  AppBar appBar() {
    return AppBar(
      title: const Text(
        'Mi Music',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.bold,
        ),
      ),
      backgroundColor: Colors.black,
      leading: Builder(
        builder: (context) => GestureDetector(
          onTap: () {
            Scaffold.of(context).openDrawer();
          },
          child: Container(
            margin: const EdgeInsets.all(10),
            alignment: Alignment.center,
            child: SvgPicture.asset(
              'assets/icons/align-justify-svgrepo-com (1).svg',
              width: 30,
              height: 20,
            ),
          ),
        ),
      ),
    );
  }

  Drawer slidingBar(BuildContext context) {
    return Drawer(
      backgroundColor: const Color(0xFF1E1E1E),
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          const DrawerHeader(
            decoration: BoxDecoration(
              color: Colors.black,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Icon(
                  Icons.account_circle,
                  size: 50,
                  color: Colors.white,
                ),
                SizedBox(height: 10),
                Text(
                  'Mi Perfil',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          ListTile(
            leading: const Icon(Icons.music_note, color: Colors.white),
            title: const Text('Canciones', style: TextStyle(color: Colors.white)),
            onTap: () {
              Navigator.pop(context);
            },
          ),
          ListTile(
            leading: const Icon(Icons.favorite, color: Colors.white),
            title: const Text('Favoritos', style: TextStyle(color: Colors.white)),
            onTap: () {
              Navigator.pop(context);
            },
          ),
          ListTile(
            leading: const Icon(Icons.settings, color: Colors.white),
            title: const Text('Ajustes', style: TextStyle(color: Colors.white)),
            onTap: () {
              Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }
}