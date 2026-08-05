import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outputPath = path.resolve(root, "..", "..", "western-armenian-translator-production-widget-admin.zip");
const projectFolder = "western-armenian-translator";

const excludedNames = new Set(["node_modules", ".next", ".git", ".supabase", ".turbo", "coverage"]);
const excludedFiles = new Set([".env", ".env.local", "supabase/functions/.env", "supabase/functions/.env.local"]);

function shouldExclude(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const segments = normalized.split("/");
  if (segments.some((segment) => excludedNames.has(segment))) return true;
  if (excludedFiles.has(normalized)) return true;
  if (/^\.env\..*\.local$/u.test(path.basename(normalized))) return true;
  if (/\.log$/u.test(normalized) || /\.zip$/u.test(normalized) || /\.tsbuildinfo$/u.test(normalized)) return true;
  return false;
}

function walk(directory, base = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (shouldExclude(relative)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, relative));
    else if (entry.isFile()) files.push({ absolute, relative: `${projectFolder}/${relative}` });
  }
  return files;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value & 0xffff); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

const localParts = [];
const centralParts = [];
let offset = 0;
const files = walk(root).sort((a, b) => a.relative.localeCompare(b.relative));

for (const file of files) {
  const data = fs.readFileSync(file.absolute);
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(file.relative.replaceAll("\\", "/"), "utf8");
  const stat = fs.statSync(file.absolute);
  const { time, day } = dosDateTime(stat.mtime);
  const crc = crc32(data);
  const flags = 0x0800;
  const method = 8;

  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(flags), u16(method), u16(time), u16(day),
    u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), name
  ]);
  localParts.push(localHeader, compressed);

  const centralHeader = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(time), u16(day),
    u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(offset), name
  ]);
  centralParts.push(centralHeader);
  offset += localHeader.length + compressed.length;
}

const central = Buffer.concat(centralParts);
const end = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
  u32(central.length), u32(offset), u16(0)
]);

fs.writeFileSync(outputPath, Buffer.concat([...localParts, central, end]));
console.log(`Created ${outputPath}`);
console.log(`Included ${files.length} files.`);
