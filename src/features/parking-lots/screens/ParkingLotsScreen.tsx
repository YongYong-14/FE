import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ParkingLotSortDropdown } from '../components/ParkingLotSortDropdown';
import { ParkingLotCard } from '../components/ParkingLotCard';
import { sortParkingLots, type ParkingLotSort } from '../utils/sortParkingLots';
import { filterParkingLots } from '../utils/parkingLotVisibility';
import { useSession } from '@/features/auth';
import { useParking } from '@/features/parking';
import { isApiError, mapService, parkingLotService } from '@/services';
import { useDeviceLocation } from '@/shared/hooks/useDeviceLocation';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { StateView } from '@/shared/components/StateView';
import { MapBottomSheet, type MapBottomSheetHandle } from '@/shared/components/MapBottomSheet';
import { CoordinateMap } from '@/shared/map/CoordinateMap';
import { LotPin } from '@/shared/map/MapMarkers';
import { colors, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';
import type { ParkingLot } from '@/shared/types/map';

type Radius = 500 | 1000;
type LoadError = 'consent' | 'failed' | null;

// 시트 손잡이 + 반경·정렬 줄 + 필터 줄. 접힘에서는 여기까지, 중간에서는 주차장 두 곳까지 보인다.
const SHEET_HEADER_HEIGHT = touchTarget + touchTarget + spacing.md + 36 + spacing.md;
/** 접힌 주차장 한 줄의 높이(ParkingLotCard의 최소 높이 + 위아래 여백). */
const LOT_ROW_HEIGHT = 96;

const distanceText = (lot: ParkingLot) => `${Math.round(lot.distanceMeters)}m`;
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[styles.chip, selected && styles.chipSelected]}
      hitSlop={4}
    >
      <AppText
        variant="label"
        weight="bold"
        style={{ color: selected ? colors.inverse : colors.ink }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * 주변 주차장(GET /parking-lots/nearby). 최근 주차 위치(없으면 현재 위치) 기준 직선 거리순이다.
 * 500m 안에 없으면 서버가 1km까지 넓혀 찾는다. 운영 중·공영·유료 필터는 앱이 응답으로 거른다.
 * 공유는 OS 공유 창, 길안내·외부 검색은 카카오 지도 링크로 연다.
 */
export function ParkingLotsScreen() {
  const insets = useSafeAreaInsets();
  const safeHorizontalPadding = {
    paddingLeft: spacing.xl + insets.left,
    paddingRight: spacing.xl + insets.right,
  };
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const sheet = useRef<MapBottomSheetHandle>(null);
  const lotOffsets = useRef(new Map<string, number>());
  const pendingPinId = useRef<string | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const scrollToPinnedLot = useCallback(() => {
    if (!pendingPinId.current) return;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const y = pendingPinId.current ? lotOffsets.current.get(pendingPinId.current) : undefined;
      if (y !== undefined) list.current?.scrollTo({ y, animated: true });
    });
  }, []);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );
  const { requireAgreement } = useSession();
  const { records, latest } = useParking();
  const parkedAt =
    latest?.coordinate ?? records.find((record) => record.place.coordinate)?.place.coordinate;
  const gps = useDeviceLocation(!parkedAt);
  const origin = parkedAt ?? gps.coordinate ?? mapService.currentLocation();
  const missingLocation = !parkedAt && !gps.coordinate;
  const [radius, setRadius] = useState<Radius>(500);
  const [openOnly, setOpenOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [recenterKey, setRecenterKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      const refreshTime = () => setNow(Date.now());
      refreshTime();
      // 탭에 들어올 때마다 지도를 기준 위치 가운데로 되돌린다. 그 뒤 사용자가 옮긴 위치는 유지한다.
      setRecenterKey((key) => key + 1);
      const timer = setInterval(refreshTime, 30_000);
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') refreshTime();
      });
      return () => {
        clearInterval(timer);
        listener.remove();
      };
    }, []),
  );
  const [publicOnly, setPublicOnly] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);
  const [sort, setSort] = useState<ParkingLotSort>('distance');
  const [lots, setLots] = useState<ParkingLot[]>([]);
  /** 500m에 없어 서버가 1km까지 넓혀 찾은 주차장 수. 500m 빈 화면의 안내에만 쓴다. */
  const [widerCount, setWiderCount] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** 접힌 상태의 첫 두 주차장 줄 높이와, 안내 문구만 있을 때의 내용 높이. 시트 기본 높이를 여기에 맞춘다. */
  const [rowHeights, setRowHeights] = useState<[number, number]>([LOT_ROW_HEIGHT, LOT_ROW_HEIGHT]);
  const [noticeHeight, setNoticeHeight] = useState(LOT_ROW_HEIGHT * 2);
  const { latitude, longitude } = origin;
  const requestKey = `${latitude},${longitude},${radius},${reloadKey}`;

  useEffect(() => {
    if (missingLocation) return;
    let active = true;
    parkingLotService
      .search({ latitude, longitude }, radius)
      .then((result) => {
        if (!active) return;
        // 서버는 500m에 없으면 1km까지 넓혀 돌려준다. 500m를 고른 화면에는 500m 안의 결과만 보여 준다.
        setLots(
          radius === 500 ? result.lots.filter((lot) => lot.distanceMeters <= 500) : result.lots,
        );
        setWiderCount(radius === 500 && result.expanded ? result.lots.length : null);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(isApiError(cause, 'LOCATION_CONSENT_REQUIRED') ? 'consent' : 'failed');
        setLoadedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [latitude, longitude, radius, requestKey, missingLocation]);

  const loading = loadedKey !== requestKey;
  const visible = useMemo(
    () =>
      sortParkingLots(
        filterParkingLots(lots, { openOnly, publicOnly, paidOnly }, new Date(now)),
        sort,
      ),
    [lots, now, openOnly, publicOnly, paidOnly, sort],
  );
  useEffect(scrollToPinnedLot, [expandedId, visible, scrollToPinnedLot]);
  const selected = visible.find((lot) => lot.id === selectedId) ?? visible[0];
  const filtered = openOnly || publicOnly || paidOnly;
  function resetFilters() {
    pendingPinId.current = null;
    setOpenOnly(false);
    setPublicOnly(false);
    setPaidOnly(false);
    setExpandedId(null);
  }
  async function openMap(lot?: ParkingLot) {
    try {
      setActionError(null);
      const url = lot
        ? `https://map.kakao.com/link/to/${encodeURIComponent(lot.name)},${lot.coordinate.latitude},${lot.coordinate.longitude}`
        : `https://map.kakao.com/link/search/${encodeURIComponent('주차장')}`;
      await Linking.openURL(url);
    } catch {
      setActionError('지도 앱을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }
  async function share(lot: ParkingLot) {
    try {
      setActionError(null);
      await Share.share({
        message: `${lot.name}\n${lot.address}\nhttps://map.kakao.com/link/map/${encodeURIComponent(lot.name)},${lot.coordinate.latitude},${lot.coordinate.longitude}`,
      });
    } catch {
      setActionError('공유 창을 열지 못했어요. 다시 시도해 주세요.');
    }
  }

  function changeRadius(next: Radius) {
    if (next === radius) return;
    setRadius(next);
    pendingPinId.current = null;
    setSelectedId(null);
    setExpandedId(null);
  }

  // 기본 높이에서는 주차장 두 곳이 잘리지 않고 보이고, 더 있으면 목록을 내려서 본다.
  const showingLots = !missingLocation && !loading && !error && visible.length > 0;
  const listPeek = showingLots
    ? rowHeights[0] + (visible.length > 1 ? rowHeights[1] : 0)
    : noticeHeight + spacing.xl;

  return (
    <View style={styles.root}>
      <MapBottomSheet
        ref={sheet}
        accessibilityLabel="주변 주차장 패널 높이"
        collapsedHeight={SHEET_HEADER_HEIGHT}
        middleHeight={SHEET_HEADER_HEIGHT + listPeek}
        coverScreen
        onCollapse={() => list.current?.scrollTo({ y: 0, animated: false })}
        map={
          <CoordinateMap
            coordinate={missingLocation ? null : origin}
            zoom={radius === 500 ? 16 : 15}
            fit={showingLots ? visible.map((lot) => lot.coordinate) : undefined}
            recenterKey={recenterKey}
          >
            {(projector) =>
              !missingLocation && !loading && !error
                ? visible.map((lot) => {
                    const point = projector.toScreen(lot.coordinate);
                    return (
                      <LotPin
                        key={lot.id}
                        point={{ left: point.x, top: point.y }}
                        selected={lot.id === selected?.id}
                        caption={distanceText(lot)}
                        label={`${lot.name}, 직선 거리 ${distanceText(lot)}`}
                        onPress={() => {
                          pendingPinId.current = lot.id;
                          setSelectedId(lot.id);
                          setExpandedId(lot.id);
                          sheet.current?.reveal();
                          scrollToPinnedLot();
                        }}
                      />
                    );
                  })
                : null
            }
          </CoordinateMap>
        }
      >
        <View style={styles.sheetContent}>
          <View style={[styles.headerRow, safeHorizontalPadding]}>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {([500, 1000] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => changeRadius(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: radius === value }}
                  style={[styles.segmentItem, radius === value && styles.segmentSelected]}
                >
                  <AppText
                    variant="label"
                    weight="bold"
                    style={{ color: radius === value ? colors.ink : colors.textSecondary }}
                  >
                    {value === 500 ? '500m' : '1km'}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <ParkingLotSortDropdown
              value={sort}
              onChange={(next) => {
                if (next === sort) return;
                pendingPinId.current = null;
                setSort(next);
                setSelectedId(null);
                setExpandedId(null);
                list.current?.scrollTo({ y: 0, animated: false });
              }}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.chips, safeHorizontalPadding]}
            style={styles.chipScroll}
          >
            <Chip
              label="운영 중"
              selected={openOnly}
              onPress={() => {
                setOpenOnly((value) => !value);
                pendingPinId.current = null;
                setExpandedId(null);
              }}
            />
            <Chip
              label="공영"
              selected={publicOnly}
              onPress={() => {
                setPublicOnly((value) => !value);
                pendingPinId.current = null;
                setExpandedId(null);
              }}
            />
            <Chip
              label="유료"
              selected={paidOnly}
              onPress={() => {
                setPaidOnly((value) => !value);
                pendingPinId.current = null;
                setExpandedId(null);
              }}
            />
          </ScrollView>

          <ScrollView
            ref={list}
            style={styles.list}
            contentContainerStyle={[styles.listContent, safeHorizontalPadding]}
            onContentSizeChange={scrollToPinnedLot}
            persistentScrollbar
            onScrollBeginDrag={() => {
              pendingPinId.current = null;
            }}
            onTouchStart={() => {
              pendingPinId.current = null;
            }}
          >
            {!showingLots ? (
              <View onLayout={(event) => setNoticeHeight(event.nativeEvent.layout.height)}>
                {missingLocation ? (
                  <StateView
                    compact
                    loading={gps.loading}
                    icon="location-outline"
                    title={
                      gps.loading ? '현재 위치를 확인하고 있어요' : '현재 위치를 확인해 주세요'
                    }
                    description={gps.error ?? '위치 권한과 휴대폰 GPS를 확인해 주세요.'}
                    actions={
                      <Button
                        label="위치 다시 확인"
                        variant="outline"
                        size="md"
                        onPress={() => void gps.refresh()}
                      />
                    }
                  />
                ) : loading ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : error === 'consent' ? (
                  <StateView
                    compact
                    icon="location-outline"
                    title="위치기반서비스 동의가 필요해요"
                    description="주변 주차장을 찾으려면 위치기반서비스 이용약관에 동의해 주세요."
                    actions={
                      <Button
                        label="동의하러 가기"
                        size="md"
                        onPress={() => void requireAgreement('LOCATION_SERVICE')}
                      />
                    }
                  />
                ) : error ? (
                  <StateView
                    compact
                    icon="alert-circle-outline"
                    title="주차장을 불러오지 못했어요"
                    description="잠시 후 다시 시도해 주세요."
                    actions={
                      <Button
                        label="다시 시도"
                        variant="outline"
                        size="md"
                        onPress={() => setReloadKey((key) => key + 1)}
                      />
                    }
                  />
                ) : visible.length === 0 ? (
                  radius === 500 ? (
                    <StateView
                      compact
                      icon="car-outline"
                      title={
                        lots.length > 0
                          ? '500m 안에 조건에 맞는\n주차장이 없어요'
                          : '500m 안에 주차장이 없어요'
                      }
                      description={
                        lots.length > 0
                          ? '필터를 바꾸거나 반경을 1km로 넓혀 보세요.'
                          : widerCount
                            ? `1km로 넓히면 ${widerCount}곳을 볼 수 있어요.`
                            : '반경을 1km로 넓혀 다시 찾아보세요.'
                      }
                      actions={
                        <>
                          {filtered && lots.length > 0 ? (
                            <Button label="필터 초기화" size="md" onPress={resetFilters} />
                          ) : null}
                          <Button
                            label="1km로 넓히기"
                            size="md"
                            variant={filtered && lots.length > 0 ? 'outline' : 'primary'}
                            onPress={() => changeRadius(1000)}
                          />
                        </>
                      }
                    />
                  ) : (
                    <StateView
                      compact
                      icon="car-outline"
                      title={
                        // 서버 결과 자체가 비었는지, 앱 필터로 비었는지 구분한다(명세 5절).
                        lots.length > 0 && openOnly
                          ? '반경 1km 안에 지금 운영 중인\n주차장이 없어요'
                          : lots.length > 0
                            ? '반경 1km 안에 조건에 맞는\n주차장이 없어요'
                            : '반경 1km 안에 주차장이 없어요'
                      }
                      description={
                        lots.length > 0
                          ? '필터를 바꾸거나 지도 앱에서 더 넓은 범위를 찾아보세요.'
                          : '지도 앱에서 더 넓은 범위를 찾아보세요.'
                      }
                      actions={
                        <>
                          {filtered && lots.length > 0 ? (
                            <Button
                              label="필터 초기화"
                              size="md"
                              onPress={() => {
                                resetFilters();
                              }}
                            />
                          ) : null}
                          <Button
                            label="지도 앱에서 찾기"
                            variant="outline"
                            size="md"
                            onPress={() => void openMap()}
                          />
                        </>
                      }
                    />
                  )
                ) : null}
              </View>
            ) : (
              <>
                {visible.map((lot, index) => (
                  <View
                    key={lot.id}
                    onLayout={(event) => {
                      const { y, height } = event.nativeEvent.layout;
                      lotOffsets.current.set(lot.id, y);
                      // 상세를 펼친 줄은 기본 높이 계산에서 뺀다.
                      if (index < 2 && expandedId !== lot.id) {
                        setRowHeights((previous) => {
                          if (Math.abs((previous[index] ?? 0) - height) < 0.5) return previous;
                          const next: [number, number] = [previous[0], previous[1]];
                          next[index] = height;
                          return next;
                        });
                      }
                      if (pendingPinId.current === lot.id) scrollToPinnedLot();
                    }}
                  >
                    <ParkingLotCard
                      lot={lot}
                      selected={lot.id === selected?.id}
                      last={index === visible.length - 1}
                      expanded={expandedId === lot.id}
                      onToggle={() => {
                        pendingPinId.current = null;
                        setSelectedId(lot.id);
                        setExpandedId((previous) => (previous === lot.id ? null : lot.id));
                      }}
                      onShare={() => void share(lot)}
                      onRoute={() => void openMap(lot)}
                    />
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </MapBottomSheet>

      {actionError ? (
        <View
          style={[
            styles.actionError,
            { left: spacing.xl + insets.left, right: spacing.xl + insets.right },
          ]}
        >
          <AppText variant="caption" tone="danger">
            {actionError}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  flex: { flex: 1 },
  sheetContent: { flex: 1, gap: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  chipScroll: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: 'center' },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  segment: {
    flexDirection: 'row',
    padding: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  segmentItem: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  segmentSelected: { backgroundColor: colors.surface, boxShadow: shadows.raised },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  loading: { height: LOT_ROW_HEIGHT * 2, alignItems: 'center', justifyContent: 'center' },
  actionError: {
    position: 'absolute',
    top: '25%',
    left: spacing.xl,
    right: spacing.xl,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
});
