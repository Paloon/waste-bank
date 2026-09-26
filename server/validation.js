import { z } from "zod";
import { AppError, assert } from "./errors.js";
import { policy } from "../shared/policy.js";
const id = z.string().min(1).max(100),
  text = z.string().trim().max(150),
  number = z.union([z.number(), z.string().max(16)]),
  image = z.string().max(550000);
const profile = {
  id: id.optional(),
  name: z.string().trim().min(2).max(80),
  number,
  grade: number,
  room: number,
  status: z.enum(["Active", "Alumni", "Transferred", "Inactive"]).optional(),
};
const schemas = {
  submit: z.object({ category: text, image, note: text.optional() }),
  cancelSubmission: z.object({ id }),
  redeem: z.object({ id }),
  deleteReward: z.object({
    id,
    version: z.number().int().nonnegative(),
    confirm: z.literal(true),
  }),
  profile: z.object(profile),
  review: z.object({
    id,
    status: z.enum(["Approved", "Rejected"]),
    coins: number.optional(),
    weight: number.optional(),
    reason: text.optional(),
  }),
  handover: z.object({ id, verified: z.boolean() }),
  cancelReward: z.object({ id, reason: text }),
  adjust: z.object({
    id,
    amount: number,
    reason: text,
    confirmLarge: z.boolean().optional(),
  }),
  deleteStudents: z.object({
    ids: z.array(id).min(1).max(5000),
    confirm: z.boolean(),
    pin: z.string().min(1).max(128),
  }),
  reward: z.object({
    id: id.optional(),
    version: z.number().int().nonnegative().optional(),
    name: text,
    description: text.optional(),
    pickupInstructions: z.string().trim().max(500).optional(),
    price: number,
    stock: number,
    enabled: z.boolean(),
    icon: text.optional(),
    images: z
      .array(
        z.object({
          src: image,
          zoom: z.number().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .max(5)
      .optional(),
    image: image.optional(),
  }),
  promote: z.object({
    year: number,
    previewVersion: z.string().length(64),
    confirm: z.boolean(),
    students: z
      .array(
        z.object({
          id,
          grade: number,
          room: number,
          number: number.optional(),
          status: z.enum(["Active", "Alumni", "Transferred", "Inactive"]),
        }),
      )
      .min(1)
      .max(10000),
  }),
};
export function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new AppError("ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจช่องที่กรอก");
  return r.data;
}
export function actionBody(value) {
  const body = parse(
    z.object({
      action: z.enum(Object.keys(schemas)),
      key: z.string().min(10).max(100),
      payload: z.unknown(),
      expectedStudent: z.string().max(10).optional(),
    }),
    value,
  );
  const timestamp = Number(body.key.split(":")[0]);
  assert(
    Number.isSafeInteger(timestamp) &&
      timestamp > Date.now() - policy.requestDays * 86400000 &&
      timestamp < Date.now() + 300000,
    "คำขอเก่าหรือไม่สมบูรณ์ กรุณาเริ่มรายการใหม่",
    409,
  );
  body.payload = parse(schemas[body.action], body.payload);
  return body;
}
export const studentId = z.object({ id: z.string().regex(/^\d{5,10}$/) });
export const registration = z.object({
  ...profile,
  id: z.string().regex(/^\d{5,10}$/),
});
export const staffLogin = z.object({
  id: z.string().min(1).max(80),
  pin: z.string().min(1).max(128),
});
