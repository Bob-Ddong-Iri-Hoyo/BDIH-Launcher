import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import crypto from "crypto";
import path from "path";
import { pathToFileURL } from "url";
import { get_default_icon_cache_path } from "../Environment/AppPaths";

/**
 * Extracts Windows executable icons into a stable launcher cache.
 *
 * This parser reads PE resources directly, so it does not require `wrestool`,
 * `icotool`, Wine, or any host-side icon extraction binary. Callers still treat
 * extraction as optional: unsupported EXEs simply keep their normal fallback.
 */
export class IconManager {
  async extractExecutableIcon(
    executablePath?: string,
    cacheDirectoryPath = get_default_icon_cache_path(),
  ): Promise<string | undefined> {
    if (!executablePath || !existsSync(executablePath)) {
      return undefined;
    }

    const cacheBasePath = this.createCacheBasePath(executablePath, cacheDirectoryPath);
    const icoCachePath = `${cacheBasePath}.ico`;

    if (existsSync(icoCachePath)) {
      return pathToFileURL(icoCachePath).toString();
    }

    mkdirSync(path.dirname(cacheBasePath), { recursive: true });

    try {
      writeFileSync(icoCachePath, extractIcoFromPe(executablePath));
      return pathToFileURL(icoCachePath).toString();
    } catch {
      return undefined;
    }
  }

  private createCacheBasePath(executablePath: string, cacheDirectoryPath: string): string {
    const stat = statSync(executablePath);
    const cacheKey = crypto
      .createHash("sha1")
      .update(path.resolve(executablePath))
      .update(String(stat.size))
      .update(String(stat.mtimeMs))
      .digest("hex");

    return path.join(cacheDirectoryPath, cacheKey);
  }
}

interface PeSection {
  virtualSize: number;
  virtualAddress: number;
  rawSize: number;
  rawPointer: number;
}

interface PeImage {
  buffer: Buffer;
  sections: PeSection[];
  resourceDirectoryOffset: number;
}

interface ResourceEntry {
  id: number;
  isDirectory: boolean;
  offset: number;
}

interface ResourceData {
  nameId: number;
  data: Buffer;
}

interface GroupIconEntry {
  width: number;
  height: number;
  colorCount: number;
  reserved: number;
  planes: number;
  bitCount: number;
  iconId: number;
}

function extractIcoFromPe(executablePath: string): Buffer {
  const pe = readPe(executablePath);
  const groupIconEntries = readResourceType(pe, 14);
  const iconEntries = readResourceType(pe, 3);

  if (groupIconEntries.length === 0) {
    throw new Error("RT_GROUP_ICON not found");
  }

  if (iconEntries.length === 0) {
    throw new Error("RT_ICON not found");
  }

  const iconById = new Map(iconEntries.map((entry) => [entry.nameId, entry.data]));
  const group = groupIconEntries
    .map((entry) => parseGroupIcon(entry.data))
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => groupIconScore(right) - groupIconScore(left))[0];

  if (!group) {
    throw new Error("group icon is empty");
  }

  const images = group
    .map((entry) => ({
      entry,
      data: iconById.get(entry.iconId),
    }))
    .filter((candidate): candidate is { entry: GroupIconEntry; data: Buffer } => Boolean(candidate.data));

  if (images.length === 0) {
    throw new Error("group icon references no available RT_ICON images");
  }

  return buildIco(images);
}

function readPe(executablePath: string): PeImage {
  const buffer = readFileSync(executablePath);

  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("not an MZ executable");
  }

  const peOffset = buffer.readUInt32LE(0x3c);

  if (buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error("PE signature not found");
  }

  const numberOfSections = buffer.readUInt16LE(peOffset + 6);
  const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  const optionalMagic = buffer.readUInt16LE(optionalHeaderOffset);
  const dataDirectoryOffset = optionalMagic === 0x20b
    ? optionalHeaderOffset + 112
    : optionalHeaderOffset + 96;
  const resourceDirectoryRva = buffer.readUInt32LE(dataDirectoryOffset + 16);
  const resourceDirectorySize = buffer.readUInt32LE(dataDirectoryOffset + 20);

  if (!resourceDirectoryRva || !resourceDirectorySize) {
    throw new Error("resource directory not found");
  }

  const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
  const sections: PeSection[] = [];

  for (let index = 0; index < numberOfSections; index += 1) {
    const sectionOffset = sectionTableOffset + index * 40;

    sections.push({
      virtualSize: buffer.readUInt32LE(sectionOffset + 8),
      virtualAddress: buffer.readUInt32LE(sectionOffset + 12),
      rawSize: buffer.readUInt32LE(sectionOffset + 16),
      rawPointer: buffer.readUInt32LE(sectionOffset + 20),
    });
  }

  return {
    buffer,
    sections,
    resourceDirectoryOffset: rvaToOffset(sections, resourceDirectoryRva),
  };
}

