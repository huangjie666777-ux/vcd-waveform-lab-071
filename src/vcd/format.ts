import { Timescale } from "./types";

/** bits (MSB first) -> hex string; a nibble containing x/z shows x/z */
export function bitsToHex(bits: string): string {
  const pad = (4 - (bits.length % 4)) % 4;
  const b = "0".repeat(pad) + bits;
  let out = "";
  for (let i = 0; i < b.length; i += 4) {
    const nib = b.slice(i, i + 4);
    if (nib.includes("x")) out += "x";
    else if (nib.includes("z")) out += "z";
    else out += parseInt(nib, 2).toString(16);
  }
  return out.replace(/^0+(?=[0-9xz])/, "") || "0";
}

export function formatBits(bits: string, fmt: "bin" | "hex"): string {
  if (bits.length === 1) return bits;
  return fmt === "hex" ? "0x" + bitsToHex(bits) : "0b" + bits;
}

/** exact BigInt time -> scaled string using the timescale, no precision loss */
export function formatTime(t: bigint, ts: Timescale | null): string {
  if (!ts) return t.toString();
  return (t * BigInt(ts.value)) + " " + ts.unit;
}
