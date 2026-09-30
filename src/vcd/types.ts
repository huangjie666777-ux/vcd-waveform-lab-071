export type LogicValue = "0" | "1" | "x" | "z";

export type VariableType = "wire" | "reg";

export interface Signal {
  id: string;
  name: string;
  path: string;
  aliases: string[];
  width: number;
  type: VariableType;
}

export interface Change {
  t: bigint;
  v: string;
}

export interface TimedSignal extends Signal {
  changes: Change[];
}

export interface HierarchyNode {
  name: string;
  path: string;
  children: Map<string, HierarchyNode>;
  signalId: string | null;
}

export interface TimeScale {
  number: number;
  unit: string;
}

export interface VcdData {
  timescale: TimeScale | null;
  signals: Map<string, TimedSignal>;
  roots: Map<string, HierarchyNode>;
  endTime: bigint;
}

export interface ParseProgress {
  phase: "parse";
  loaded: number;
  total: number;
}

export interface SearchProgress {
  phase: "search";
  scanned: number;
  total: number;
}

export type WorkerProgress = ParseProgress | SearchProgress;

export interface ParseRequest {
  type: "parse";
  taskId: number;
  fileName: string;
  text: string;
}

export interface SearchRequest {
  type: "search";
  taskId: number;
  clockId: string;
  conditions: Array<{ signalId: string; pattern: string }>;
}

export interface SignalSearchRequest {
  type: "signal-search";
  taskId: number;
  query: string;
}

export interface CancelRequest {
  type: "cancel";
  taskId: number;
}

export interface CancelledMessage {
  type: "cancelled";
  taskId: number;
}

export type WorkerRequest = ParseRequest | SearchRequest | SignalSearchRequest | CancelRequest;

export interface ParseOk {
  type: "parse-done";
  taskId: number;
  data: VcdData;
}

export interface ParseFailed {
  type: "parse-error";
  taskId: number;
  message: string;
  line?: number;
  column?: number;
}

export interface SearchHit {
  t: bigint;
}

export interface SearchOk {
  type: "search-done";
  taskId: number;
  hits: SearchHit[];
}

export interface SignalSearchOk {
  type: "signal-search-done";
  taskId: number;
  signals: Signal[];
}

export interface SearchFailed {
  type: "search-error";
  taskId: number;
  message: string;
}

export interface ProgressMessage {
  type: "progress";
  taskId: number;
  progress: WorkerProgress;
}

export type WorkerResponse =
  | ParseOk
  | ParseFailed
  | SearchOk
  | SearchFailed
  | SignalSearchOk
  | CancelledMessage
  | ProgressMessage;