function readResourceType(pe: PeImage, typeId: number): ResourceData[] {
  const typeDirectory = readResourceDirectory(pe, 0);
  const typeEntry = typeDirectory.find((entry) => entry.id === typeId && entry.isDirectory);

  if (!typeEntry) {
    return [];
  }

  const nameDirectory = readResourceDirectory(pe, typeEntry.offset);
  const resources: ResourceData[] = [];

  for (const nameEntry of nameDirectory) {
    if (nameEntry.isDirectory) {
      collectResourceLeaves(pe, nameEntry.offset, nameEntry.id, resources);
    } else {
      resources.push(readResourceDataEntry(pe, nameEntry.offset, nameEntry.id));
    }
  }

  return resources;
}

function collectResourceLeaves(
  pe: PeImage,
  directoryOffset: number,
  nameId: number,
  resources: ResourceData[],
): void {
  for (const entry of readResourceDirectory(pe, directoryOffset)) {
    if (entry.isDirectory) {
      collectResourceLeaves(pe, entry.offset, nameId, resources);
      continue;
    }

    resources.push(readResourceDataEntry(pe, entry.offset, nameId));
  }
}

function readResourceDirectory(pe: PeImage, directoryOffset: number): ResourceEntry[] {
  const offset = pe.resourceDirectoryOffset + directoryOffset;
  const namedCount = pe.buffer.readUInt16LE(offset + 12);
  const idCount = pe.buffer.readUInt16LE(offset + 14);
  const count = namedCount + idCount;
  const entries: ResourceEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 16 + index * 8;
    const nameOrId = pe.buffer.readUInt32LE(entryOffset);
    const child = pe.buffer.readUInt32LE(entryOffset + 4);

    entries.push({
      id: nameOrId & 0xffff,
      isDirectory: Boolean(child & 0x80000000),
      offset: child & 0x7fffffff,
    });
  }

  return entries;
}

function readResourceDataEntry(pe: PeImage, dataEntryOffset: number, nameId: number): ResourceData {
  const offset = pe.resourceDirectoryOffset + dataEntryOffset;
  const dataRva = pe.buffer.readUInt32LE(offset);
  const size = pe.buffer.readUInt32LE(offset + 4);
  const dataOffset = rvaToOffset(pe.sections, dataRva);

  return {
    nameId,
    data: pe.buffer.subarray(dataOffset, dataOffset + size),
  };
}

function parseGroupIcon(buffer: Buffer): GroupIconEntry[] {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error("invalid icon group header");
  }

  const count = buffer.readUInt16LE(4);
  const entries: GroupIconEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 14;

    if (offset + 14 > buffer.length) {
      break;
    }

    entries.push({
      width: buffer.readUInt8(offset),
      height: buffer.readUInt8(offset + 1),
      colorCount: buffer.readUInt8(offset + 2),
      reserved: buffer.readUInt8(offset + 3),
      planes: buffer.readUInt16LE(offset + 4),
      bitCount: buffer.readUInt16LE(offset + 6),
      iconId: buffer.readUInt16LE(offset + 12),
    });
  }

  return entries;
}

function buildIco(images: Array<{ entry: GroupIconEntry; data: Buffer }>): Buffer {
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize);
  const entries = Buffer.alloc(entrySize * images.length);
  const dataBuffers: Buffer[] = [];
  let dataOffset = headerSize + entrySize * images.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach(({ entry, data }, index) => {
    const offset = index * entrySize;

    entries.writeUInt8(entry.width, offset);
    entries.writeUInt8(entry.height, offset + 1);
    entries.writeUInt8(entry.colorCount, offset + 2);
    entries.writeUInt8(entry.reserved, offset + 3);
    entries.writeUInt16LE(entry.planes, offset + 4);
    entries.writeUInt16LE(entry.bitCount, offset + 6);
    entries.writeUInt32LE(data.length, offset + 8);
    entries.writeUInt32LE(dataOffset, offset + 12);
    dataBuffers.push(data);
    dataOffset += data.length;
  });

  return Buffer.concat([header, entries, ...dataBuffers]);
}

function groupIconScore(entries: GroupIconEntry[]): number {
  return entries.reduce((score, entry) => {
    const width = entry.width || 256;
    const height = entry.height || 256;

    return score + width * height + entry.bitCount;
  }, 0);
}

function rvaToOffset(sections: PeSection[], rva: number): number {
  for (const section of sections) {
    const span = Math.max(section.virtualSize, section.rawSize);

    if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
      return section.rawPointer + (rva - section.virtualAddress);
    }
  }

  throw new Error(`RVA not mapped: 0x${rva.toString(16)}`);
}

export const iconManager = new IconManager();
