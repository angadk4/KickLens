// The "on air" mark. Three bars at three DIFFERENT durations — layout.css already
// established that three synchronised pulses are decoration, so these are deliberately
// unsynchronised. Its base state is a static stepped glyph, so under reduced motion it reads
// as a mark rather than a block.
//
// It may only be rendered where matchPhase.isLiveNow() is true. Colour is --live; never gold.
export function Equaliser() {
  return (
    <span className="eq" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
