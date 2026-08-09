import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Audio } from 'expo-av';
import { searchOnline, getAudioStream } from './src/services/api';
import type { SearchResult } from './src/types';

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  async function handleSearch() {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);

    try {
      const data = await searchOnline(query);
      setResults(data);
    } catch (err) {
      setError('Error al conectar con la API en Render.');
    } finally {
      setIsSearching(false);
    }
  }

  async function playTrack(item: SearchResult) {
    setLoadingTrackId(item.id);
    setError(null);

    try {
      const streamData = await getAudioStream(item.webpage_url);

      if (sound) {
        await sound.unloadAsync();
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: streamData.audio_url },
        { shouldPlay: true }
      );

      setSound(newSound);
      setIsPlaying(true);
      setCurrentTitle(streamData.title);
    } catch (err) {
      setError('No se pudo obtener o reproducir este audio.');
    } finally {
      setLoadingTrackId(null);
    }
  }

  async function togglePlayPause() {
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  }

  function formatDuration(seconds?: number): string {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      <Text style={styles.header}>VK Music Mobile</Text>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Buscar canción o artista..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={isSearching}>
          {isSearching ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Buscar</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isLoadingThis = loadingTrackId === item.id;
          return (
            <View style={styles.trackCard}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.trackSubtitle}>
                  {item.uploader || 'Artista'} • {formatDuration(item.duration)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.playButton}
                onPress={() => playTrack(item)}
                disabled={isLoadingThis}
              >
                {isLoadingThis ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>▶ Sonar</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {currentTitle && (
        <View style={styles.nowPlayingBar}>
          <Text style={styles.nowPlayingText} numberOfLines={1}>
            {currentTitle}
          </Text>
          <TouchableOpacity style={styles.controlButton} onPress={togglePlayPause}>
            <Text style={styles.buttonText}>{isPlaying ? '⏸ Pausa' : '▶ Play'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 20 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#fff', paddingHorizontal: 16, marginBottom: 16 },
  searchContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchButton: { backgroundColor: '#2563eb', paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  errorText: { color: '#ef4444', paddingHorizontal: 16, marginBottom: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  trackCard: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  trackSubtitle: { color: '#aaa', fontSize: 12, marginTop: 4 },
  playButton: { backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  nowPlayingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#222',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nowPlayingText: { color: '#fff', flex: 1, marginRight: 12, fontWeight: '500' },
  controlButton: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
});