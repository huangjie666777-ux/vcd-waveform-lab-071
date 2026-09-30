/** Demo VCD: nested scopes, an 8-bit bus with an alias, x/z states, short-vector padding. */
export const SAMPLE_VCD = `$date
  demo
$end
$version
  VCD Waveform Lab sample
$end
$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var reg 8 \" data [7:0] $end
$var wire 8 \" data_alias [7:0] $end
$var wire 1 # req $end
$scope module sub $end
$var reg 4 $ nibble [3:0] $end
$var wire 1 % ack $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
x\"
x#
bx $
x%
$end
#5
1!
#10
0!
b1010 \"
1#
#15
1!
b1z $
#20
0!
0#
bz1x0 \"
#25
1!
1%
b101 $
#30
0!
b11110000 \"
#35
1!
0%
#40
0!
bxxxx $
#45
1!
#50
0!
bzzzzzzzz \"
#55
1!
#60
0!
b111100 \"
b0101 $
#65
1!
#70
0!
#9007199254740993
1!
b10101010 \"
#9007199254741003
0!
#9007199254741013
1!
b101 $
`;
