import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeImage } from "../server/images.js";
import { policy } from "../shared/policy.js";
import { AppError } from "../server/errors.js";

const uri = (format, bytes) =>
  `data:image/${format};base64,${bytes.toString("base64")}`;
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
);
const picture = () =>
  sharp({
    create: { width: 24, height: 18, channels: 3, background: "#e03020" },
  });

test("spoofed SVG is rejected before sharp metadata decoding", async () => {
  const original = sharp.prototype.metadata;
  let calls = 0;
  sharp.prototype.metadata = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  try {
    for (const format of ["jpeg", "png", "webp"])
      await assert.rejects(normalizeImage(uri(format, svg)), AppError);
    assert.equal(calls, 0);
  } finally {
    sharp.prototype.metadata = original;
  }
});

test("native SVG loader is blocked even outside upload validation", async () => {
  await assert.rejects(
    sharp(svg).metadata(),
    /blocked|unsupported image format/i,
  );
});

test("valid JPEG, PNG and WebP retain upload support and lose metadata", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const input = await picture().withMetadata()[format]().toBuffer();
    const output = Buffer.from(
      (await normalizeImage(uri(format, input))).split(",")[1],
      "base64",
    );
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 24);
    assert.equal(metadata.height, 18);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.ok(output.length <= policy.imageBytes);
  }
});

test("mismatched MIME, corrupt raster and oversized inputs are rejected", async () => {
  const png = await picture().png().toBuffer();
  await assert.rejects(normalizeImage(uri("jpeg", png)), AppError);
  await assert.rejects(
    normalizeImage(uri("png", png.subarray(0, 12))),
    AppError,
  );
  const oversized = Buffer.alloc(policy.imageBytes + 1);
  png.subarray(0, 8).copy(oversized);
  await assert.rejects(normalizeImage(uri("png", oversized)), AppError);
  await assert.rejects(normalizeImage(uri("svg+xml", svg)), AppError);
});

test("pixel limit and resize bound remain enforced", async () => {
  const big = await sharp({
    create: { width: 6400, height: 6400, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  assert.ok(big.length <= policy.imageBytes);
  await assert.rejects(normalizeImage(uri("png", big)), /เปิดรูปไม่ได้/);
  const wide = await sharp({
    create: { width: 1600, height: 800, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const result = await normalizeImage(uri("png", wide));
  const metadata = await sharp(
    Buffer.from(result.split(",")[1], "base64"),
  ).metadata();
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 640);
});

test("the 400 KiB input boundary remains inclusive", async () => {
  const jpeg = await picture().jpeg().toBuffer();
  const atLimit = Buffer.alloc(policy.imageBytes);
  jpeg.copy(atLimit);
  assert.match(
    await normalizeImage(uri("jpeg", atLimit)),
    /^data:image\/jpeg;base64,/,
  );
  await assert.rejects(
    normalizeImage(uri("jpeg", Buffer.concat([atLimit, Buffer.from([0])]))),
    AppError,
  );
});
