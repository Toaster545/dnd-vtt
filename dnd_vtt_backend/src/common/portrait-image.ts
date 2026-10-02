// Uploaded portraits live at uploads/portraits/<userId>/<uuid>.<ext> (see
// CharactersService.uploadPortrait). Characters store only that relative URL, and anything else
// is rejected so a character blob can't point a portrait <img>/canvas at an arbitrary URL.
const PORTRAIT_IMAGE_URL =
  /^\/uploads\/portraits\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}\.(png|jpg|webp)$/;

export function parsePortraitImage(value: unknown): string | null {
  return typeof value === 'string' && PORTRAIT_IMAGE_URL.test(value)
    ? value
    : null;
}
