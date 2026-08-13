import React, { useState, useRef } from 'react';
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
import { Feather } from '@expo/vector-icons';
import { searchTracks, downloadTrackToDevice, TrackSearchResult, LocalTrack } from '../services/api';
import { addToLibrary } from '../services/library';
import { colors, spacing, radii, typography } from '../utils/theme';

interface SearchScreenProps {
  library: LocalTrack[];
  onLibraryUpdate: (library: LocalTrack[]) => void;
  onPlayTrack: (track: LocalTrack, queue: LocalTrack[]) => Promise<void>;
  onGoBack: () => void;
}

export default function SearchScreen({ library, onLibraryUpdate, onPlayTrack, onGoBack }: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TrackSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Evita que una búsqueda vieja que responde tarde pise los resultados
  // de una búsqueda más nueva (condición de carrera).
  const searchRequestId = useRef(0);

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

  const handleSelectAndDownload = async (item: TrackSearchResult) => {
    const alreadyDownloaded = library.find(
      (t) => t.title.trim().toLowerCase() === item.title.trim().toLowerCase()
    );
    if (alreadyDownloaded) {
      await onPlayTrack(alreadyDownloaded, library);
      onGoBack();
      return;
    }

    setDownloadingIndex(item.index);
    setDownloadProgress(0);
    try {
      const downloadedTrack = await downloadTrackToDevice(query, item.index, item.title, setDownloadProgress);
      const updatedLibrary = await addToLibrary(downloadedTrack);
      onLibraryUpdate(updatedLibrary);
      await onPlayTrack(downloadedTrack, updatedLibrary);
      onGoBack();
    } catch (error: any) {
      Alert.alert('Error de Descarga', error.message || 'No se pudo descargar el MP3.');
    } finally {
      setDownloadingIndex(null);
      setDownloadProgress(0);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onGoBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={18} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>Biblioteca</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Feather name="search" size={16} color={colors.textTertiary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Artista o Canción..."
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoFocus
        />
        <TouchableOpacity style={styles.button} onPress={handleSearch} disabled={searching} activeOpacity={0.85}>
          {searching ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={typography.button}>Buscar</Text>
          )}
        </TouchableOpacity>
      </View>

      {searchResults.length > 0 && (
        <>
          <Text style={[typography.sectionLabel, { marginBottom: spacing.sm }]}>Resultados</Text>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.index.toString()}
            style={styles.searchResultsList}
            renderItem={({ item }) => {
              const isDownloading = downloadingIndex === item.index;
              return (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => handleSelectAndDownload(item)}
                  disabled={downloadingIndex !== null}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, marginRight: spacing.md }}>
                    <Text style={typography.itemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.duration ? <Text style={typography.itemMeta}>{item.duration}</Text> : null}

                    {isDownloading && (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
                      </View>
                    )}
                  </View>

                  {isDownloading ? (
                    <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
                  ) : (
                    <View style={styles.downloadIconWrap}>
                      <Feather name="download" size={15} color={colors.accent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { marginBottom: spacing.lg },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginLeft: spacing.xs },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  inputIcon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    paddingLeft: spacing.xl + spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.md,
    marginRight: spacing.sm,
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    minWidth: 78,
  },
  searchResultsList: { flex: 1 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  downloadIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: { color: colors.accent, fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.pill,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
});
