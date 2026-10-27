function syncsafe(value: number) {
  return Buffer.from([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function frame(id: string, body: Buffer) {
  const header = Buffer.alloc(10);

  header.write(id, 0, "ascii");
  header.writeUInt32BE(body.length, 4);

  return Buffer.concat([header, body]);
}

function textFrame(id: string, value: string) {
  const encoded = Buffer.concat([
    Buffer.from([0x01, 0xff, 0xfe]),
    Buffer.from(value, "utf16le"),
    Buffer.from([0x00, 0x00]),
  ]);

  return frame(id, encoded);
}

function pictureFrame(image: Buffer, mime: string) {
  return frame(
    "APIC",
    Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from(mime, "ascii"),
      Buffer.from([0x00, 0x03, 0x00]),
      image,
    ])
  );
}

export function stripId3v2(audio: Buffer) {
  if (
    audio.length > 10 &&
    audio.toString("ascii", 0, 3) === "ID3" &&
    (audio[6] & 0x80) === 0 &&
    (audio[7] & 0x80) === 0 &&
    (audio[8] & 0x80) === 0 &&
    (audio[9] & 0x80) === 0
  ) {
    const size =
      (audio[6] << 21) | (audio[7] << 14) | (audio[8] << 7) | audio[9];

    const footer = (audio[5] & 0x10) !== 0 ? 10 : 0;

    return audio.subarray(Math.min(10 + size + footer, audio.length));
  }

  return audio;
}

export function tagMp3(
  audio: Buffer,
  meta: {
    title: string;
    artist: string | null;
    year: string | null;
    cover: { data: Buffer; mime: string } | null;
  }
) {
  const frames: Buffer[] = [textFrame("TIT2", meta.title)];

  if (meta.artist) frames.push(textFrame("TPE1", meta.artist));
  if (meta.year) frames.push(textFrame("TYER", meta.year));
  if (meta.cover) frames.push(pictureFrame(meta.cover.data, meta.cover.mime));

  const body = Buffer.concat(frames);

  const header = Buffer.concat([
    Buffer.from("ID3", "ascii"),
    Buffer.from([0x03, 0x00, 0x00]),
    syncsafe(body.length),
  ]);

  return Buffer.concat([header, body, stripId3v2(audio)]);
}
