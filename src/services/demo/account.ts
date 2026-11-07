import type { AccountService } from '../contracts';

export const demoAccountService: AccountService = {
  async signIn() {
    return { id: 'demo-user', nickname: '데모 사용자' };
  },
};
