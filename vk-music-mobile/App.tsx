import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, FlatList, Alert } from 'react-native';
import { Share } from 'react-native';
import { Audio } from 'expo-av';
import { downloadTrackToDevice, LocalTrack } from './src/services/api';

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<LocalTrack | null>(null);
  const [tracks, setTracks] = useState<LocalTrack[]>([]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const handleSearchAndDownload = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const track = await downloadTrackToDevice(query);
      setCurrentTrack(track);
      setTracks((prev) => [track, ...prev]);
      setQuery('');
      Alert.alert('¡Éxito!', 'Canción descargada e instalada en el almacenamiento local.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al obtener el audio.');
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async (track: LocalTrack) => {
    if (sound) {
      await sound.unloadAsync();
    }
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: track.localUri },
      { shouldPlay: true }
    );
    setSound(newSound);
    setCurrentTrack(track);
    setIsPlaying(true);

    newSound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setIsPlaying(false);
      }
    });
  };

  const handleShareOrExport = async (uri: string) => {
    try {
      await Share.share({ url: uri });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo compartir el archivo.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎵 VK Music App</Text>
      <Text style={styles.subtitle}>Guarda música MP3 en tu móvil</Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Artista - Canción..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity style={styles.button} onPress={handleSearchAndDownload} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Cargando...' : 'Buscar'}</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#0088cc" style={{ marginVertical: 20 }} />}

      {currentTrack && (
        <View style={styles.playerCard}>
          <Text style={styles.trackTitle}>Reproduciendo: {currentTrack.title}</Text>
          <View style={styles.playerControls}>
            <TouchableOpacity style={styles.playButton} onPress={() => playAudio(currentTrack)}>
              <Text style={styles.buttonText}>{isPlaying ? 'Reactivar / Reproducir' : '▶️ Reproducir'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareButton} onPress={() => handleShareOrExport(currentTrack.localUri)}>
              <Text style={styles.buttonText}>📁 Exportar MP3</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Canciones en tu dispositivo:</Text>
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.trackItem}>
            <Text style={styles.itemText}>🎵 {item.title}</Text>
            <TouchableOpacity onPress={() => playAudio(item)}>
              <Text style={styles.playText}>▶️ Escuchar</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#aaa', textAlign: 'center', marginBottom: 20 },
  inputContainer: { flexDirection: 'row', marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#1e1e1e', color: '#fff', padding: 12, borderRadius: 8, marginRight: 10 },
  button: { backgroundColor: '#0088cc', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  playerCard: { backgroundColor: '#1e1e1e', padding: 16, borderRadius: 8, marginBottom: 20 },
  trackTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  playerControls: { flexDirection: 'row', justifyContent: 'space-between' },
  playButton: { backgroundColor: '#2e7d32', padding: 10, borderRadius: 6, flex: 1, marginRight: 5, alignItems: 'center' },
  shareButton: { backgroundColor: '#1565c0', padding: 10, borderRadius: 6, flex: 1, marginLeft: 5, alignItems: 'center' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
  trackItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e1e1e', padding: 12, borderRadius: 6, marginBottom: 8 },
  itemText: { color: '#fff', flex: 1 },
  playText: { color: '#4fc3f7', fontWeight: 'bold' }
});