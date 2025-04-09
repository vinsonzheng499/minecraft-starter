import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { Noise } from "./Noise.js";

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private chunkX: number; // Chunk coordinate X (integer)
    private chunkZ: number; // Chunk coordinate Z (integer)
    private size: number; // Number of cubes along each side of the chunk
    private noise: Noise;
    private seed: string;

    // Store heightmap for efficient block checking
    private heightMap: number[][]; 
    // Store min/max world coords for convenience
    private minWorldX: number;
    private minWorldZ: number;
    private maxWorldX: number;
    private maxWorldZ: number;


    // Use chunk coordinates (integers) for constructor
    constructor(chunkX: number, chunkZ: number, size: number) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.size = size;
        
        // Calculate world coordinates of the chunk boundaries
        this.minWorldX = this.chunkX * this.size;
        this.minWorldZ = this.chunkZ * this.size;
        this.maxWorldX = this.minWorldX + this.size;
        this.maxWorldZ = this.minWorldZ + this.size;
        
        // Create a unique, deterministic seed for this chunk based on its coordinates
        this.seed = `${this.chunkX},${this.chunkZ}`; 
        this.noise = new Noise(this.seed); // Initialize noise generator with chunk-specific seed
        
        this.heightMap = Array.from({ length: size }, () => Array(size).fill(0));
        this.cubes = 0; // Will be calculated
        this.cubePositionsF32 = new Float32Array(0); // Will be allocated

        this.generateCubes();
    }
    
    
    private generateCubes() {
        const baseHeight = 10; // Minimum ground level
        const terrainAmplitude = 80; // Max height variation above base
        const noiseScale = 0.02; // Controls the "zoom" level of the noise. Smaller values -> larger features.
        const octaves = 4; // Number of noise layers
        const persistence = 0.5; // How much each octave contributes (amplitude multiplier)
        const frequency = 1.0; // Base frequency for the first octave

        // Pass 1: Calculate height map and total number of cubes
        let totalCubes = 0;
        for (let i = 0; i < this.size; i++) { // Local Z
            for (let j = 0; j < this.size; j++) { // Local X
                const worldX = this.minWorldX + j;
                const worldZ = this.minWorldZ + i;

                // Get multi-octave noise value [0, 1]
                const noiseVal = this.noise.octaveNoise(
                    worldX * noiseScale, 
                    worldZ * noiseScale, 
                    octaves, 
                    persistence, 
                    frequency
                );

                // Map noise value to height range [baseHeight, baseHeight + terrainAmplitude]
                const height = Math.floor(baseHeight + noiseVal * terrainAmplitude);
                
                // Clamp height just in case (though noise should be in [0,1])
                const clampedHeight = Math.max(0, Math.min(100, height)); // Ensure height stays within reasonable bounds [0, 100]

                this.heightMap[i][j] = clampedHeight;
                
                // Cubes are stacked from y=0 up to and including 'clampedHeight'
                totalCubes += (clampedHeight + 1); 
            }
        }

        // Allocate the buffer
        this.cubes = totalCubes;
        this.cubePositionsF32 = new Float32Array(4 * this.cubes);

        // Pass 2: Fill the cube positions buffer
        let bufferIndex = 0;
        for (let i = 0; i < this.size; i++) { // Local Z
            for (let j = 0; j < this.size; j++) { // Local X
                const height = this.heightMap[i][j];
                const worldX = this.minWorldX + j; // Center of the cube column horizontally
                const worldZ = this.minWorldZ + i; // Center of the cube column horizontally

                for (let y = 0; y <= height; y++) {
                    this.cubePositionsF32[bufferIndex++] = worldX; // Cube center X
                    this.cubePositionsF32[bufferIndex++] = y;      // Cube center Y
                    this.cubePositionsF32[bufferIndex++] = worldZ; // Cube center Z
                    this.cubePositionsF32[bufferIndex++] = 0;      // W component (padding for vec4 attribute)
                }
            }
        }
         // Verify buffer fill correctness (optional debug check)
        // if (bufferIndex !== this.cubePositionsF32.length) {
        //     console.error(`Buffer fill mismatch in chunk ${this.seed}. Expected ${this.cubePositionsF32.length}, got ${bufferIndex}`);
        // }
    }
    
    /**
     * Checks if a block exists at the given world integer coordinates.
     * Assumes worldX, worldY, worldZ are already floored integers.
     */
    public hasBlock(worldX: number, worldY: number, worldZ: number): boolean {
        // Check if coordinate is within this chunk's horizontal bounds
        if (worldX < this.minWorldX || worldX >= this.maxWorldX || 
            worldZ < this.minWorldZ || worldZ >= this.maxWorldZ) {
            return false; // Coordinate is not in this chunk
        }
        
        // Convert world coordinates to local chunk indices
        const localX = worldX - this.minWorldX;
        const localZ = worldZ - this.minWorldZ;

        // Check bounds again (should be redundant but safe)
         if (localX < 0 || localX >= this.size || localZ < 0 || localZ >= this.size) {
            console.warn("Local coordinate out of bounds in hasBlock check - should not happen");
            return false; 
        }

        // Get the height of the terrain column at this local position
        const terrainHeight = this.heightMap[localZ][localX]; // Note: heightMap is [z][x]

        // A block exists if the query Y is non-negative and less than or equal to the terrain height
        return worldY >= 0 && worldY <= terrainHeight;
    }

    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }
        
    public numCubes(): number {
        return this.cubes;
    }
}
