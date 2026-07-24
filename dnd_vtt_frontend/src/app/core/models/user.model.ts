export type UserRole = 'admin' | 'player';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  created_at: string;
}
