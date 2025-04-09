import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { Noise } from "./Noise.js"; // Import the MODIFIED Noise class

export class Chunk {
    private cubes: number;
    private cubePositionsF32: Float32Array;
    private chunkX: number;
    private chunkZ: number;
    private size: number;
    // REMOVE: private noise: Noise;
    // REMOVE: private seed: string;

    private heightMap: number[][];
    private minWorldX: number;
    private minWorldZ: number;
    private maxWorldX: number;
    private maxWorldZ: number;

    constructor(chunkX: number, chunkZ: number, size: number) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.size = size;

        this.minWorldX = this.chunkX * this.size;
        this.minWorldZ = this.chunkZ * this.size;
        this.maxWorldX = this.minWorldX + this.size;
        this.maxWorldZ = this.minWorldZ + this.size;

        // REMOVE: this.seed = `${this.chunkX},${this.chunkZ}`;
        // REMOVE: this.noise = new Noise(this.seed);

        this.heightMap = Array.from({ length: size }, () => Array(size).fill(0));
        this.cubes = 0;
        this.cubePositionsF32 = new Float32Array(0);

        this.generateCubes();
    }


    private generateCubes() {
        const baseHeight = 10;
        const terrainAmplitude = 80;
        const noiseScale = 0.02;
        const octaves = 4;
        const persistence = 0.5;
        const frequency = 1.0; // Base frequency for octaveNoise

        let totalCubes = 0;
        // Calculate heightmap first
        for (let i = 0; i < this.size; i++) { // Local Z -> World Z
            for (let j = 0; j < this.size; j++) { // Local X -> World X
                const worldX = this.minWorldX + j;
                const worldZ = this.minWorldZ + i;

                // *** CALL STATIC Noise method ***
                const noiseVal = Noise.octaveNoise(
                    worldX * noiseScale,
                    worldZ * noiseScale,
                    octaves,
                    persistence,
                    frequency // Pass base frequency here
                );

                const height = Math.floor(baseHeight + noiseVal * terrainAmplitude);
                const clampedHeight = Math.max(0, Math.min(100, height));
                this.heightMap[i][j] = clampedHeight;

                const minYDraw = 0;
                totalCubes += Math.max(0, clampedHeight - minYDraw + 1);
            }
        }

        // Allocate and fill buffer (same as before)
        this.cubes = totalCubes;
        this.cubePositionsF32 = new Float32Array(Math.max(0, 4 * this.cubes));
        let bufferIndex = 0;
        const minYDraw = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = this.heightMap[i][j];
                const worldX = this.minWorldX + j;
                const worldZ = this.minWorldZ + i;
                for (let y = minYDraw; y <= height; y++) {
                     if (bufferIndex + 3 < this.cubePositionsF32.length) {
                        this.cubePositionsF32[bufferIndex++] = worldX;
                        this.cubePositionsF32[bufferIndex++] = y;
                        this.cubePositionsF32[bufferIndex++] = worldZ;
                        this.cubePositionsF32[bufferIndex++] = 0;
                     } else {
                        console.error(`Buffer overflow during chunk gen! Chunk ${this.chunkX},${this.chunkZ}`);
                        i = this.size; j = this.size; break; // Stop filling
                     }
                }
            }
        }
         this.cubes = Math.floor(bufferIndex / 4); // Update count in case of overflow

    }

    // getHeight, hasBlock, cubePositions, numCubes remain the same

    /**
     * Gets the Y coordinate of the highest solid block at the given
     * world integer coordinates (X, Z). Returns -1 if outside chunk bounds or no block.
     */
    public getHeight(worldX: number, worldZ: number): number {
        const ix = Math.floor(worldX);
        const iz = Math.floor(worldZ);

        if (ix < this.minWorldX || ix >= this.maxWorldX ||
            iz < this.minWorldZ || iz >= this.maxWorldZ) {
            return -1;
        }
        const localX = ix - this.minWorldX;
        const localZ = iz - this.minWorldZ;

         if (localZ < 0 || localZ >= this.size || localX < 0 || localX >= this.size) {
            // This should not happen if the first check passed, but safety first
            return -1;
        }
        return this.heightMap[localZ][localX];
    }

    public hasBlock(worldX: number, worldY: number, worldZ: number): boolean {
        const terrainHeight = this.getHeight(worldX, worldZ);
        return worldY >= 0 && worldY <= terrainHeight;
    }

    public cubePositions(): Float32Array {
        return this.cubePositionsF32.slice(0, this.cubes * 4);
    }

    public numCubes(): number {
        return this.cubes;
    }
}
