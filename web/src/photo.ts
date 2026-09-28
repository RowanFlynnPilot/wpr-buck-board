// Decode the chosen photo with its orientation applied, then encode two JPEGs: a full-size
// view and a thumbnail for the gallery grid and front-page strip. Output is always upright
// and small enough for phones on rural connections; the server strips any location
// metadata that survives.
const FULL = { edge: 1600, quality: 0.82 };
const THUMB = { edge: 640, quality: 0.76 };

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("That photo couldn't be read. Try a JPEG or a photo straight from your phone's camera.");
  });
  try {
    const [full, thumb] = await Promise.all([encode(bitmap, FULL), encode(bitmap, THUMB)]);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

function encode(bitmap: ImageBitmap, size: { edge: number; quality: number }): Promise<Blob> {
  const scale = Math.min(1, size.edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare photos. Try another browser.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser can't prepare photos. Try another browser."))),
      "image/jpeg",
      size.quality,
    );
  });
}
