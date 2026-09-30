import { describe, expect, it } from 'vitest';
import { parseVcd, ParseError } from './parser';
import { findMatches } from './search';
import { valueAt, visibleChanges } from './waveform';

const base = `$timescale 1 ns $end
$scope module top $end
$var wire 1 ! clk $end
$var reg 4 # bus $end
$var wire 4 $ same $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
bx #
bx $
$end
#5
1!
b01 #
b01 $
#7
0!
#10
1!
b1010 #
b1010 $
b1111 #
`;

describe('VCD parser', () => {
  it('parses timescale, nested scope, vectors and aliases', () => {
    const data = parseVcd(base);
    expect(data.timescale).toEqual({ number: 1, unit: 'ns' });
    expect(data.signals.get('#')?.width).toBe(4);
    expect(data.signals.get('$')?.aliases).toEqual(['top.same']);
    expect(valueAt(data.signals.get('#')!, 5n)).toBe('0001');
    expect(valueAt(data.signals.get('#')!, 10n)).toBe('1111');
  });

  it('keeps x before first assignment and preserves leading z literally', () => {
    const data = parseVcd(base);
    expect(valueAt(data.signals.get('#')!, 1n)).toBe('xxxx');
    data.signals.get('#')!.changes.push({ t: 12n, v: '10xz' });
    expect(valueAt(data.signals.get('#')!, 12n)).toBe('10xz');
    expect(data.signals.get('#')!.changes.find((change) => change.t === 5n)?.v).toBe('0001');
  });

  it('reports unknown id, reverse time and unsupported width/type with positions', () => {
    expect(() => parseVcd(base + '1 ?')).toThrow(ParseError);
    expect(() => parseVcd(base + '#9\n1 !')).toThrow(/时间倒退/);
    expect(() => parseVcd(base + '#12\nb10101 #')).toThrow(/超过/);
    expect(() => parseVcd(base.replace('$var reg 4 # bus', '$var integer 4 # bus'))).toThrow(/不支持的变量类型/);
  });

  it('searches values at same timestamp after all updates', () => {
    const data = parseVcd(base);
    const hits = findMatches(data, '!', [{ signalId: '#', pattern: '1111' }]);
    expect(hits.map((hit) => hit.t)).toEqual([10n]);
  });

  it('includes left continuation when indexing a visible window', () => {
    const data = parseVcd(base);
    const visible = visibleChanges(data.signals.get('#')!, 6n, 20n);
    expect(visible.leadValue).toBe('0001');
    expect(visible.items.at(-1)?.t).toBe(10n);
  });
});
