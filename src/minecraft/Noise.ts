import Rand from "../lib/rand-seed/Rand.js";

export class Noise {
    private static readonly PERMUTATION_TABLE_SIZE = 256;
    private p: number[]; // Permutation table
    private seed: string;
    private rand: Rand;

    constructor(seed: string) {
        this.seed = seed;
        this.rand = new Rand(this.seed);
        this.p = [];
        const source = Array.from({ length: Noise.PERMUTATION_TABLE_SIZE }, (_, i) => i);

        // Shuffle the source array using the seeded RNG
        for (let i = source.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand.next() * (i + 1));
            [source[i], source[j]] = [source[j], source[i]]; // Swap
        }

        // Double the permutation table for easier wrapping
        this.p = source.concat(source);
    }

    // Simple pseudo-random value for a given integer coordinate pair
    // Uses the permutation table approach for consistency across calls
    // needed for value noise corners.
    private getConstantRandomValue(x: number, z: number): number {
        // Ensure integer coordinates
        x = Math.floor(x);
        z = Math.floor(z);

        // Wrap coordinates using the permutation table size
        const X = x & (Noise.PERMUTATION_TABLE_SIZE - 1);
        const Z = z & (Noise.PERMUTATION_TABLE_SIZE - 1);

        // Generate a pseudo-random value using the permutation table
        // This ensures that the same (x, z) always yields the same value
        // based on the initial seed/shuffling.
        const hash = this.p[this.p[X] + Z];
        
        // Normalize to [0, 1) - Use a simple method based on hash
        // Convert hash (0-255) to a float between 0 and 1.
        return (hash / (Noise.PERMUTATION_TABLE_SIZE - 1.0)); 
    }


    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10); // Improved smoothstep curve: 6t^5 - 15t^4 + 10t^3
    }

    private lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }

    // Value noise implementation
    public valueNoise(x: number, z: number): number {
        const gx0 = Math.floor(x);
        const gz0 = Math.floor(z);
        const gx1 = gx0 + 1;
        const gz1 = gz0 + 1;

        const tx = x - gx0;
        const tz = z - gz0;

        const u = this.fade(tx);
        const v = this.fade(tz);

        const v00 = this.getConstantRandomValue(gx0, gz0);
        const v10 = this.getConstantRandomValue(gx1, gz0);
        const v01 = this.getConstantRandomValue(gx0, gz1);
        const v11 = this.getConstantRandomValue(gx1, gz1);

        const nx0 = this.lerp(v00, v10, u);
        const nx1 = this.lerp(v01, v11, u);

        return this.lerp(nx0, nx1, v);
    }

    // Generate multi-octave value noise
    public octaveNoise(x: number, z: number, octaves: number, persistence: number, frequency: number): number {
        let total = 0;
        let amplitude = 1;
        let maxValue = 0; // Used for normalization

        for (let i = 0; i < octaves; i++) {
            total += this.valueNoise(x * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        // Normalize the result to be between 0 and 1
        return total / maxValue;
    }
}
