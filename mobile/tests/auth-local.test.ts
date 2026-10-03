import { describe, expect, it } from "vitest";
import { clearSession, getSession, saveSession, loginAccount, registerAccount, sha256Hex, MAX_FAILED_ATTEMPTS, type KeyValueStore } from "../lib/auth-local";

const mem = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v) };
};

describe("auth-local", () => {
  it("sha256 matches known vectors", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("rejects login before an account exists", async () => {
    const r = await loginAccount(mem(), "a@b.co", "password1");
    expect(r).toMatchObject({ ok: false, error: "noAccount" });
  });
  it("registers then logs in by email or username", async () => {
    const s = mem();
    expect((await registerAccount(s, { username: "Ali", email: "Ali@x.com", password: "secret123" })).ok).toBe(true);
    expect((await loginAccount(s, "ali@x.com", "secret123")).ok).toBe(true);
    const acc = await loginAccount(s, "ali", "secret123");
    expect(acc.ok && typeof acc.account.createdAt).toBe("number");
    expect((await loginAccount(s, "ALI", "secret123")).ok).toBe(true);
  });
  it("wrong password fails, never stores plain text", async () => {
    const s = mem();
    await registerAccount(s, { username: "Ali", email: "ali@x.com", password: "secret123" });
    expect(await loginAccount(s, "ali@x.com", "nope12345")).toMatchObject({ error: "wrongPassword" });
    expect(await s.getItem("hd-market-accounts-v1")).not.toContain("secret123");
  });
  it("prevents duplicates and locks after repeated failures", async () => {
    const s = mem();
    await registerAccount(s, { username: "Ali", email: "ali@x.com", password: "secret123" });
    expect(await registerAccount(s, { username: "Other", email: "ALI@x.com", password: "secret123" })).toMatchObject({ error: "emailTaken" });
    expect(await registerAccount(s, { username: "ali", email: "o@x.com", password: "secret123" })).toMatchObject({ error: "usernameTaken" });
    let r: any;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) r = await loginAccount(s, "ali", "bad-pass-1", 1000);
    expect(r.error).toBe("locked");
    expect((await loginAccount(s, "ali", "secret123", 2000)).ok).toBe(false);
  });
  it("remembers the signed-in account and forgets it on sign-out", async () => {
    const s = mem();
    expect(await getSession(s)).toBeNull();
    await registerAccount(s, { username: "Ali", email: "ali@x.com", password: "secret123" });
    expect(await getSession(s)).toBeNull(); // registering alone does not sign in
    await saveSession(s, "ALI@x.com");
    expect((await getSession(s))?.username).toBe("Ali");
    await clearSession(s);
    expect(await getSession(s)).toBeNull();
  });
});
