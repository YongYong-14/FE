import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { placeService } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, fonts, radii, spacing, touchTarget } from '@/shared/theme/tokens';
import type { SelectedPlace } from '@/shared/types/location';

/**
 * GPS를 받지 못했을 때 공통 예시 장소에서 위치를 고른다.
 * 지도·검색 담당의 공통 검색 컴포넌트가 생기면 교체할 연결 지점이다.
 */
export function ManualPlacePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (place: SelectedPlace) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SelectedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      void placeService
        .search(query)
        .then((items) => {
          if (!active) return;
          setResults(items);
          setError(false);
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <View style={styles.wrap}>
      <View style={styles.search}>
        <Icon name="search" color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setLoading(true);
          }}
          placeholder="장소 이름이나 주소로 찾기"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          accessibilityLabel="장소 검색"
          returnKeyType="search"
        />
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {!loading && error ? (
        <AppText variant="caption" tone="danger" accessibilityRole="alert">
          장소를 불러오지 못했어요. 검색어를 바꿔 다시 시도해 주세요.
        </AppText>
      ) : null}
      {!loading && !error && results.length === 0 ? (
        <AppText variant="caption" tone="secondary">
          검색 결과가 없어요. 다른 이름이나 주소로 찾아보세요.
        </AppText>
      ) : null}
      {!loading &&
        results.map((place) => {
          const selected = place.id === selectedId;
          return (
            <Pressable
              key={place.id}
              onPress={() => onSelect(place)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              style={[styles.row, selected && styles.rowSelected]}
            >
              <View style={styles.flex}>
                <AppText variant="label" weight="bold">
                  {place.name}
                </AppText>
                <AppText variant="micro" tone="secondary">
                  {place.address}
                </AppText>
              </View>
              {selected ? <Icon name="checkmark-circle" color={colors.primary} size="lg" /> : null}
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 10,
  },
  loading: { paddingVertical: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowSelected: {
    borderColor: colors.primary,
    borderWidth: 1.6,
    backgroundColor: colors.primarySoft,
  },
  flex: { flex: 1 },
});
