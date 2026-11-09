import { useCallback } from 'react';

import { useSession } from '@/features/auth';
import { useParking } from '@/features/parking';
import { accountService, demoControl } from '@/services';
import { clearAppOwnedStorage } from '@/storage/keys';

/**
 * 데모 초기화·회원탈퇴 공통 동작.
 * 진행 중 작업과 예약 이벤트를 먼저 무효화한 뒤 앱 소유 저장 데이터(토큰 포함)를 지운다.
 * 서버 연결 시 남은 로그인은 서버에서도 폐기한다(탈퇴 후에는 이미 토큰이 없다).
 * OS 권한은 바꾸지 않는다.
 */
export function useAppReset() {
  const { resetSession } = useSession();
  const { cancelAll } = useParking();

  return useCallback(async () => {
    cancelAll();
    demoControl.reset();
    await accountService.signOut().catch(() => undefined);
    await resetSession();
    await clearAppOwnedStorage();
  }, [cancelAll, resetSession]);
}
