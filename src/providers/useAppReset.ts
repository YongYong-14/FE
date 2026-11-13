import { useCallback } from 'react';

import { useSession } from '@/features/auth';
import { useParking } from '@/features/parking';
import { accountService } from '@/services';
import { clearAppOwnedStorage } from '@/storage/keys';

/**
 * 회원 탈퇴 후 앱 데이터 정리.
 * 진행 중 작업과 예약 이벤트를 먼저 무효화한 뒤 앱 소유 저장 데이터(토큰 포함)를 지운다.
 * 서버 연결 시 남은 로그인은 서버에서도 폐기한다(탈퇴 후에는 이미 토큰이 없다).
 * OS 권한은 바꾸지 않는다.
 */
export function useAppReset() {
  const { resetSession } = useSession();
  const { cancelAll } = useParking();

  return useCallback(async () => {
    cancelAll();
    await accountService.signOut().catch(() => undefined);
    await resetSession();
    await clearAppOwnedStorage();
  }, [cancelAll, resetSession]);
}
