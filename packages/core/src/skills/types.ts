export interface UserCredentialStore {
  get(userId: string, service: string): Promise<Record<string, string> | undefined>;
}
