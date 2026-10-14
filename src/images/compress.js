import { policy } from "../../shared/policy.js";

/** Browser-only image preparation. The server independently validates every upload. */
export async function compressImage(file) {
  if (!file) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("เลือกไฟล์ JPG, PNG หรือ WebP");
  if (file.size > 12_000_000) throw new Error("รูปภาพต้นฉบับต้องไม่เกิน 12 MB");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("เปิดรูปไม่ได้ กรุณาถ่ายใหม่หรือเลือกภาพอื่น");
  });
  try {
    if (bitmap.width * bitmap.height > policy.imagePixels)
      throw new Error("ภาพมีความละเอียดสูงเกินไป กรุณาเลือกรูปอื่น");
    const canvas = document.createElement("canvas");
    for (const [side, quality] of [
      [1280, 0.78],
      [1280, 0.68],
      [1120, 0.68],
      [960, 0.6],
    ]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", quality);
      const encoded = result.slice(result.indexOf(",") + 1);
      const bytes =
        Math.floor((encoded.length * 3) / 4) -
        (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
      if (bytes <= policy.imageBytes) return result;
    }
    throw new Error(
      "บีบอัดรูปให้ต่ำกว่า 400 KiB ไม่ได้ กรุณาถ่ายใหม่ให้เห็นขยะชัด ๆ",
    );
  } finally {
    bitmap.close();
  }
}
