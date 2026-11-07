import type { AccountService } from '../contracts';
import { demoControl, wait } from './scenario';

export const demoAccountService: AccountService = {
  async signIn() {
    await wait(700);
    if (demoControl.consume('login', 'success') === 'fail-once') {
      throw new Error('카카오 로그인에 실패했어요.');
    }
    return { id: 'demo-user', nickname: '데모 사용자' };
  },
};
