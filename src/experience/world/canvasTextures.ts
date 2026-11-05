import * as THREE from "three";
import type { RandomSource } from "./proceduralTextures";
import type { WorldRandom } from "./buildContext";

type Context2D = CanvasRenderingContext2D;

function createCanvas(
  width: number,
  height = width,
): [HTMLCanvasElement, Context2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext("2d")!];
}

export function canvasToTexture(canvas: HTMLCanvasElement, isColor = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createGlowTexture() {
  const [canvas, g] = createCanvas(128);
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return canvasToTexture(canvas);
}

export function createFlareTexture() {
  const [canvas, g] = createCanvas(256);
  g.translate(128, 128);
  const beams: [number, number, number][] = [
    [0, 128, 3],
    [Math.PI / 2, 90, 2],
    [Math.PI / 4, 50, 1.2],
    [-Math.PI / 4, 50, 1.2],
  ];
  beams.forEach(([angle, length, width]) => {
    g.save();
    g.rotate(angle);
    const gradient = g.createLinearGradient(-length, 0, length, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gradient;
    g.fillRect(-length, -width, length * 2, width * 2);
    g.restore();
  });
  return canvasToTexture(canvas);
}

function drawGlyph(g: Context2D, size: number, rand: RandomSource) {
  g.beginPath();
  const strokeCount = 2 + Math.floor(rand() * 3);
  for (let stroke = 0; stroke < strokeCount; stroke++) {
    g.moveTo((rand() - 0.5) * size, (rand() - 0.5) * size * 1.2);
    if (rand() < 0.4)
      g.quadraticCurveTo(
        (rand() - 0.5) * size * 1.4,
        (rand() - 0.5) * size,
        (rand() - 0.5) * size,
        (rand() - 0.5) * size * 1.2,
      );
    else g.lineTo((rand() - 0.5) * size, (rand() - 0.5) * size * 1.2);
  }
  g.stroke();
}

export function createRuneCircleTexture(rand: RandomSource) {
  const [canvas, g] = createCanvas(512);
  g.translate(256, 256);
  g.strokeStyle = "#fff";
  g.lineCap = "round";
  g.shadowColor = "#fff";
  g.shadowBlur = 8;
  [240, 226, 168, 112, 52].forEach((radius, i) => {
    g.lineWidth = i === 1 ? 1.5 : 3.5;
    g.beginPath();
    g.arc(0, 0, radius, 0, Math.PI * 2);
    g.stroke();
  });
  g.lineWidth = 2;
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const angle = (degrees * Math.PI) / 180;
    const tickLength = degrees % 30 === 0 ? 14 : 6;
    g.beginPath();
    g.moveTo(Math.cos(angle) * 226, Math.sin(angle) * 226);
    g.lineTo(
      Math.cos(angle) * (226 - tickLength),
      Math.sin(angle) * (226 - tickLength),
    );
    g.stroke();
  }
  g.lineWidth = 3;
  for (let triangle = 0; triangle < 2; triangle++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const angle =
        (i / 3) * Math.PI * 2 + (triangle * Math.PI) / 3 - Math.PI / 2;
      g.lineTo(Math.cos(angle) * 166, Math.sin(angle) * 166);
    }
    g.stroke();
  }
  for (let i = 0; i < 16; i++) {
    g.save();
    g.rotate((i / 16) * Math.PI * 2);
    g.translate(0, -197);
    drawGlyph(g, 18, rand);
    g.restore();
  }
  g.lineWidth = 5;
  g.save();
  g.scale(1.6, 1.6);
  drawGlyph(g, 30, rand);
  g.restore();
  return canvasToTexture(canvas);
}

