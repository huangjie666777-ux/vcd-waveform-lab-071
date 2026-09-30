import { describe, expect, it } from "vitest";
import { parseVcd, padValue } from "./parser";
import { VcdError } from "./types";

const HEADER = `$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var reg 8 \" data [7:0] $end
$var wire 8 \" alias8 [7:0] $end
$scope module sub $end
$var reg 4 # nib [3:0] $end
$upscope $end
$upscope $end
$enddefinitions $end
`;

describe("parseVcd", () => {
  it("parses timescale, nested scopes and aliases", async () => {
    const vcd = await parseVcd(HEADER + "#0\n$dumpvars\n0!\nbx \"\nbx #\n$end\n#5\n1!\n");
    expect(vcd.timescale).toEqual({ value: 1, unit: "ns" });
    expect(vcd.vars.map((v) => v.fullName)).toEqual(["top.clk", "top.data", "top.alias8", "top.sub.nib"]);
    // alias: data and alias8 share code \" and both receive changes
    expect(vcd.changes[1]).toEqual([{ t: 0n, v: "xxxxxxxx" }]);
    expect(vcd.changes[2]).toEqual([{ t: 0n, v: "xxxxxxxx" }]);
    expect(vcd.changes[0]).toEqual([{ t: 0n, v: "0" }, { t: 5n, v: "1" }]);
  });

  it("pads short vectors per standard (0 / x / z extension)", async () => {
    expect(padValue("101", 8)).toBe("00000101");
    expect(padValue("x1", 4)).toBe("xxx1");
    expect(padValue("z0", 4)).toBe("zzz0");
    const vcd = await parseVcd(HEADER + "#0\nb101 \"\nbz1 #\n");
    expect(vcd.changes[1][0].v).toBe("00000101");
    expect(vcd.changes[3][0].v).toBe("zzz1");
  });

  it("last write wins at the same timestamp", async () => {
    const vcd = await parseVcd(HEADER + "#0\n0!\n#10\n1!\n0!\n#20\n1!\n");
    expect(vcd.changes[0]).toEqual([
      { t: 0n, v: "0" },
      { t: 10n, v: "0" },
      { t: 20n, v: "1" },
    ]);
  });

  it("supports timestamps beyond the safe integer range", async () => {
    const vcd = await parseVcd(HEADER + "#9007199254740993\n1!\n");
    expect(vcd.endTime).toBe(9007199254740993n);
    expect(vcd.changes[0][0].t).toBe(9007199254740993n);
  });

  it("rejects unknown identifier with line number", async () => {
    const err = await parseVcd(HEADER + "#0\n1^\n").catch((e) => e);
    expect(err).toBeInstanceOf(VcdError);
    expect((err as VcdError).line).toBeGreaterThan(0);
    expect((err as VcdError).message).toContain("未知标识码");
  });

  it("rejects time going backwards", async () => {
    const err = await parseVcd(HEADER + "#10\n0!\n#5\n1!\n").catch((e) => e);
    expect(err).toBeInstanceOf(VcdError);
    expect((err as VcdError).message).toContain("时间倒退");
  });

  it("rejects values wider than the variable", async () => {
    const err = await parseVcd(HEADER + "#0\nb111111111 \"\n").catch((e) => e);
    expect(err).toBeInstanceOf(VcdError);
    expect((err as VcdError).message).toContain("超过");
  });

  it("rejects unsupported variable types", async () => {
    const bad = `$var integer 32 ! n $end\n$enddefinitions $end\n`;
    const err = await parseVcd(bad).catch((e) => e);
    expect(err).toBeInstanceOf(VcdError);
    expect((err as VcdError).message).toContain("不支持的变量类型");
  });
});
