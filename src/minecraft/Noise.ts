import Rand from "../lib/rand-seed/Rand.js"; // We still need Rand for the coordinate seeding

// Define a global seed for the entire world. Change this for different worlds.
const WORLD_SEED = "my_minecraft_world_42";

export class Noise {

    // Generates a deterministic, unique seed string for a given integer coordinate pair
    // based on the global world seed.
    private static getCoordinateSeed(ix: number, iz: number): string {
        // Simple but effective: combine world seed and coordinates.
        // Order matters, and include separators to avoid collisions like (1, 23) vs (12, 3).
        return `${WORLD_SEED}|${ix}|${iz}`;
    }

    // Generates a consistent random float [0, 1) for given GLOBAL integer coords.
    // This value depends *only* on the coordinates and the WORLD_SEED.
    private static getConstantRandomValue(ix: number, iz: number): number {
        const coordSeed = Noise.getCoordinateSeed(ix, iz);
        // Create a temporary Rand instance seeded *only* by the coordinate-specific seed.
        const coordRand = new Rand(coordSeed);
        // Return the first pseudo-random number from this unique generator.
        return coordRand.next();
    }


    // --- Value Noise logic remains mostly the same, but becomes STATIC ---

    private static fade(t: number): number {
        // Ken Perlin's improved smoothstep: 6t^5 - 15t^4 + 10t^3
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private static lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }

    /**
     * Calculates 2D Value Noise at the given coordinates.
     * Result is typically in the range [0, 1].
     * Uses STATIC getConstantRandomValue for grid points.
     */
    public static valueNoise(x: number, z: number): number {
        const gx0 = Math.floor(x);
        const gz0 = Math.floor(z);
        const gx1 = gx0 + 1;
        const gz1 = gz0 + 1;

        // Fractional parts
        const tx = x - gx0;
        const tz = z - gz0;

        // Smooth interpolation weights
        const u = this.fade(tx);
        const v = this.fade(tz);

        // Get random values at the four corner grid points using the GLOBAL method
        const v00 = this.getConstantRandomValue(gx0, gz0);
        const v10 = this.getConstantRandomValue(gx1, gz0);
        const v01 = this.getConstantRandomValue(gx0, gz1);
        const v11 = this.getConstantRandomValue(gx1, gz1);

        // Bilinear interpolation
        const nx0 = this.lerp(v00, v10, u);
        const nx1 = this.lerp(v01, v11, u);

        return this.lerp(nx0, nx1, v);
    }

    /**
     * Generates multi-octave Value Noise by summing scaled layers of valueNoise.
     * @param x X coordinate
     * @param z Z coordinate
     * @param octaves Number of noise layers to sum.
     * @param persistence Amplitude multiplier for each successive octave (e.g., 0.5).
     * @param frequency Base frequency (scale) for the first octave.
     * @returns Normalized noise value in the range [0, 1].
     */
    public static octaveNoise(x: number, z: number, octaves: number, persistence: number, frequency: number): number {
        let total = 0;
        let amplitude = 1.0;
        let currentFrequency = frequency;
        let maxValue = 0; // Used for normalization

        for (let i = 0; i < octaves; i++) {
            // Call the STATIC valueNoise method
            total += this.valueNoise(x * currentFrequency, z * currentFrequency) * amplitude;

            maxValue += amplitude; // Accumulate max possible value for normalization
            amplitude *= persistence; // Decrease amplitude for next octave
            currentFrequency *= 2; // Increase frequency for next octave (usually 2 for fractal noise)
        }

        // Normalize the result to be between 0 and 1
        // Avoid division by zero if maxValue somehow ends up as 0
        return maxValue === 0 ? 0 : total / maxValue;
    }
}
