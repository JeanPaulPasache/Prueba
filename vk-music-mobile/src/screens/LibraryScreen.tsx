import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LocalTrack } from '../services/api';
import { colors, spacing, radii, typography } from '../utils/theme';

interface LibraryScreenProps {
  library: LocalTrack[];
  activeTrackId?: string | null;
  onPlayTrack: (track: LocalTrack) => void;
  onDeleteTrack: (track: LocalTrack) => void;
  onGoToSearch: () => void;
}

export default function LibraryScreen({
  library,
  activeTrackId,
  onPlayTrack,
  onDeleteTrack,
  onGoToSearch,
}: LibraryScreenProps) {
  const confirmDelete = (track: LocalTrack) => {
    Alert.alert('Eliminar canción', `¿Deseas borrar "${track.title}" de tu dispositivo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => onDeleteTrack(track),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.sectionLabel}>Tu biblioteca</Text>
        <TouchableOpacity style={styles.searchButton} onPress={onGoToSearch} activeOpacity={0.75}>
          <Feather name="search" size={14} color={colors.textPrimary} />
          <Text style={styles.searchButtonText}>Buscar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={library}
        keyExtractor={(item) => item.id}
        style={styles.libraryList}
        contentContainerStyle={{ paddingBottom: spacing.md }}
        renderItem={({ item }) => {
          const isActive = activeTrackId === item.id;
          return (
            <View style={[styles.resultItem, isActive && styles.resultItemActive]}>
              <TouchableOpacity
                style={styles.trackInfoContainer}
                onPress={() => onPlayTrack(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.trackIconWrap, isActive && styles.trackIconWrapActive]}>
                  <Feather
                    name={isActive ? 'volume-2' : 'music'}
                    size={14}
                    color={isActive ? colors.accent : colors.textSecondary}
                  />
                </View>
                <Text
                  style={[typography.itemTitle, isActive && styles.trackTitleActive]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDelete(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="trash-2" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Feather name="music" size={22} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyLibraryText}>Aún no descargaste canciones.</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={onGoToSearch} activeOpacity={0.85}>
              <Feather name="search" size={14} color={colors.textPrimary} />
              <Text style={styles.emptyCtaText}>Buscar tu primera canción</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  searchButtonText: { color: colors.textPrimary, fontWeight: '600', fontSize: 13 },
  libraryList: { flex: 1 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.xs,
  },
  resultItemActive: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  trackInfoContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm },
  trackIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  trackIconWrapActive: { backgroundColor: colors.surface },
  trackTitleActive: { color: colors.textPrimary },
  deleteButton: { padding: spacing.xs, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: spacing.xxl + spacing.lg },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyLibraryText: { color: colors.textSecondary, marginBottom: spacing.lg, fontSize: 14 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
  },
  emptyCtaText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
});
