import { useCallback } from 'react';

import { useSession } from '@/features/auth';
import { useParking } from '@/features/parking';
import { demoControl } from '@/services';
import { clearAppOwnedStorage } from '@/storage/keys';

/**
 * 데모 초기화·데모 회원탈퇴 공통 동작.
 * 진행 중 작업과 예약 이벤트를 먼저 무효화한 뒤 앱 소유 저장 데이터를 지운다.
 * 실제 카카오 계정·서버 데이터·OS 권한은 바꾸지 않는다.
 */
export function useAppReset() {
  const { resetSession } = useSession();
  const { cancelAll } = useParking();

  return useCallback(async () => {
    cancelAll();
    demoControl.reset();
    await resetSession();
    await clearAppOwnedStorage();
  }, [cancelAll, resetSession]);
}
