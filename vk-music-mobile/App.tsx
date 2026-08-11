import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
// @ts-ignore: react-native-track-player may not expose type declarations in this repo
import TrackPlayer, { useActiveTrack } from 'react-native-track-player';
import {
  searchTracks,
  downloadTrackToDevice,
  TrackSearchResult,
  LocalTrack,
} from './src/services/api';
import { getLibrary, addToLibrary, deleteTrack } from './src/services/library';
import { setupPlayer, trackFromLocalTrack } from './src/playback/setupPlayer';
import MiniPlayer from './src/components/MiniPlayer';
import NowPlayingScreen from './src/screens/NowPlayingScreen';

export default function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TrackSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [library, setLibrary] = useState<LocalTrack[]>([]);
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  const activeTrack = useActiveTrack();

  // Evita que una búsqueda vieja que responde tarde pise los resultados
  // de una búsqueda más nueva (condición de carrera).
  const searchRequestId = useRef(0);

  // Inicializar TrackPlayer y cargar la biblioteca guardada al abrir la app
  useEffect(() => {
    (async () => {
      const ok = await setupPlayer();
      setPlayerReady(ok);
      setPlayerError(!ok);
      const savedLibrary = await getLibrary();
      setLibrary(savedLibrary);
    })();
  }, []);

  // 1. Buscar las 10 opciones en la API
  const handleSearch = async () => {
    if (!query.trim()) return;

    const requestId = ++searchRequestId.current;
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await searchTracks(query);
      if (requestId === searchRequestId.current) {
        setSearchResults(results);
      }
    } catch (error: any) {
      if (requestId === searchRequestId.current) {
        Alert.alert('Error de Búsqueda', error.message || 'No se pudieron obtener resultados.');
      }
    } finally {
      if (requestId === searchRequestId.current) {
        setSearching(false);
      }
    }
  };

  // Carga una cola completa en TrackPlayer y arranca en el track elegido
  const playTrack = useCallback(
    async (track: LocalTrack, queue: LocalTrack[]) => {
      if (!playerReady) {
        Alert.alert('Reproductor no listo', 'Espera un momento e intenta de nuevo.');
        return;
      }
      await TrackPlayer.reset();
      await TrackPlayer.add(queue.map(trackFromLocalTrack));
      const index = queue.findIndex((t) => t.id === track.id);
      if (index > 0) await TrackPlayer.skip(index);
      await TrackPlayer.play();
    },
    [playerReady]
  );

  // 2. Descargar la canción elegida, guardarla en la biblioteca y reproducirla.
  //    Si ya existe en la biblioteca (mismo título), la reproduce directo
  //    en vez de volver a descargarla.
  const handleSelectAndDownload = async (item: TrackSearchResult) => {
    const alreadyDownloaded = library.find(
      (t) => t.title.trim().toLowerCase() === item.title.trim().toLowerCase()
    );
    if (alreadyDownloaded) {
      await playTrack(alreadyDownloaded, library);
      return;
    }

    setDownloadingIndex(item.index);
    setDownloadProgress(0);
    try {
      const downloadedTrack = await downloadTrackToDevice(
        query,
        item.index,
        item.title,
        setDownloadProgress
      );
      const updatedLibrary = await addToLibrary(downloadedTrack);
      setLibrary(updatedLibrary);
      await playTrack(downloadedTrack, updatedLibrary);
    } catch (error: any) {
      Alert.alert('Error de Descarga', error.message || 'No se pudo descargar el MP3.');
    } finally {
      setDownloadingIndex(null);
      setDownloadProgress(0);
    }
  };

  const confirmDelete = (track: any) => {
    Alert.alert(
      'Eliminar canción',
      `¿Deseas borrar "${track.title}" de tu dispositivo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => deleteTrack(track, library, setLibrary),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎵 VK Music App</Text>

      {playerError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            No se pudo iniciar el reproductor. Reiniciá la app.
          </Text>
        </View>
      )}

      {/* Formulario de búsqueda */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Artista o Canción..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.button} onPress={handleSearch} disabled={searching}>
          <Text style={styles.buttonText}>{searching ? '...' : 'Buscar'}</Text>
        </TouchableOpacity>
      </View>

      {searching && <ActivityIndicator size="large" color="#0088cc" style={{ marginVertical: 20 }} />}

      {/* Resultados de búsqueda */}
      {searchResults.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Resultados de búsqueda:</Text>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.index.toString()}
            style={styles.searchResultsList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultItem}
                onPress={() => handleSelectAndDownload(item)}
                disabled={downloadingIndex !== null}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>
                    {item.index}. {item.title}
                  </Text>
                  {item.duration ? <Text style={styles.resultDuration}>{item.duration}</Text> : null}
                </View>

                {downloadingIndex === item.index ? (
                  <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
                ) : (
                  <Text style={styles.downloadIcon}>⬇️</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {/* Biblioteca persistida de canciones ya descargadas */}
      <Text style={styles.sectionTitle}>Tu biblioteca:</Text>
      <FlatList
        data={library}
        keyExtractor={(item) => item.id}
        style={styles.libraryList}
        renderItem={({ item }) => {
          const isActive = activeTrack?.id === item.id;
          return (
            <View style={[styles.resultItem, isActive && styles.resultItemActive]}>
              {/* 1. Área tocable para reproducir la canción */}
              <TouchableOpacity
                style={styles.trackInfoContainer}
                onPress={() => playTrack(item, library)}
              >
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {isActive ? '▶ ' : ''}
                  {item.title}
                </Text>
              </TouchableOpacity>

              {/* 2. Botón independiente para borrar */}
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDelete(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.deleteIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyLibraryText}>Aún no descargaste canciones.</Text>}
      />

      <MiniPlayer onPress={() => setNowPlayingVisible(true)} />
      <NowPlayingScreen visible={nowPlayingVisible} onClose={() => setNowPlayingVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  errorBanner: {
    backgroundColor: '#4a1414',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  errorBannerText: { color: '#ff8a8a', fontSize: 13, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', marginBottom: 15 },
  input: { flex: 1, backgroundColor: '#1e1e1e', color: '#fff', padding: 12, borderRadius: 8, marginRight: 10 },
  button: { backgroundColor: '#0088cc', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginVertical: 10 },
  searchResultsList: { maxHeight: 220 },
  libraryList: { flex: 1 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  resultItemActive: {
    borderColor: '#0088cc',
    borderWidth: 1,
    backgroundColor: '#132a36',
  },
  resultTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  resultDuration: { color: '#888', fontSize: 12, marginTop: 2 },
  downloadIcon: { fontSize: 18 },
  progressText: { color: '#0088cc', fontSize: 13, fontWeight: 'bold', minWidth: 36, textAlign: 'right' },
  emptyLibraryText: { color: '#666' },
  trackInfoContainer: {
    flex: 1, // Toma todo el espacio disponible
    marginRight: 10, // Separación con el botón de papelera
  },
  deleteButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    fontSize: 18,
  },
});
