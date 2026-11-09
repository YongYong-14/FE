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
import type { Coordinate, SelectedPlace } from '@/shared/types/location';
import type { GeoBounds, RiskArea, RiskZoneData } from '@/shared/types/map';
import { dataPeriodLabel, timeSlotLabel, weekdayLabel } from '@/shared/utils/format';
import {
  boundsAround,
  isInside,
  metersToHeightPercent,
  metersToWidthPercent,
  project,
  projectRatio,
} from '@/shared/utils/geo';

/** 지도 한 변의 절반(m). 서버는 한 변 2km까지 받는다. */
const HALF_SPAN_M = 500;
/** 법정 거리(5·10m)는 이 축척에서 점보다 작아 최소 크기로 그린다. */
const MIN_ZONE_PX = 26;

type ZoneState =
  { key: string; status: 'done'; data: RiskZoneData } | { key: string; status: 'error' };

/** 서버 좌표 구역 → 일러스트 비율 좌표. */
function toRiskAreas(data: RiskZoneData, bounds: GeoBounds, widthPx: number): RiskArea[] {
  const pxPerMeter = widthPx > 0 ? widthPx / (HALF_SPAN_M * 2) : 0;
  const facilities: RiskArea[] = data.facilityZones.map((zone, index) => {
    const center = project(zone.coordinate, bounds);
    return {
      id: `facility-${index}`,
      level: 1,
      shape: {
        kind: 'circle',
        center,
        size: Math.max(MIN_ZONE_PX, zone.radiusMeters * 2 * pxPerMeter),
      },
      badge: center,
      reportCount: 0,
    };
  });
  const cells: RiskArea[] = data.cells.map((cell, index) => {
    const { x, y } = projectRatio(cell.coordinate, bounds);
    const width = metersToWidthPercent(cell.sizeMeters, bounds);
    const height = metersToHeightPercent(cell.sizeMeters, bounds);
    return {
      id: `cell-${index}`,
      level: 2,
      shape: {
        kind: 'rect',
        rect: {
          left: `${(x - width / 2).toFixed(2)}%`,
          top: `${(y - height / 2).toFixed(2)}%`,
          width: `${width.toFixed(2)}%`,
          height: `${height.toFixed(2)}%`,
        },
      },
      badge: { left: `${x.toFixed(2)}%`, top: `${(y - height / 2).toFixed(2)}%` },
      reportCount: cell.reportCount,
    };
  });
  return [...cells, ...facilities];
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: SelectedPlace[] }
  | { status: 'error' };

/**
 * 지도 탭. 화면 범위의 1단계 구역·2단계 집중 칸(GET /map/risk-zones)과 장소 검색을 보여준다.
 * 검색으로 고른 장소로 지도 범위를 옮기며, 검색과 선택만으로 주차 분석을 시작하지 않는다.
 */
export function MapScreen() {
  const [zones, setZones] = useState<ZoneState | null>(null);
  const [widthPx, setWidthPx] = useState(0);
  const [zoneRetryKey, setZoneRetryKey] = useState(0);
  const [showCounts, setShowCounts] = useState(true);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const current: Coordinate = mapService.currentLocation();
  const center = selected?.isSupportedRegion ? selected.coordinate : current;
  // 좌표 값이 같으면 같은 범위로 본다(다시 조회하지 않음).
  const { latitude, longitude } = center;
  const bounds = boundsAround({ latitude, longitude }, HALF_SPAN_M);
  const requestKey = `${latitude},${longitude},${zoneRetryKey}`;

  useEffect(() => {
    let active = true;
    mapService
      .riskZones(boundsAround({ latitude, longitude }, HALF_SPAN_M))
      .then((data) => {
        if (active) setZones({ key: requestKey, status: 'done', data });
      })
      .catch(() => {
        // 조회 실패를 0건으로 보여주지 않는다(명세 5절).
        if (active) setZones({ key: requestKey, status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [latitude, longitude, requestKey]);

  const loaded = zones?.key === requestKey ? zones : null;
  const zoneStatus = loaded?.status ?? 'loading';
  const zoneData = loaded?.status === 'done' ? loaded.data : null;
  const areas = zoneData ? toRiskAreas(zoneData, bounds, widthPx) : [];
  const basis = zoneData
    ? zoneData.isExampleData
      ? '구역·건수는 시연용 예시 데이터예요'
      : [
          dataPeriodLabel(zoneData.dataPeriod),
          zoneData.slot
            ? `${weekdayLabel(zoneData.slot.weekday)}요일 ${timeSlotLabel(zoneData.slot.timeSlot)} 기준`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
    : null;

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
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(event) => setWidthPx(event.nativeEvent.layout.width)}
      >
        <MapIllustration style={StyleSheet.absoluteFill}>
          {areas.map((area) => (
            <RiskAreaShape key={area.id} area={area} />
          ))}
          {showCounts
            ? areas
                .filter((area) => area.level === 2 && area.reportCount > 0)
                .map((area) => (
                  <CountBubble key={`c-${area.id}`} point={area.badge} count={area.reportCount} />
                ))
            : null}
          {isInside(current, bounds) ? <LocationDot point={project(current, bounds)} /> : null}
          {selected && isInside(selected.coordinate, bounds) ? (
            <PlacePin point={project(selected.coordinate, bounds)} label={selected.name} />
          ) : null}
        </MapIllustration>
      </View>

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
              {selected.address}
            </AppText>
            <AppText variant="caption" tone="body">
              {selected.isSupportedRegion
                ? '주변 1단계 구역과 신고 이력을 지도에서 확인하세요. 검색만으로 주차 분석은 시작하지 않아요.'
                : '용인시 밖이에요. 이 지역은 위험 정보를 제공하지 않아요.'}
            </AppText>
          </View>
        ) : null}
        {zoneStatus === 'error' ? (
          <View style={styles.zoneError} accessibilityRole="alert">
            <AppText variant="caption" weight="bold" style={styles.flex}>
              위험 구역을 불러오지 못했어요
            </AppText>
            <Pressable
              onPress={() => setZoneRetryKey((key) => key + 1)}
              hitSlop={8}
              accessibilityRole="button"
            >
              <AppText variant="caption" weight="bold" tone="primary">
                다시 시도
              </AppText>
            </Pressable>
          </View>
        ) : null}
        <AppText variant="micro" tone="secondary" style={styles.note}>
          {zoneStatus === 'loading'
            ? '위험 구역을 불러오고 있어요'
            : basis
              ? `${basis} · 칸이 없다고 안전하다는 뜻은 아니에요`
              : ' '}
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
  note: { alignSelf: 'center', minHeight: touchTarget / 3, textAlign: 'center' },
  zoneError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
});
