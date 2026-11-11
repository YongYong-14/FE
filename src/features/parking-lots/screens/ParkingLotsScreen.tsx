import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ParkingLotSortDropdown } from '../components/ParkingLotSortDropdown';
import { sortParkingLots, type ParkingLotSort } from '../utils/sortParkingLots';
import { useSession } from '@/features/auth';
import { useParking } from '@/features/parking';
import { isApiError, isNativeDeviceMode, mapService, parkingLotService } from '@/services';
import { useDeviceLocation } from '@/shared/hooks/useDeviceLocation';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { StateView } from '@/shared/components/StateView';
import { SheetSurface } from '@/shared/components/Surface';
import { MapIllustration, ParkingMarker } from '@/shared/map/MapIllustration';
import { LotPin } from '@/shared/map/MapMarkers';
import { colors, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';
import type { ParkingFeeType, ParkingLot, ParkingLotType } from '@/shared/types/map';
import { boundsAround, isInside, project } from '@/shared/utils/geo';
import { hoursLabel } from '@/shared/utils/hours';

const typeLabel: Record<ParkingLotType, string> = {
  public: '공영',
  private: '민영',
  attached: '부설',
};

const feeLabel: Record<ParkingFeeType, string> = {
  FREE: '무료',
  PAID: '유료',
  MIXED: '유·무료 혼합',
};

type Radius = 500 | 1000;
type Preview = { kind: 'share' | 'route' | 'external'; lot?: ParkingLot } | null;
type LoadError = 'consent' | 'failed' | null;

const distanceText = (lot: ParkingLot) => `${Math.round(lot.distanceMeters)}m`;
const feeText = (lot: ParkingLot) =>
  lot.fee ?? (lot.feeType ? feeLabel[lot.feeType] : '요금 정보 없음');

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
 * 공유·길안내·외부 지도는 앱 내부 미리보기만 보여준다.
 */
export function ParkingLotsScreen() {
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const { requireAgreement } = useSession();
  const { records, latest } = useParking();
  const parkedAt =
    latest?.coordinate ?? records.find((record) => record.place.coordinate)?.place.coordinate;
  const gps = useDeviceLocation(!parkedAt);
  const origin = parkedAt ?? gps.coordinate ?? mapService.currentLocation();
  const missingLocation = isNativeDeviceMode && !parkedAt && !gps.coordinate;
  const [radius, setRadius] = useState<Radius>(500);
  const [openOnly, setOpenOnly] = useState(true);
  const [publicOnly, setPublicOnly] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);
  const [sort, setSort] = useState<ParkingLotSort>('distance');
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [isExample, setIsExample] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { latitude, longitude } = origin;
  const requestKey = `${latitude},${longitude},${radius},${reloadKey}`;

  useEffect(() => {
    if (missingLocation) return;
    let active = true;
    parkingLotService
      .search({ latitude, longitude }, radius)
      .then((result) => {
        if (!active) return;
        setLots(result.lots);
        setExpanded(result.expanded);
        setIsExample(result.isExampleData);
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
  const effectiveRadius: Radius = expanded ? 1000 : radius;
  const visible = useMemo(
    () =>
      sortParkingLots(
        lots.filter(
          (lot) =>
            (!openOnly || lot.isOpen === true) &&
            (!publicOnly || lot.type === 'public') &&
            (!paidOnly || lot.feeType === 'PAID' || lot.feeType === 'MIXED'),
        ),
        sort,
      ),
    [lots, openOnly, publicOnly, paidOnly, sort],
  );
  const selected = visible.find((lot) => lot.id === selectedId) ?? visible[0];
  const filtered = openOnly || publicOnly || paidOnly;
  const bounds = useMemo(
    () => boundsAround({ latitude, longitude }, effectiveRadius * 1.15),
    [latitude, longitude, effectiveRadius],
  );

  function changeRadius(next: Radius) {
    if (next === radius) return;
    setRadius(next);
    setSelectedId(null);
  }

  return (
    <View style={styles.root}>
      <MapIllustration style={styles.map}>
        <ParkingMarker left="50%" top="50%" />
        {visible
          .filter((lot) => isInside(lot.coordinate, bounds))
          .map((lot) => (
            <LotPin
              key={lot.id}
              point={project(lot.coordinate, bounds)}
              selected={lot.id === selected?.id}
              caption={distanceText(lot)}
              label={`${lot.name}, 직선 거리 ${distanceText(lot)}`}
              onPress={() => setSelectedId(lot.id)}
            />
          ))}
      </MapIllustration>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.basis}>
          <View style={styles.basisDot} />
          <AppText variant="label" weight="bold" numberOfLines={1}>
            {parkedAt ? '내 차 주차 위치 기준' : '현재 위치 기준'}
          </AppText>
          <AppText variant="label" tone="secondary">
            반경 {effectiveRadius === 500 ? '500m' : '1km'}
          </AppText>
        </View>
      </SafeAreaView>

      <SheetSurface style={styles.sheet}>
        <View style={styles.headerRow}>
          <AppText variant="heading" weight="black" style={styles.flex}>
            {loading
              ? '주차장을 찾고 있어요'
              : visible.length > 0
                ? `근처 주차장 ${visible.length}곳`
                : '근처에 주차장이 없어요'}
          </AppText>
          <ParkingLotSortDropdown
            value={sort}
            onChange={(next) => {
              if (next === sort) return;
              setSort(next);
              setSelectedId(null);
              list.current?.scrollTo({ y: 0, animated: false });
            }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipScroll}
        >
          <View style={styles.segment} accessibilityRole="radiogroup">
            {([500, 1000] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => changeRadius(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: effectiveRadius === value }}
                style={[styles.segmentItem, effectiveRadius === value && styles.segmentSelected]}
              >
                <AppText
                  variant="label"
                  weight="bold"
                  style={{ color: effectiveRadius === value ? colors.ink : colors.textSecondary }}
                >
                  {value === 500 ? '500m' : '1km'}
                </AppText>
              </Pressable>
            ))}
          </View>
          <Chip
            label="운영 중"
            selected={openOnly}
            onPress={() => setOpenOnly((value) => !value)}
          />
          <Chip
            label="공영"
            selected={publicOnly}
            onPress={() => setPublicOnly((value) => !value)}
          />
          <Chip label="유료" selected={paidOnly} onPress={() => setPaidOnly((value) => !value)} />
        </ScrollView>

        <ScrollView ref={list} style={styles.list} contentContainerStyle={styles.listContent}>
          {missingLocation ? (
            <StateView
              loading={gps.loading}
              icon="location-outline"
              title={gps.loading ? '현재 위치를 확인하고 있어요' : '현재 위치를 확인해 주세요'}
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
            effectiveRadius === 500 ? (
              <StateView
                icon="car-outline"
                title="500m 안에 조건에 맞는 주차장이 없어요"
                description="반경을 1km로 넓혀 다시 찾아볼까요?"
                actions={
                  <Button label="1km로 넓혀 보기" size="md" onPress={() => changeRadius(1000)} />
                }
              />
            ) : (
              <StateView
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
                    : expanded
                      ? '500m 안에 없어 1km까지 찾았지만 없었어요. 지도 앱에서 더 넓은 범위를 찾아보세요.'
                      : '지도 앱에서 더 넓은 범위를 찾아보세요.'
                }
                actions={
                  <>
                    {filtered && lots.length > 0 ? (
                      <Button
                        label="필터 초기화"
                        size="md"
                        onPress={() => {
                          setOpenOnly(false);
                          setPublicOnly(false);
                          setPaidOnly(false);
                        }}
                      />
                    ) : null}
                    <Button
                      label="지도 앱에서 주차장 검색"
                      variant="outline"
                      size="md"
                      onPress={() => setPreview({ kind: 'external' })}
                    />
                  </>
                }
              />
            )
          ) : (
            <>
              {expanded ? (
                <AppText variant="caption" tone="body" style={styles.expandedNote}>
                  500m 안에 없어 1km까지 찾았어요.
                </AppText>
              ) : null}
              {visible.map((lot, index) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  selected={lot.id === selected?.id}
                  last={index === visible.length - 1}
                  onSelect={() => setSelectedId(lot.id)}
                  onShare={() => setPreview({ kind: 'share', lot })}
                  onRoute={() => setPreview({ kind: 'route', lot })}
                />
              ))}
            </>
          )}
          {!loading && visible.length > 0 ? (
            <AppText variant="micro" tone="secondary" style={styles.note}>
              {isExample
                ? '거리·요금·운영 상태는 시연용 예시예요.'
                : '직선 거리예요. 요금·운영시간은 공공데이터 기준이라 실제와 다를 수 있어요.'}
            </AppText>
          ) : null}
        </ScrollView>
      </SheetSurface>

      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

function LotRow({
  lot,
  selected,
  last,
  onSelect,
  onShare,
  onRoute,
}: {
  lot: ParkingLot;
  selected: boolean;
  last: boolean;
  onSelect: () => void;
  onShare: () => void;
  onRoute: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${lot.name}, ${typeLabel[lot.type]}, 직선 거리 ${distanceText(lot)}, ${feeText(lot)}${lot.isOpen === false ? ', 운영 종료' : ''}`}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={[styles.row, !last && styles.rowDivider]}
    >
      <View style={[styles.lotIcon, { backgroundColor: selected ? colors.parking : '#fff6d1' }]}>
        <AppText weight="black" style={styles.lotP}>
          P
        </AppText>
      </View>
      <View style={styles.rowTexts}>
        <AppText variant="body" weight="bold" numberOfLines={1}>
          {lot.name}
        </AppText>
        <AppText variant="caption" tone="body">
          {typeLabel[lot.type]} · {distanceText(lot)} · {feeText(lot)}
        </AppText>
        {lot.isOpen === false ? (
          <AppText variant="micro" tone="danger">
            지금은 운영하지 않아요 · {hoursLabel(lot.hours)}
          </AppText>
        ) : (
          <AppText variant="micro" tone="secondary">
            {hoursLabel(lot.hours)}
            {lot.capacity !== null ? ` · ${lot.capacity}면` : ''}
          </AppText>
        )}
      </View>
      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel={`${lot.name} 공유`}
        hitSlop={4}
        style={styles.shareButton}
      >
        <Icon name="share-outline" size={18} />
      </Pressable>
      <Button
        label="길안내"
        size="md"
        variant={selected ? 'primary' : 'neutral'}
        onPress={onRoute}
        accessibilityLabel={`${lot.name} 길안내`}
        style={styles.routeButton}
      />
    </Pressable>
  );
}

function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const lot = preview?.lot;
  const title =
    preview?.kind === 'share'
      ? '공유 미리보기'
      : preview?.kind === 'route'
        ? '길안내 미리보기'
        : '외부 지도 검색 미리보기';
  const lines =
    preview?.kind === 'share' && lot
      ? [`장소: ${lot.name}`, `주소: ${lot.address}`, `운영: ${hoursLabel(lot.hours)}`]
      : preview?.kind === 'route' && lot
        ? ['출발: 내 차 주차 위치', `도착: ${lot.name}`, `직선 거리 ${distanceText(lot)}`]
        : ['검색어: 주차장', '기준: 내 차 주차 위치 주변'];
  return (
    <AppModal visible={Boolean(preview)} onDismiss={onClose}>
      <AppText variant="heading" weight="bold">
        {title}
      </AppText>
      <View style={styles.previewBox}>
        {lines.map((line) => (
          <AppText key={line} variant="label" tone="body">
            {line}
          </AppText>
        ))}
      </View>
      <AppText variant="caption" tone="secondary">
        데모에서는 실제로 메시지를 보내거나 외부 지도 앱을 열지 않아요. 연동 후 이 내용으로
        실행돼요.
      </AppText>
      <Button label="확인" onPress={onClose} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  flex: { flex: 1 },
  map: { height: '48%' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  basis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  basisDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  sheet: { flex: 1, marginTop: -40, paddingHorizontal: 0, paddingBottom: 0, gap: spacing.md + 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  chipScroll: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: 'center' },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  segmentItem: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  segmentSelected: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(0,0,0,0.12)' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  loading: { paddingVertical: spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 88,
    paddingVertical: spacing.md + 2,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  lotIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotP: { fontSize: 18, lineHeight: 24 },
  rowTexts: { flex: 1, gap: 3 },
  shareButton: {
    width: touchTarget - 4,
    height: touchTarget - 4,
    borderRadius: (touchTarget - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  routeButton: { paddingHorizontal: spacing.md + 2 },
  note: { paddingTop: spacing.md },
  expandedNote: { paddingTop: spacing.sm },
  previewBox: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
});
