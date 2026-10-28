// Bookkeeping for the cine loop. The frames live on the GPU in a ring of layers (see sim.js); this keeps track of which layer holds what.
// Offset 0 is the newest frame, larger offsets are older.

export class Cine {
  constructor(capacity) {
    this.capacity = capacity;
    this.reset();
  }

  reset() {
    this.stored = 0; // frames written since the last reset
    this.meta = new Array(this.capacity).fill(null);
  }

  get length() {
    return Math.min(this.stored, this.capacity);
  }

  // Record a frame that was drawn into layer `stored % capacity`. Returns that layer.
  push(meta) {
    const layer = this.stored % this.capacity;
    this.meta[layer] = meta;
    this.stored++;
    return layer;
  }

  layerAt(offset) {
    if (this.length === 0) return -1;
    const o = Math.min(Math.max(0, Math.round(offset)), this.length - 1);
    return (this.stored - 1 - o + this.capacity * 2) % this.capacity;
  }

  frameAt(offset) {
    const layer = this.layerAt(offset);
    return layer < 0 ? null : { layer, meta: this.meta[layer] };
  }

  // Seconds covered by the stored frames, from the timestamps in their metadata.
  duration() {
    if (this.length < 2) return 0;
    const newest = this.meta[this.layerAt(0)]?.time ?? 0;
    const oldest = this.meta[this.layerAt(this.length - 1)]?.time ?? 0;
    return newest - oldest;
  }
}
