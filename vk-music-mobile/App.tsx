import React, { useState, useEffect, useCallback } from 'react';
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
import TrackPlayer from 'react-native-track-player';
import {
  searchTracks,
  downloadTrackToDevice,
  TrackSearchResult,
  LocalTrack,
} from './src/services/api';
import { getLibrary, addToLibrary } from './src/services/library';
import { setupPlayer, trackFromLocalTrack } from './src/playback/setupPlayer';
import MiniPlayer from './src/components/MiniPlayer';
import NowPlayingScreen from './src/screens/NowPlayingScreen';

export default function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TrackSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [library, setLibrary] = useState<LocalTrack[]>([]);
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  // Inicializar TrackPlayer y cargar la biblioteca guardada al abrir la app
  useEffect(() => {
    (async () => {
      const ok = await setupPlayer();
      setPlayerReady(ok);
      const savedLibrary = await getLibrary();
      setLibrary(savedLibrary);
    })();
  }, []);

  // 1. Buscar las 10 opciones en la API (sin cambios)
  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setSearchResults([]);
    try {
      const results = await searchTracks(query);
      setSearchResults(results);
    } catch (error: any) {
      Alert.alert('Error de Búsqueda', error.message || 'No se pudieron obtener resultados.');
    } finally {
      setSearching(false);
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

  // 2. Descargar la canción elegida, guardarla en la biblioteca y reproducirla
  const handleSelectAndDownload = async (item: TrackSearchResult) => {
    setDownloadingIndex(item.index);
    try {
      const downloadedTrack = await downloadTrackToDevice(query, item.index, item.title);
      const updatedLibrary = await addToLibrary(downloadedTrack);
      setLibrary(updatedLibrary);
      await playTrack(downloadedTrack, updatedLibrary);
    } catch (error: any) {
      Alert.alert('Error de Descarga', error.message || 'No se pudo descargar el MP3.');
    } finally {
      setDownloadingIndex(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎵 VK Music App</Text>

      {/* Formulario de búsqueda */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Artista o Canción..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
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
            style={{ maxHeight: 220 }}
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
                  <ActivityIndicator size="small" color="#0088cc" />
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
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.resultItem} onPress={() => playTrack(item, library)}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {item.title}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: '#666' }}>Aún no descargaste canciones.</Text>}
      />

      <MiniPlayer onPress={() => setNowPlayingVisible(true)} />
      <NowPlayingScreen visible={nowPlayingVisible} onClose={() => setNowPlayingVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  inputContainer: { flexDirection: 'row', marginBottom: 15 },
  input: { flex: 1, backgroundColor: '#1e1e1e', color: '#fff', padding: 12, borderRadius: 8, marginRight: 10 },
  button: { backgroundColor: '#0088cc', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginVertical: 10 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  resultTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  resultDuration: { color: '#888', fontSize: 12, marginTop: 2 },
  downloadIcon: { fontSize: 18 },
});
