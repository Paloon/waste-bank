import sharp from "sharp";
import { policy } from "../shared/policy.js";
import { AppError, assert } from "./errors.js";
sharp.cache(false);
sharp.concurrency(1);
export async function normalizeImage(uri) {
  assert(
    typeof uri === "string" &&
      uri.length < Math.ceil((policy.imageBytes * 4) / 3) + 100,
    "รูปใหญ่เกินไป กรุณาถ่ายใหม่",
  );
  const match =
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  assert(match, "เลือกภาพ JPG, PNG หรือ WebP");
  const bytes = Buffer.from(match[2], "base64");
  assert(
    bytes.length <= policy.imageBytes,
    "รูปภาพต้องไม่เกิน 400 KiB หลังบีบอัด",
  );
  try {
    const image = sharp(bytes, {
      limitInputPixels: policy.imagePixels,
      failOn: "warning",
      animated: false,
    });
    const metadata = await image.metadata();
    assert(
      ["jpeg", "png", "webp"].includes(metadata.format) &&
        (!metadata.pages || metadata.pages === 1),
      "ใช้ภาพนิ่ง JPG, PNG หรือ WebP",
    );
    // Decode and re-encode; no metadata is copied to the output.
    const output = await image
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer();
    assert(output.length <= policy.imageBytes, "รูปใหญ่เกินไป กรุณาถ่ายใหม่");
    return `data:image/jpeg;base64,${output.toString("base64")}`;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("เปิดรูปไม่ได้ กรุณาถ่ายใหม่หรือเลือกภาพอื่น");
  }
}
