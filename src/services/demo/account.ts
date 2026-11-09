import type { AccountService } from '../contracts';
import { demoControl, wait } from './scenario';

// 데모 계정. 로그인 상태는 기기 저장값(SessionProvider)이 그대로 관리한다.
export const demoAccountService: AccountService = {
  async signIn() {
    await wait(700);
    if (demoControl.consume('login', 'success') === 'fail-once') {
      throw new Error('카카오 로그인에 실패했어요.');
    }
    // 데모 로그인 화면의 안내로 약관 동의를 대신한다.
    return {
      user: { id: 'demo-user', nickname: '데모 사용자' },
      isNewUser: false,
      missingAgreements: [],
    };
  },
  // 데모는 서버 세션이 없으므로 복원 대상이 없다(서버 연결 시에만 호출한다).
  async restore() {
    return null;
  },
  async agree() {
    await wait(300);
  },
  async signOut() {
    await wait(150);
  },
  async withdraw() {
    await wait(300);
  },
  onSessionExpired() {
    return () => undefined;
  },
};
