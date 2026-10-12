import { describe, expect, it } from "vitest";
import { parseAffiliateReply } from "@/lib/affiliate-reply";

const ok = `Trader # 60539010
Country: Pakistan
Link Id: 1416169
---------------------------
Balance: $ 12.50
Deposits Count: 1
Deposits Sum: $ 75.00`;

describe("parseAffiliateReply", () => {
  it("detects a registered trader with deposit and balance", () => {
    expect(parseAffiliateReply(ok, "60539010")).toEqual({ kind: "verified", deposit: 75, balance: 12.5 });
  });
  it("detects not found", () => {
    expect(parseAffiliateReply("Trader with ID = '1234567' was not found.", "1234567").kind).toBe("not_found");
  });
  it("rejects a reply for a different trader ID", () => {
    expect(parseAffiliateReply(ok, "11111111").kind).toBe("unknown");
  });
});
