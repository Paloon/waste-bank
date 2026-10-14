// Shared browser/server defaults. Financial limits are always enforced by the server.
const imageBytes = 400 * 1024;
export const policy = Object.freeze({
  idleMs: 90_000,
  warningMs: 20_000,
  heartbeatMs: 20_000,
  absoluteMs: 8 * 60 * 60_000,
  successMs: 60_000,
  imageBytes,
  imageUriCharacters: Math.ceil((imageBytes * 4) / 3) + 100,
  imagePixels: 40_000_000,
  maxRoom: 30,
  maxNumber: 60,
  maxGrade: 6,
  largeAdjustment: 1000,
  pageSize: 50,
  requestDays: 7,
});
