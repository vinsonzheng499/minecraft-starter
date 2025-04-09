// FILE: App.ts (Corrected Constructor)

import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import {

  blankCubeFSText,
  blankCubeVSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;
  
  // Chunk management
  private loadedChunks: Map<string, Chunk>; // Key: "x,z"
  private currentChunkX: number;
  private currentChunkZ: number;
  private readonly chunkSize: number = 64; // *** Defined here ***
  private readonly renderDistance: number = 1; // *** Defined here *** Render 3x3 (1+1+1) chunks around player

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass; // Declaration
  private combinedCubeOffsets: Float32Array;
  private totalCubesToDraw: number;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  
  // Player state
  private playerPosition: Vec3;
  private playerVelocity: Vec3;
  private isJumping: boolean;
  private readonly gravity: number = -25.0; // *** Defined here *** Units per second squared
  private readonly jumpSpeed: number = 10.0; // *** Defined here *** Units per second
  private readonly playerHeight: number = 2.0; // *** Defined here ***
  private readonly playerRadius: number = 0.4; // *** Defined here ***
  private readonly terminalVelocity: number = -50.0; // *** Defined here *** Max falling speed
  
  private lastFrameTime: number;


  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
  
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
        
    // Initialize GUI early as other parts might depend on it indirectly
    this.gui = new GUI(this.canvas2d, this); 
    
    // Initialize player state 
    this.playerPosition = new Vec3([this.chunkSize * 0.5, 105, this.chunkSize * 0.5]); // Start near center of chunk 0,0
    this.playerVelocity = new Vec3([0, 0, 0]);
    this.isJumping = false;
    this.lastFrameTime = performance.now();
    // chunkSize, renderDistance etc. are defined above as class members

    // Update GUI camera to initial player position AFTER player pos is set
    this.gui.setCamera(
      this.playerPosition, 
      Vec3.sum(this.playerPosition, new Vec3([0, 0, -1])), 
      new Vec3([0, 1, 0]),
      45, 
      this.canvas2d.width / this.canvas2d.height, 
      0.1, 
      1000.0 
    );
    
    // --- Initialize Rendering Setup FIRST ---
    this.blankCubeRenderPass = new RenderPass(gl, blankCubeVSText, blankCubeFSText); // Create RenderPass instance
    this.cubeGeometry = new Cube();
    this.initBlankCube(); // Initialize geometry and RenderPass attributes/uniforms
    
    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.529, 0.808, 0.922, 1.0]); // Sky blue background    

    // --- Initialize Chunk Management SECOND ---
    this.loadedChunks = new Map<string, Chunk>();
    this.currentChunkX = this.getPlayerChunkX();
    this.currentChunkZ = this.getPlayerChunkZ();

    // Initialize combined buffer and count before first load
    this.combinedCubeOffsets = new Float32Array(0);
    this.totalCubesToDraw = 0;

    // Now, load initial chunks. This is SAFE because blankCubeRenderPass exists.
    this.updateChunks(this.currentChunkX, this.currentChunkZ); 
    
    // Note: combinedCubeOffsets and totalCubesToDraw are updated inside updateChunks -> aggregateChunkData
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {    
      // Reset player state FIRST
      this.playerPosition = new Vec3([this.chunkSize * 0.5, 105, this.chunkSize * 0.5]); 
      this.playerVelocity = new Vec3([0, 0, 0]);
      this.isJumping = false;
      
      // Reset GUI (specifically keys, and update camera to new player pos)
      this.gui.reset(); // Clears key states
      this.gui.setCamera( // Update camera position
        this.playerPosition, 
        Vec3.sum(this.playerPosition, new Vec3([0, 0, -1])), 
        new Vec3([0, 1, 0]),
        45, this.canvas2d.width / this.canvas2d.height, 0.1, 1000.0
      );
            
      // Reload chunks around the reset position
      this.loadedChunks.clear();
      this.currentChunkX = this.getPlayerChunkX();
      this.currentChunkZ = this.getPlayerChunkZ();
      // This call is now safe as renderpass exists
      this.updateChunks(this.currentChunkX, this.currentChunkZ);
  }
  
  
  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    // Vertex positions, normals, UVs are the same for all cubes
    this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.blankCubeRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
    this.blankCubeRenderPass.addAttribute("aNorm", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
    this.blankCubeRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.uvFlat());
    
    // Instanced attribute for cube offsets (translations)
    // Initialize with an empty buffer. It will be updated by aggregateChunkData.
    this.blankCubeRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));

    // Uniforms
    this.blankCubeRenderPass.addUniform("uLightPos", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => { gl.uniform4fv(loc, this.lightPosition.xyzw); });
    this.blankCubeRenderPass.addUniform("uProj", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => { gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all())); });
    this.blankCubeRenderPass.addUniform("uView", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => { gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all())); });
    
    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();    
  }


  /** Helper to get player's current chunk X coordinate */
  private getPlayerChunkX(): number {
      // Ensure chunkSize is available
      return Math.floor(this.playerPosition.x / this.chunkSize);
  }

  /** Helper to get player's current chunk Z coordinate */
  private getPlayerChunkZ(): number {
      // Ensure chunkSize is available
      return Math.floor(this.playerPosition.z / this.chunkSize);
  }

  /** Check if a block exists at the given world coordinates */
  private isBlockAt(worldX: number, worldY: number, worldZ: number): boolean {
      const ix = Math.floor(worldX);
      const iy = Math.floor(worldY);
      const iz = Math.floor(worldZ);

      // Before calculating chunk coords, check basic Y bounds
      if (iy < 0) return false; // Nothing below Y=0 in this model

      const chunkX = Math.floor(ix / this.chunkSize);
      const chunkZ = Math.floor(iz / this.chunkSize);
      const key = `${chunkX},${chunkZ}`;

      const chunk = this.loadedChunks.get(key);
      if (!chunk) {
          // If the chunk isn't loaded, we can't collide with it.
          // A more advanced system might predict height, but for now, treat as empty.
          return false; 
      }

      return chunk.hasBlock(ix, iy, iz);
  }


  /** Update player physics and handle collisions */
  private updatePlayer(deltaTime: number): void {
      // Clamp deltaTime to prevent physics explosions on lag spikes or tab resumes
      const dt = Math.min(deltaTime, 0.1); // Max 100ms step

      // 1. Apply Gravity
      this.playerVelocity.y += this.gravity * dt;
      // Clamp falling speed
      this.playerVelocity.y = Math.max(this.playerVelocity.y, this.terminalVelocity);

      // 2. Get potential movement vector (Input + Gravity)
      let walkDir = this.gui.walkDir(); // Get normalized horizontal movement intention
      walkDir.scale(5.0); // Apply walking speed (5 units/sec)

      // Calculate total velocity for this step
      let currentVelocity = new Vec3([
          walkDir.x, // Use intended walk velocity directly for this step
          this.playerVelocity.y, // Use accumulated gravity velocity
          walkDir.z  // Use intended walk velocity directly for this step
      ]);
      
      let potentialMove = currentVelocity.scale(dt); // Scale total velocity by delta time

      // 3. Collision Detection and Resolution (Iterative approach is better, but simple axis check first)
      
      let currentPos = this.playerPosition.copy(); // Start from current known good position
      let nextPos = Vec3.sum(currentPos, potentialMove); // Target position if no collision

      // Separate checks for each axis to allow sliding

      // Check Y axis
      if (potentialMove.y !== 0) {
          let checkPosY = currentPos.copy();
          checkPosY.y += potentialMove.y; 
          if (this.checkCollision(checkPosY)) {
                // Collision detected on Y axis
                if (potentialMove.y < 0) { // Moving down
                   this.playerPosition.y = Math.floor(this.playerPosition.y - this.playerHeight) + this.playerHeight + 0.001; // Land slightly above block
                   this.isJumping = false;
                } else { // Moving up
                   this.playerPosition.y = Math.floor(checkPosY.y) - 0.001; // Hit ceiling, place head just below
                }
                this.playerVelocity.y = 0; // Stop vertical movement
                potentialMove.y = 0; // Prevent further Y movement this frame
          } else {
               this.playerPosition.y += potentialMove.y; // No Y collision, apply move
          }
      }
      
      // Check X axis
      if (potentialMove.x !== 0) {
          let checkPosX = this.playerPosition.copy(); // Use the potentially updated Y position
          checkPosX.x += potentialMove.x;
          if (this.checkCollision(checkPosX)) {
               potentialMove.x = 0; // Collision on X, stop X movement
               this.playerVelocity.x = 0; // Also kill any X momentum if needed
          } else {
               this.playerPosition.x += potentialMove.x; // No X collision, apply move
          }
      }

       // Check Z axis
      if (potentialMove.z !== 0) {
          let checkPosZ = this.playerPosition.copy(); // Use the potentially updated Y and X positions
          checkPosZ.z += potentialMove.z;
           if (this.checkCollision(checkPosZ)) {
               potentialMove.z = 0; // Collision on Z, stop Z movement
               this.playerVelocity.z = 0; // Also kill any Z momentum if needed
           } else {
               this.playerPosition.z += potentialMove.z; // No Z collision, apply move
           }
      }


      // Prevent falling through world if somehow below y=0
      if (this.playerPosition.y < -50) { // Give some buffer
          console.warn("Player fell out of world, resetting.");
          this.reset();
          return;
      }

      // 5. Update camera position to the final resolved player position
      this.gui.getCamera().setPos(this.playerPosition);
  }

  /** Collision checking helper based on player bounding box at a given position */
  private checkCollision(checkPos: Vec3): boolean {
      // Check multiple points around the player's bounding box
      // Feet, Mid, Head levels at corners
      for (let dy = 0; dy <= this.playerHeight; dy += this.playerHeight / 2.0) { // Check Feet, Mid, Head
          let y = checkPos.y - dy; 
           for (let dx = -this.playerRadius; dx <= this.playerRadius; dx += 2 * this.playerRadius) {
              for (let dz = -this.playerRadius; dz <= this.playerRadius; dz += 2 * this.playerRadius) {
                  let x = checkPos.x + dx;
                  let z = checkPos.z + dz;
                  if (this.isBlockAt(x, y, z)) {
                      return true; // Collision detected
                  }
              }
          }
      }
      // Check center point at feet level as well (important for landing on single blocks)
       if (this.isBlockAt(checkPos.x, checkPos.y - this.playerHeight, checkPos.z)) {
            return true;
       }

      return false; // No collision
  }


  /** Check for chunk boundary crossing and update loaded chunks */
  private checkAndUpdateChunks(): void {
      const newChunkX = this.getPlayerChunkX();
      const newChunkZ = this.getPlayerChunkZ();

      if (newChunkX !== this.currentChunkX || newChunkZ !== this.currentChunkZ) {
          console.log(`Crossed chunk boundary from ${this.currentChunkX},${this.currentChunkZ} to ${newChunkX}, ${newChunkZ}`);
          this.currentChunkX = newChunkX;
          this.currentChunkZ = newChunkZ;
          this.updateChunks(this.currentChunkX, this.currentChunkZ);
      }
  }

  /** Load/Unload chunks based on player's current chunk coordinates */
  private updateChunks(centerX: number, centerZ: number): void {
      const requiredChunks = new Set<string>();
      const chunksToLoad: { x: number, z: number }[] = [];

      // Determine required chunks based on renderDistance
      for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
          for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
              const x = centerX + dx;
              const z = centerZ + dz;
              const key = `${x},${z}`;
              requiredChunks.add(key);
              if (!this.loadedChunks.has(key)) {
                  chunksToLoad.push({ x, z });
              }
          }
      }

      // Unload old chunks (find keys present in loadedChunks but not in requiredChunks)
      const currentKeys = Array.from(this.loadedChunks.keys());
      for (const key of currentKeys) {
          if (!requiredChunks.has(key)) {
              console.log("Unloading chunk:", key);
              this.loadedChunks.delete(key);
              // In a more complex engine, you might explicitly free GPU resources here if needed
          }
      }

      // Load new chunks
      let newChunksLoaded = false;
      for (const pos of chunksToLoad) {
          const key = `${pos.x},${pos.z}`;
          console.log("Loading chunk:", key);
          // Pass chunk coordinates to Chunk constructor for seeding and positioning
          const newChunk = new Chunk(pos.x, pos.z, this.chunkSize); 
          this.loadedChunks.set(key, newChunk);
          newChunksLoaded = true;
      }

      // Regenerate combined buffer for rendering IF chunks were loaded or unloaded
      if (newChunksLoaded || currentKeys.length !== this.loadedChunks.size) {
           this.aggregateChunkData();
      }
  }

  /** Combine offset data from all loaded chunks into a single buffer */
  private aggregateChunkData(): void {
      // Calculate total number of cubes across all loaded chunks
      this.totalCubesToDraw = 0;
      for (const chunk of this.loadedChunks.values()) {
          this.totalCubesToDraw += chunk.numCubes();
      }

      console.log(`Aggregating data for ${this.loadedChunks.size} chunks. Total cubes: ${this.totalCubesToDraw}`);

      // Allocate or reallocate the combined buffer
      // Avoid reallocating if size hasn't changed significantly (optimization - not strictly needed now)
      this.combinedCubeOffsets = new Float32Array(this.totalCubesToDraw * 4);

      // Fill the buffer
      let bufferOffset = 0;
      for (const chunk of this.loadedChunks.values()) {
          const chunkOffsets = chunk.cubePositions();
          if (chunkOffsets.length > 0) {
            this.combinedCubeOffsets.set(chunkOffsets, bufferOffset);
            bufferOffset += chunkOffsets.length;
          }
      }
       // Sanity check
       if (bufferOffset !== this.combinedCubeOffsets.length) {
           console.error(`Buffer offset mismatch after aggregation: expected ${this.combinedCubeOffsets.length}, got ${bufferOffset}`);
       }


      // Update the GPU buffer - Ensure blankCubeRenderPass is valid!
      if (this.blankCubeRenderPass && this.totalCubesToDraw > 0) {
          this.blankCubeRenderPass.updateAttributeBuffer("aOffset", this.combinedCubeOffsets);
      } else if (this.totalCubesToDraw === 0) {
          // Handle the case of no cubes to draw (e.g., clear the buffer or pass size 0)
           this.blankCubeRenderPass.updateAttributeBuffer("aOffset", new Float32Array(0));
      } else {
          console.error("aggregateChunkData called but blankCubeRenderPass is not initialized!");
      }
  }


  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000.0; // Delta time in seconds
    this.lastFrameTime = currentTime;

    // Update player physics and position
    this.updatePlayer(deltaTime);
    
    // Check if player crossed chunk boundary and load/unload chunks
    this.checkAndUpdateChunks(); // This now only calls aggregateChunkData if needed

    // Drawing setup
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 0, this.canvas2d.width, this.canvas2d.height);
  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    // Draw all cubes from loaded chunks using the combined offset buffer
    if (this.blankCubeRenderPass && this.totalCubesToDraw > 0) {
        // The buffer is updated in aggregateChunkData when chunks change.
        // Uniforms (like view/proj) are updated via callbacks automatically by RenderPass.
        this.blankCubeRenderPass.drawInstanced(this.totalCubesToDraw);
    }
  }

  public getGUI(): GUI {
    return this.gui;
  }  
  
  public jump(): void {
      // Check if player is on the ground using collision check slightly below feet
      const groundCheckPos = this.playerPosition.copy();
      groundCheckPos.y -= 0.05; // Check just slightly below current feet position

      // We need a slightly more nuanced check than just checkCollision, 
      // as checkCollision checks the whole body. We only care about feet support.
      let onGround = false;
      const groundY = Math.floor(this.playerPosition.y - this.playerHeight - 0.01); // Y level of block potentially under feet
      for (let dx = -this.playerRadius; dx <= this.playerRadius; dx += this.playerRadius) { // Check corners and center X
          for (let dz = -this.playerRadius; dz <= this.playerRadius; dz += this.playerRadius) { // Check corners and center Z
              if (this.isBlockAt(this.playerPosition.x + dx, groundY, this.playerPosition.z + dz)) {
                  onGround = true;
                  break;
              }
          }
          if (onGround) break;
      }


      // Allow jump only if considered on ground and vertical velocity is small (not already flying up)
      if (onGround && this.playerVelocity.y <= 0.1) { 
          this.playerVelocity.y = this.jumpSpeed;
          this.isJumping = true; // Optional flag
          // console.log("Jump!");
      } else {
          // console.log("Cannot jump - OnGround:", onGround, "VelocityY:", this.playerVelocity.y);
      }
  }
}

// No changes needed below this line if initializeCanvas just creates MinecraftAnimation
export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();  
}
