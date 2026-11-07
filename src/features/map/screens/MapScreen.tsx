import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { mapService, placeService } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { IconButton } from '@/shared/components/IconButton';
import { MapIllustration } from '@/shared/map/MapIllustration';
import { CountBubble, LocationDot, PlacePin, RiskAreaShape } from '@/shared/map/MapMarkers';
import { colors, fonts, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';
import type { SelectedPlace } from '@/shared/types/location';
import type { RiskArea } from '@/shared/types/map';

/** 검색으로 고른 장소를 표시할 일러스트 위 위치(시연용 고정 위치). */
const PLACE_POINT = { left: '72%', top: '64%' } as const;

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: SelectedPlace[] }
  | { status: 'error' };

/**
 * 지도 탭. 예시 위험 구역·신고 건수·장소 검색을 보여준다.
 * 검색과 선택만으로 주차 분석을 시작하지 않는다.
 */
export function MapScreen() {
  const [areas, setAreas] = useState<RiskArea[]>([]);
  const [showCounts, setShowCounts] = useState(true);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    void mapService.listRiskAreas().then((items) => {
      if (active) setAreas(items);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) return;
    let active = true;
    const timeout = setTimeout(() => {
      placeService
        .search(keyword)
        .then((results) => {
          if (active) setSearch({ status: 'done', results });
        })
        .catch(() => {
          if (active) setSearch({ status: 'error' });
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, retryKey]);

  function changeQuery(text: string) {
    setQuery(text);
    setSearch(text.trim() ? { status: 'loading' } : { status: 'idle' });
  }

  function choose(place: SelectedPlace) {
    setSelected(place);
    setQuery(place.name);
    setFocused(false);
    Keyboard.dismiss();
  }

  function clear() {
    setQuery('');
    setSearch({ status: 'idle' });
    setSelected(null);
  }

  const showResults = focused && query.trim().length > 0 && !selected;

  return (
    <View style={styles.root}>
      <MapIllustration style={StyleSheet.absoluteFill}>
        {areas.map((area) => (
          <RiskAreaShape key={area.id} area={area} />
        ))}
        {showCounts
          ? areas.map((area) => (
              <CountBubble key={`c-${area.id}`} point={area.badge} count={area.reportCount} />
            ))
          : null}
        <LocationDot point={mapService.currentLocation()} />
        {selected ? <PlacePin point={PLACE_POINT} label={selected.name} /> : null}
      </MapIllustration>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.searchBar}>
          <Icon name="search" color={colors.ink} size={18} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setSelected(null);
              changeQuery(text);
            }}
            onFocus={() => setFocused(true)}
            placeholder="어디에 주차하시나요?"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            returnKeyType="search"
            accessibilityLabel="장소 이름이나 주소 검색"
          />
          {query ? (
            <Pressable
              onPress={clear}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
            >
              <Icon name="close" color={colors.textSecondary} size={22} />
            </Pressable>
          ) : null}
        </View>

        {showResults ? (
          <View style={styles.results}>
            {search.status === 'loading' ? (
              <View style={styles.resultState}>
                <ActivityIndicator color={colors.primary} />
                <AppText variant="caption" tone="secondary">
                  찾고 있어요
                </AppText>
              </View>
            ) : search.status === 'error' ? (
              <View style={styles.resultState}>
                <AppText variant="caption" tone="danger" style={styles.flex}>
                  장소를 불러오지 못했어요.
                </AppText>
                <Pressable
                  onPress={() => {
                    setSearch({ status: 'loading' });
                    setRetryKey((key) => key + 1);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <AppText variant="caption" weight="bold" tone="primary">
                    다시 시도
                  </AppText>
                </Pressable>
              </View>
            ) : search.status === 'done' && search.results.length === 0 ? (
              <View style={styles.resultStateColumn}>
                <AppText variant="label" weight="bold">
                  검색 결과가 없어요
                </AppText>
                <AppText variant="caption" tone="secondary">
                  용인시 안의 다른 장소 이름이나 주소로 찾아보세요.
                </AppText>
              </View>
            ) : search.status === 'done' ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultList}>
                {search.results.map((place) => (
                  <Pressable
                    key={place.id}
                    onPress={() => choose(place)}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                    style={styles.resultRow}
                    accessibilityRole="button"
                  >
                    <Icon name="location-outline" color={colors.textSecondary} />
                    <View style={styles.flex}>
                      <AppText variant="label" weight="bold">
                        {place.name}
                      </AppText>
                      <AppText variant="micro" tone="secondary">
                        {place.address}
                      </AppText>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : (
          <View style={styles.toggle}>
            <AppText variant="caption" weight="bold">
              신고 건수
            </AppText>
            <Switch
              value={showCounts}
              onValueChange={setShowCounts}
              trackColor={{ true: colors.primary, false: colors.line }}
              thumbColor={colors.surface}
              accessibilityLabel="신고 건수 표시"
            />
          </View>
        )}
      </SafeAreaView>

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.bottomRow} pointerEvents="box-none">
          <View
            style={styles.legend}
            accessible
            accessibilityLabel="범례. 빨강은 1단계 구역, 주황은 2단계 신고 집중 구역"
          >
            <LegendItem color={colors.danger} label="1단계 구역" />
            <LegendItem color={colors.warning} label="2단계 신고 집중" />
          </View>
          <IconButton name="locate" label="현재 위치로 이동" onPress={clear} floating />
        </View>
        {selected ? (
          <View style={styles.placeCard} accessibilityLiveRegion="polite">
            <AppText variant="subtitle" weight="bold">
              {selected.name}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {selected.address} · 예시 위치
            </AppText>
            <AppText variant="caption" tone="body">
              {selected.isSupportedRegion
                ? '주변 1단계 구역과 신고 이력을 지도에서 확인하세요. 검색만으로 주차 분석은 시작하지 않아요.'
                : '용인시 밖이에요. 이 지역은 위험 정보를 제공하지 않아요.'}
            </AppText>
          </View>
        ) : null}
        <AppText variant="micro" tone="secondary" style={styles.note}>
          구역·건수는 시연용 예시 데이터예요
        </AppText>
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { borderColor: color, backgroundColor: `${color}40` }]} />
      <AppText variant="micro" weight="bold">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
  flex: { flex: 1 },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  searchBar: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 52,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: '0px 4px 14px rgba(0,0,0,0.14)',
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 12,
  },
  toggle: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: '0px 3px 10px rgba(0,0,0,0.10)',
  },
  results: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
    overflow: 'hidden',
  },
  resultList: { maxHeight: 300 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  resultState: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  resultStateColumn: { gap: spacing.xs, padding: spacing.lg },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.md,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    minHeight: 36,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: '0px 3px 12px rgba(0,0,0,0.14)',
    flexShrink: 1,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 1.2 },
  placeCard: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  note: { alignSelf: 'center', minHeight: touchTarget / 3 },
});
