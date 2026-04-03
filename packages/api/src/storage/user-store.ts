import { randomUUID } from "node:crypto";

import type { UserRecord } from "../types.js";

export interface UserStore {
  findById(id: string): Promise<UserRecord | undefined>;
  findByPhone(phone: string): Promise<UserRecord | undefined>;
  create(phone: string): Promise<UserRecord>;
  save(user: UserRecord): Promise<void>;
}

export class InMemoryUserStore implements UserStore {
  private readonly usersById = new Map<string, UserRecord>();
  private readonly userIdsByPhone = new Map<string, string>();

  public async findById(id: string): Promise<UserRecord | undefined> {
    return this.usersById.get(id);
  }

  public async findByPhone(phone: string): Promise<UserRecord | undefined> {
    const userId = this.userIdsByPhone.get(phone);
    return userId ? this.usersById.get(userId) : undefined;
  }

  public async create(phone: string): Promise<UserRecord> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      return existing;
    }

    const user: UserRecord = {
      id: randomUUID(),
      phone
    };

    await this.save(user);
    return user;
  }

  public async save(user: UserRecord): Promise<void> {
    this.usersById.set(user.id, user);
    this.userIdsByPhone.set(user.phone, user.id);
  }
}
