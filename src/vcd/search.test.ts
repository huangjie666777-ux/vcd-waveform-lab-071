import { describe, expect, it } from "vitest";
import { parseVcd } from "./parser";
import { risingEdges, searchRisingEdges, validatePattern } from "./search";

const SRC = `$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var reg 4 \" data [3:0] $end
$var wire 1 # flag $end
$upscope $end
$enddefinitions $end
#0
0!
bx \"
x#
#10
1!
b0011 \"
#20
0!
#30
1!
bx1z0 \"
1#
#40
0!
0#
#50
1!
#60
0!
b0000 \"
#70
1!
`;

describe("search", () => {
  it("finds 0->1 edges only", async () => {
    const vcd = await parseVcd(SRC);
    expect(risingEdges(vcd.changes[0])).toEqual([10n, 30n, 50n, 70n]);
  });

  it("matches equal-width four-state patterns literally (x/z included)", async () => {
    const vcd = await parseVcd(SRC);
    // data keeps value x1z0 from t=30 until t=60, so both edges at 30 and 50 match
    const hits = await searchRisingEdges(vcd, 0, [{ varIndex: 1, pattern: "x1z0" }]);
    expect(hits).toEqual([30n, 50n]);
    const all = await searchRisingEdges(vcd, 0, []);
    expect(all).toEqual([10n, 30n, 50n, 70n]);
  });

  it("jointly matches multiple conditions with post-update values at the same time", async () => {
    const vcd = await parseVcd(SRC);
    // at t=30 both data==x1z0 and flag==1 hold after all updates at that time
    const hits = await searchRisingEdges(vcd, 0, [
      { varIndex: 1, pattern: "x1z0" },
      { varIndex: 2, pattern: "1" },
    ]);
    expect(hits).toEqual([30n]);
    const none = await searchRisingEdges(vcd, 0, [
      { varIndex: 1, pattern: "0011" },
      { varIndex: 2, pattern: "1" },
    ]);
    expect(none).toEqual([]);
  });

  it("validates pattern width and alphabet", () => {
    expect(validatePattern("101", 4)).toContain("位宽");
    expect(validatePattern("10a1", 4)).toContain("0/1/x/z");
    expect(validatePattern("1xZ0", 4)).toBeNull();
  });

  it("rejects a non 1-bit clock", async () => {
    const vcd = await parseVcd(SRC);
    await expect(searchRisingEdges(vcd, 1, [])).rejects.toThrow("1 位");
  });
});
