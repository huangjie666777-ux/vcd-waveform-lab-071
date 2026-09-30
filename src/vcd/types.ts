export type VarType = "wire" | "reg";

export interface Timescale {
  value: number;
  unit: string;
}

export interface VcdVar {
  index: number;
  code: string;
  name: string;
  width: number;
  vtype: VarType;
  scope: string[];
  fullName: string;
}

export interface Change {
  t: bigint;
  /** bit string, MSB first, chars 0/1/x/z, length === var width */
  v: string;
}

export interface VcdFile {
  timescale: Timescale | null;
  vars: VcdVar[];
  /** parallel to vars; each list sorted by t, same-t collapsed (last wins) */
  changes: Change[][];
  endTime: bigint;
}

export class VcdError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(message);
    this.line = line;
    this.name = "VcdError";
  }
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}
