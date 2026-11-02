import { describe, expect, it } from "vitest";
import { meetsDepositRequirement, parseAffiliateReply } from "@/lib/affiliate-reply";

const ok = `Trader # 60539010
Country: Pakistan
Link Id: 1416169
---------------------------
Balance: $ 12.50
Deposits Count: 1
Deposits Sum: $ 75.00`;

describe("parseAffiliateReply", () => {
  it("detects a registered trader with deposit and balance", () => {
    expect(parseAffiliateReply(ok, "60539010")).toEqual({ kind: "verified", country: "Pakistan", deposit: 75, balance: 12.5 });
  });
  it("detects not found", () => {
    expect(parseAffiliateReply("Trader with ID = '1234567' was not found.", "1234567").kind).toBe("not_found");
  });
  it("detects account deleted", () => {
    expect(parseAffiliateReply("Trader # 60539010\nAccount Deleted", "60539010").kind).toBe("account_deleted");
    expect(parseAffiliateReply("This account is deleted.", "60539010").kind).toBe("account_deleted");
  });
  it("rejects a reply for a different trader ID", () => {
    expect(parseAffiliateReply(ok, "11111111").kind).toBe("unknown");
  });
  it("requires a deposit of at least 50 USD for access", () => {
    expect(meetsDepositRequirement(0)).toBe(false);
    expect(meetsDepositRequirement(49.99)).toBe(false);
    expect(meetsDepositRequirement(50)).toBe(true);
    expect(meetsDepositRequirement(75)).toBe(true);
    expect(meetsDepositRequirement(null)).toBe(false);
  });
});