function drawGoldInlay(g: Context2D, color: string) {
  g.strokeStyle = color;
  g.lineCap = "round";
  const rings: [number, number][] = [
    [470, 4],
    [432, 2.5],
    [140, 5],
    [160, 2.5],
  ];
  rings.forEach(([radius, width]) => {
    g.lineWidth = width;
    g.beginPath();
    g.arc(0, 0, radius, 0, Math.PI * 2);
    g.stroke();
  });
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2 + Math.PI / 4);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-60, -260);
    g.bezierCurveTo(-90, -330, 90, -330, 60, -260);
    g.stroke();
    g.beginPath();
    g.arc(0, -300, 16, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

function drawRuneRing(g: Context2D, rand: RandomSource) {
  for (let i = 0; i < 46; i++) {
    g.save();
    g.rotate((i / 46) * Math.PI * 2);
    g.translate(0, -451);
    drawGlyph(g, 16, rand);
    g.restore();
  }
}

/** The arena floor: colour, roughness and an emissive rune band that all share the same glyphs. */
export function createPlatformTextures(random: WorldRandom) {
  const rand = random.next;
  const SIZE = 1024;
  const [colorCanvas, g] = createCanvas(SIZE);
  const [roughCanvas, rg] = createCanvas(SIZE);
  g.translate(SIZE / 2, SIZE / 2);
  rg.translate(SIZE / 2, SIZE / 2);
  g.fillStyle = "#5d5884";
  g.beginPath();
  g.arc(0, 0, 512, 0, Math.PI * 2);
  g.fill();
  rg.fillStyle = "#d0d0d0";
  rg.fillRect(-512, -512, SIZE, SIZE);
  const ringRadii = [0, 120, 215, 305, 380, 455, 512];
  const slabCounts = [1, 12, 20, 28, 36, 44];
  for (let ring = 0; ring < slabCounts.length; ring++) {
    const innerRadius = ringRadii[ring];
    const outerRadius = ringRadii[ring + 1];
    const slabCount = slabCounts[ring];
    const offset = rand();
    for (let i = 0; i < slabCount; i++) {
      const startAngle = ((i + offset) / slabCount) * Math.PI * 2;
      const endAngle = ((i + 1 + offset) / slabCount) * Math.PI * 2;
      const value = rand();
      g.fillStyle =
        value < 0.5
          ? `rgba(22,15,42,${0.05 + value * 0.2})`
          : `rgba(255,250,255,${(value - 0.5) * 0.14})`;
      g.beginPath();
      g.arc(0, 0, outerRadius, startAngle, endAngle);
      g.arc(0, 0, innerRadius, endAngle, startAngle, true);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(16,10,30,0.7)";
      g.lineWidth = 3.5;
      g.stroke();
      const gray = (170 + value * 70) | 0;
      rg.fillStyle = `rgb(${gray},${gray},${gray})`;
      rg.beginPath();
      rg.arc(0, 0, outerRadius, startAngle, endAngle);
      rg.arc(0, 0, innerRadius, endAngle, startAngle, true);
      rg.closePath();
      rg.fill();
    }
  }
  g.strokeStyle = "rgba(14,9,28,0.5)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 46; i++) {
    let angle = rand() * Math.PI * 2;
    let radius = 130 + rand() * 360;
    g.beginPath();
    g.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    for (let segment = 0; segment < 4; segment++) {
      angle += (rand() - 0.5) * 0.06;
      radius += (rand() - 0.5) * 30;
      g.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    g.stroke();
  }
  const glyphSeed = random.state;
  drawGoldInlay(g, "#d9ad5c");
  g.lineWidth = 3;
  g.strokeStyle = "#d9ad5c";
  drawRuneRing(g, rand);
  random.state = glyphSeed;
  drawGoldInlay(rg, "#303030");
  rg.lineWidth = 3;
  rg.strokeStyle = "#303030";
  drawRuneRing(rg, rand);
  // emissive rune band: the same glyphs again
  random.state = glyphSeed;
  const [bandCanvas, eg] = createCanvas(SIZE);
  eg.translate(SIZE / 2, SIZE / 2);
  eg.strokeStyle = "#fff";
  eg.shadowColor = "#fff";
  eg.shadowBlur = 8;
  eg.lineCap = "round";
  eg.lineWidth = 3;
  drawRuneRing(eg, rand);
  eg.lineWidth = 2;
  [470, 432, 140].forEach((radius) => {
    eg.beginPath();
    eg.arc(0, 0, radius, 0, Math.PI * 2);
    eg.stroke();
  });
  return {
    colorCanvas,
    map: canvasToTexture(colorCanvas),
    roughness: canvasToTexture(roughCanvas, false),
    runeBand: canvasToTexture(bandCanvas, false),
  };
}

export function createGrateTexture() {
  const [canvas, g] = createCanvas(256);
  g.translate(128, 128);
  const gradient = g.createRadialGradient(0, 0, 0, 0, 0, 128);
  gradient.addColorStop(0, "#fff2c8");
  gradient.addColorStop(0.5, "#e0a24a");
  gradient.addColorStop(1, "#6a3c14");
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(0, 0, 128, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1e1630";
  g.lineWidth = 9;
  for (let i = -120; i <= 120; i += 26) {
    g.beginPath();
    g.moveTo(i, -128);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(-128, i);
    g.lineTo(128, i);
    g.stroke();
  }
  g.lineWidth = 14;
  g.strokeStyle = "#2a2040";
  g.beginPath();
  g.arc(0, 0, 121, 0, Math.PI * 2);
  g.stroke();
  return canvasToTexture(canvas);
}

export function createBeamTexture() {
  const [canvas, g] = createCanvas(4, 256);
  const gradient = g.createLinearGradient(0, 256, 0, 0);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 4, 256);
  return canvasToTexture(canvas);
}

export function createMoonTexture() {
  const [canvas, g] = createCanvas(256);
  g.fillStyle = "#f2ecff";
  g.beginPath();
  g.arc(128, 128, 100, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  g.arc(165, 105, 92, 0, Math.PI * 2);
  g.fill();
  return canvasToTexture(canvas);
}

export function createGlyphTexture(rand: RandomSource) {
  const [canvas, g] = createCanvas(64);
  g.translate(32, 32);
  g.strokeStyle = "#fff";
  g.lineWidth = 3.5;
  g.lineCap = "round";
  g.shadowColor = "#fff";
  g.shadowBlur = 6;
  drawGlyph(g, 34, rand);
  return canvasToTexture(canvas);
}

export function createShootingStarTexture() {
  const [canvas, g] = createCanvas(256, 8);
  const gradient = g.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.85, "rgba(220,240,255,0.7)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = gradient;
  g.fillRect(0, 2, 256, 4);
  return canvasToTexture(canvas);
}
