import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
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
import { GeoMap, TILE_ATTRIBUTION, TILE_ATTRIBUTION_URL } from '@/shared/map/GeoMap';
import {
  CountBubble,
  countBubbleSize,
  LocationDot,
  PlacePin,
  RiskAreaShape,
} from '@/shared/map/MapMarkers';
import { colors, fonts, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';
import type { Coordinate, SelectedPlace } from '@/shared/types/location';
import type { MapPoint, RiskArea, RiskZoneData } from '@/shared/types/map';
import { dataPeriodLabel, timeSlotLabel, weekdayLabel } from '@/shared/utils/format';
import {
  createProjector,
  queryBoxes,
  type MapView,
  type Projector,
  type ViewSize,
} from '@/shared/utils/mercator';

/** 처음 보여줄 확대 단계(휴대폰 가로 약 750m). */
const DEFAULT_ZOOM = 16;
const MIN_ZOOM = 14;
const MAX_ZOOM = 18;
/** 이보다 축소하면 칸이 작아 신고 건수 말풍선을 숨긴다. */
const COUNT_MIN_ZOOM = 15.5;
/** 법정 거리(5·10m)는 축소하면 점보다 작아 최소 크기로 그린다. */
const MIN_ZONE_PX = 18;
/** 한 화면에서 동시에 조회하는 칸 수(칸 하나는 약 1.8km). */
const MAX_BOXES = 12;
/** 이동·확대를 멈춘 뒤 조회를 시작하기까지 기다리는 시간. */
const FETCH_DELAY_MS = 250;
/** 같은 칸을 다시 조회하기 전까지 쓰는 시간(요일·시간대가 바뀔 수 있음). */
const BOX_TTL_MS = 10 * 60 * 1000;

type BoxEntry = { status: 'done'; data: RiskZoneData } | { status: 'error' };

const coordinateKey = (coordinate: Coordinate) =>
  `${coordinate.latitude.toFixed(6)}:${coordinate.longitude.toFixed(6)}`;

/** 여러 칸의 조회 결과를 합친다. 칸 경계의 같은 구역은 한 번만 그린다. */
function mergeZones(entries: (BoxEntry | undefined)[]): RiskZoneData | null {
  const done = entries.flatMap((entry) => (entry?.status === 'done' ? [entry.data] : []));
  const first = done[0];
  if (!first) return null;
  const facilities = new Map<string, RiskZoneData['facilityZones'][number]>();
  const cells = new Map<string, RiskZoneData['cells'][number]>();
  for (const data of done) {
    for (const zone of data.facilityZones) {
      facilities.set(`${zone.zoneType}:${coordinateKey(zone.coordinate)}`, zone);
    }
    for (const cell of data.cells) cells.set(coordinateKey(cell.coordinate), cell);
  }
  return {
    facilityZones: [...facilities.values()],
    cells: [...cells.values()],
    dataPeriod: done.find((data) => data.dataPeriod)?.dataPeriod ?? null,
    slot: first.slot,
    isExampleData: done.some((data) => data.isExampleData),
  };
}

interface Overlays {
  areas: RiskArea[];
  bubbles: { id: string; point: MapPoint; count: number; placement: 'above' | 'below' }[];
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const intersects = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** 좌표 구역 → 화면 px 표시 요소. 화면 밖은 그리지 않고, 겹치는 말풍선은 건수가 많은 것만 남긴다. */
function toOverlays(data: RiskZoneData, projector: Projector, withBubbles: boolean): Overlays {
  const { width, height } = projector.size;
  const margin = 80;
  const visible = (x: number, y: number) =>
    x > -margin && y > -margin && x < width + margin && y < height + margin;

  const areas: RiskArea[] = [];
  const candidates: { id: string; x: number; top: number; bottom: number; count: number }[] = [];
  data.cells.forEach((cell, index) => {
    const { x, y } = projector.toScreen(cell.coordinate);
    if (!visible(x, y)) return;
    const side = Math.max(6, projector.metersToPixels(cell.sizeMeters));
    const id = `cell-${index}`;
    areas.push({
      id,
      level: 2,
      shape: {
        kind: 'rect',
        rect: { left: x - side / 2, top: y - side / 2, width: side, height: side },
      },
      badge: { left: x, top: y - side / 2 },
      reportCount: cell.reportCount,
    });
    // 신고 건수 0은 문구를 숨긴다(명세 5절).
    if (cell.reportCount > 0) {
      candidates.push({ id, x, top: y - side / 2, bottom: y + side / 2, count: cell.reportCount });
    }
  });
  data.facilityZones.forEach((zone, index) => {
    const { x, y } = projector.toScreen(zone.coordinate);
    if (!visible(x, y)) return;
    const center = { left: x, top: y };
    areas.push({
      id: `facility-${index}`,
      level: 1,
      shape: {
        kind: 'circle',
        center,
        size: Math.max(MIN_ZONE_PX, projector.metersToPixels(zone.radiusMeters * 2)),
      },
      badge: center,
      reportCount: 0,
    });
  });

  const bubbles: Overlays['bubbles'] = [];
  if (withBubbles) {
    // 건수가 많은 칸부터 칸 위에, 자리가 없으면 칸 아래에 놓고 그래도 겹치면 생략한다.
    const placed: Box[] = [];
    for (const candidate of [...candidates].sort((a, b) => b.count - a.count)) {
      const size = countBubbleSize(candidate.count);
      const horizontal = {
        left: candidate.x - size.width / 2 - 1,
        right: candidate.x + size.width / 2 + 1,
      };
      const options = [
        {
          placement: 'above' as const,
          anchor: candidate.top,
          box: { ...horizontal, top: candidate.top - size.height - 1, bottom: candidate.top + 1 },
        },
        {
          placement: 'below' as const,
          anchor: candidate.bottom,
          box: {
            ...horizontal,
            top: candidate.bottom - 1,
            bottom: candidate.bottom + size.height + 1,
          },
        },
      ];
      const choice = options.find(
        (option) => !placed.some((other) => intersects(option.box, other)),
      );
      if (!choice) continue;
      placed.push(choice.box);
      bubbles.push({
        id: candidate.id,
        point: { left: candidate.x, top: choice.anchor },
        count: candidate.count,
        placement: choice.placement,
      });
    }
  }
  return { areas, bubbles };
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: SelectedPlace[] }
  | { status: 'error' };

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * 지도 탭. 끌어서 이동하고 확대·축소하며 화면 범위의 1단계 구역·2단계 집중 칸
 * (GET /map/risk-zones)을 본다. 검색으로 고른 장소로 이동할 수 있고,
 * 검색과 선택만으로 주차 분석을 시작하지 않는다.
 */
export function MapScreen() {
  const current: Coordinate = mapService.currentLocation();
  const [view, setView] = useState<MapView>({ center: current, zoom: DEFAULT_ZOOM });
  const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 });
  const [boxCache, setBoxCache] = useState<Record<string, BoxEntry>>({});
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  const [showCounts, setShowCounts] = useState(true);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ready = size.width > 0 && size.height > 0;
  const projector = createProjector(view, size);
  const { boxes, truncated } = ready
    ? queryBoxes(projector.bounds, MAX_BOXES)
    : { boxes: [], truncated: false };
  const { minLat, maxLat, minLng, maxLng } = projector.bounds;

  // 이동·확대를 멈추면 화면 범위의 칸 중 아직 받지 않은 칸만 조회한다.
  useEffect(() => {
    if (!ready) return;
    const missing = queryBoxes({ minLat, maxLat, minLng, maxLng }, MAX_BOXES).boxes.filter(
      (box) => !boxCache[box.key] && !inFlight.current.has(box.key),
    );
    if (missing.length === 0) return;
    const timer = setTimeout(() => {
      for (const box of missing) {
        inFlight.current.add(box.key);
        mapService
          .riskZones(box.bounds)
          .then(
            (data): BoxEntry => ({ status: 'done', data }),
            // 조회 실패를 0건으로 보여주지 않는다(명세 5절).
            (): BoxEntry => ({ status: 'error' }),
          )
          .then((entry) => {
            inFlight.current.delete(box.key);
            if (!mounted.current) return;
            setBoxCache((previous) => ({ ...previous, [box.key]: entry }));
            // 요일·시간대 기준이 바뀔 수 있어 받은 칸은 일정 시간 뒤 버리고 다시 조회한다.
            if (entry.status === 'done') {
              setTimeout(() => {
                if (!mounted.current) return;
                setBoxCache((previous) => {
                  const { [box.key]: expired, ...rest } = previous;
                  return expired ? rest : previous;
                });
              }, BOX_TTL_MS);
            }
          });
      }
    }, FETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, minLat, maxLat, minLng, maxLng, boxCache]);

  const entries = boxes.map((box) => boxCache[box.key]);
  const zoneStatus: 'loading' | 'error' | 'done' = entries.some(
    (entry) => entry?.status === 'error',
  )
    ? 'error'
    : entries.some((entry) => !entry) || !ready
      ? 'loading'
      : 'done';
  const zoneData = mergeZones(entries);
  const countsVisible = showCounts && view.zoom >= COUNT_MIN_ZOOM;
  const overlays = zoneData
    ? toOverlays(zoneData, projector, countsVisible)
    : { areas: [], bubbles: [] };

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
  const hint =
    showCounts && view.zoom < COUNT_MIN_ZOOM
      ? '확대하면 신고 건수가 보여요'
      : truncated
        ? '확대하면 가장자리 구역도 보여요'
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

  const changeView = useCallback((next: MapView) => {
    setView({ center: next.center, zoom: clampZoom(next.zoom) });
  }, []);

  function zoomBy(step: number) {
    setView((previous) => ({
      center: previous.center,
      zoom: clampZoom(Math.round(previous.zoom) + step),
    }));
  }

  function retryZones() {
    setBoxCache((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([, entry]) => entry.status === 'done')),
    );
  }

  function changeQuery(text: string) {
    setQuery(text);
    setSearch(text.trim() ? { status: 'loading' } : { status: 'idle' });
  }

  function choose(place: SelectedPlace) {
    setSelected(place);
    setQuery(place.name);
    setFocused(false);
    Keyboard.dismiss();
    // 고른 장소로 지도를 옮긴다(멀리 축소해 있었다면 기본 확대 단계로).
    setView((previous) => ({
      center: place.coordinate,
      zoom: Math.max(previous.zoom, DEFAULT_ZOOM),
    }));
  }

  function clear() {
    setQuery('');
    setSearch({ status: 'idle' });
    setSelected(null);
  }

  function moveToCurrent() {
    clear();
    setView({ center: current, zoom: DEFAULT_ZOOM });
  }

  const showResults = focused && query.trim().length > 0 && !selected;
  const currentPoint = projector.toScreen(current);
  const selectedPoint = selected ? projector.toScreen(selected.coordinate) : null;

  return (
    <View style={styles.root}>
      <GeoMap
        view={view}
        size={size}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onViewChange={changeView}
        onSizeChange={setSize}
        style={StyleSheet.absoluteFill}
      >
        {ready ? overlays.areas.map((area) => <RiskAreaShape key={area.id} area={area} />) : null}
        {ready
          ? overlays.bubbles.map((bubble) => (
              <CountBubble
                key={`c-${bubble.id}`}
                point={bubble.point}
                count={bubble.count}
                placement={bubble.placement}
              />
            ))
          : null}
        {ready ? <LocationDot point={{ left: currentPoint.x, top: currentPoint.y }} /> : null}
        {ready && selected && selectedPoint ? (
          <PlacePin point={{ left: selectedPoint.x, top: selectedPoint.y }} label={selected.name} />
        ) : null}
      </GeoMap>

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
        <View style={styles.zoomColumn} pointerEvents="box-none">
          <IconButton name="add" label="지도 확대" onPress={() => zoomBy(1)} floating />
          <IconButton name="remove" label="지도 축소" onPress={() => zoomBy(-1)} floating />
        </View>
        <View style={styles.bottomRow} pointerEvents="box-none">
          <View
            style={styles.legend}
            accessible
            accessibilityLabel="범례. 빨강은 1단계 구역, 주황은 2단계 신고 집중 구역"
          >
            <LegendItem color={colors.danger} label="1단계 구역" />
            <LegendItem color={colors.warning} label="2단계 신고 집중" />
          </View>
          <IconButton name="locate" label="현재 위치로 이동" onPress={moveToCurrent} floating />
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
              일부 위험 구역을 불러오지 못했어요
            </AppText>
            <Pressable onPress={retryZones} hitSlop={8} accessibilityRole="button">
              <AppText variant="caption" weight="bold" tone="primary">
                다시 시도
              </AppText>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.noteBox}>
          <AppText variant="micro" tone="secondary" style={styles.note}>
            {zoneStatus === 'loading'
              ? '위험 구역을 불러오고 있어요'
              : [basis, hint ?? '칸이 없다고 안전하다는 뜻은 아니에요'].filter(Boolean).join(' · ')}
          </AppText>
          <Pressable
            onPress={() => void Linking.openURL(TILE_ATTRIBUTION_URL)}
            accessibilityRole="link"
            accessibilityLabel="지도 데이터 출처 OpenStreetMap"
            hitSlop={6}
            style={styles.attributionLink}
          >
            <AppText variant="micro" tone="secondary" style={styles.attribution}>
              {TILE_ATTRIBUTION}
            </AppText>
          </Pressable>
        </View>
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
  zoomColumn: { alignSelf: 'flex-end', gap: spacing.sm },
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
  noteBox: {
    gap: 2,
    minHeight: touchTarget / 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  note: { textAlign: 'center' },
  attributionLink: { alignSelf: 'flex-end' },
  attribution: { textDecorationLine: 'underline' },
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
