#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXE_PATHS = (process.env.BDIH_EXE_ICON_TEST_PATHS ?? "")
  .split(path.delimiter)
  .map((value) => value.trim())
  .filter(Boolean);

const outputDir = path.resolve("tests/extracted-icons");
const exePaths = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_EXE_PATHS)
  .map((value) => path.resolve(value))
  .filter((value, index, values) => values.indexOf(value) === index);

fs.mkdirSync(outputDir, { recursive: true });

const results = [];

if (exePaths.length === 0) {
  console.log("No executable paths provided. Pass paths as arguments or set BDIH_EXE_ICON_TEST_PATHS.");
}

for (const exePath of exePaths) {
  if (!fs.existsSync(exePath)) {
    results.push({
      exePath: displayPath(exePath),
      ok: false,
      reason: "missing exe",
    });
    continue;
  }

  try {
    const ico = extractIcoFromPe(exePath);
    const outputPath = path.join(outputDir, `${safeBaseName(exePath)}-${shortHash(exePath)}.ico`);

    fs.writeFileSync(outputPath, ico);
    results.push({
      exePath: displayPath(exePath),
      ok: true,
      outputPath: displayPath(outputPath),
      bytes: ico.length,
    });
  } catch (error) {
    results.push({
      exePath: displayPath(exePath),
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

for (const result of results) {
  if (result.ok) {
    console.log(`[ok] ${result.exePath}`);
    console.log(`     -> ${result.outputPath} (${result.bytes} bytes)`);
  } else {
    console.log(`[fail] ${result.exePath}`);
    console.log(`       ${result.reason}`);
  }
}

const reportPath = path.join(outputDir, "report.json");
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\nreport: ${reportPath}`);

function displayPath(targetPath) {
  const relativePath = path.relative(process.cwd(), targetPath);

  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }

  return `<external>/${path.basename(targetPath)}`;
}

function extractIcoFromPe(exePath) {
  const pe = readPe(exePath);
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
    .filter((candidate) => candidate.entries.length > 0)
    .sort((left, right) => right.entries.length - left.entries.length)[0];

  if (!group) {
    throw new Error("group icon is empty");
  }

  const images = group.entries
    .map((entry) => ({
      entry,
      data: iconById.get(entry.iconId),
    }))
    .filter((candidate) => candidate.data);

  if (images.length === 0) {
    throw new Error("group icon references no available RT_ICON images");
  }

  return buildIco(images);
}

function readPe(exePath) {
  const buffer = fs.readFileSync(exePath);

  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("not an MZ executable");
  }

  const peOffset = buffer.readUInt32LE(0x3c);

  if (buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000") {
    throw new Error("PE signature not found");
  }

  const numberOfSections = buffer.readUInt16LE(peOffset + 6);
  const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  const optionalMagic = buffer.readUInt16LE(optionalHeaderOffset);
  const dataDirectoryOffset = optionalMagic === 0x20b
    ? optionalHeaderOffset + 112
    : optionalHeaderOffset + 96;
  const resourceDirectoryRva = buffer.readUInt32LE(dataDirectoryOffset + 2 * 8);
  const resourceDirectorySize = buffer.readUInt32LE(dataDirectoryOffset + 2 * 8 + 4);

  if (!resourceDirectoryRva || !resourceDirectorySize) {
    throw new Error("resource directory not found");
  }

  const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
  const sections = [];

  for (let index = 0; index < numberOfSections; index += 1) {
    const sectionOffset = sectionTableOffset + index * 40;
    const name = buffer.toString("ascii", sectionOffset, sectionOffset + 8).replace(/\0+$/, "");
    const virtualSize = buffer.readUInt32LE(sectionOffset + 8);
    const virtualAddress = buffer.readUInt32LE(sectionOffset + 12);
    const rawSize = buffer.readUInt32LE(sectionOffset + 16);
    const rawPointer = buffer.readUInt32LE(sectionOffset + 20);

    sections.push({
      name,
      virtualSize,
      virtualAddress,
      rawSize,
      rawPointer,
    });
  }

  const resourceDirectoryOffset = rvaToOffset(sections, resourceDirectoryRva);

  return {
    buffer,
    sections,
    resourceDirectoryRva,
    resourceDirectoryOffset,
  };
}

function readResourceType(pe, typeId) {
  const typeDirectory = readResourceDirectory(pe, 0);
  const typeEntry = typeDirectory.find((entry) => entry.id === typeId && entry.isDirectory);

  if (!typeEntry) {
    return [];
  }

  const nameDirectory = readResourceDirectory(pe, typeEntry.offset);
  const resources = [];

  for (const nameEntry of nameDirectory) {
    if (nameEntry.isDirectory) {
      collectResourceLeaves(pe, nameEntry.offset, nameEntry.id, resources);
    } else {
      resources.push(readResourceDataEntry(pe, nameEntry.offset, nameEntry.id));
    }
  }

  return resources;
}

function collectResourceLeaves(pe, directoryOffset, nameId, resources) {
  for (const entry of readResourceDirectory(pe, directoryOffset)) {
    if (entry.isDirectory) {
      collectResourceLeaves(pe, entry.offset, nameId, resources);
      continue;
    }

    resources.push(readResourceDataEntry(pe, entry.offset, nameId));
  }
}

function readResourceDirectory(pe, directoryOffset) {
  const offset = pe.resourceDirectoryOffset + directoryOffset;
  const namedCount = pe.buffer.readUInt16LE(offset + 12);
  const idCount = pe.buffer.readUInt16LE(offset + 14);
  const count = namedCount + idCount;
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 16 + index * 8;
    const nameOrId = pe.buffer.readUInt32LE(entryOffset);
    const child = pe.buffer.readUInt32LE(entryOffset + 4);
    const isDirectory = Boolean(child & 0x80000000);
    const id = nameOrId & 0xffff;

    entries.push({
      id,
      isDirectory,
      offset: child & 0x7fffffff,
    });
  }

  return entries;
}

function readResourceDataEntry(pe, dataEntryOffset, nameId) {
  const offset = pe.resourceDirectoryOffset + dataEntryOffset;
  const dataRva = pe.buffer.readUInt32LE(offset);
  const size = pe.buffer.readUInt32LE(offset + 4);
  const dataOffset = rvaToOffset(pe.sections, dataRva);

  return {
    nameId,
    data: pe.buffer.subarray(dataOffset, dataOffset + size),
  };
}

function parseGroupIcon(buffer) {
  if (buffer.length < 6) {
    throw new Error("invalid group icon");
  }

  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);

  if (reserved !== 0 || type !== 1) {
    throw new Error("invalid icon group header");
  }

  const entries = [];

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
      bytesInRes: buffer.readUInt32LE(offset + 8),
      iconId: buffer.readUInt16LE(offset + 12),
    });
  }

  return { entries };
}

function buildIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize);
  const entries = Buffer.alloc(entrySize * images.length);
  const dataBuffers = [];
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

function rvaToOffset(sections, rva) {
  for (const section of sections) {
    const span = Math.max(section.virtualSize, section.rawSize);

    if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
      return section.rawPointer + (rva - section.virtualAddress);
    }
  }

  throw new Error(`RVA not mapped: 0x${rva.toString(16)}`);
}

function safeBaseName(exePath) {
  return path.basename(exePath).replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
}
