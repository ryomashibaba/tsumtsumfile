const imageCache = new Map();

function getImage(src) {
  if (!src || typeof Image === "undefined") {
    return null;
  }
  if (!imageCache.has(src)) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    imageCache.set(src, image);
  }
  return imageCache.get(src);
}

function isDrawable(image) {
  return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function drawFittedImage(ctx, image, x, y, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, x - width * 0.5, y - height * 0.5, width, height);
}

export function preloadTsumImages(types) {
  for (const type of types || []) {
    const sources = type.imageSources || (type.imageSrc ? [type.imageSrc] : []);
    sources.forEach(getImage);
  }
}

export function drawTsumArtwork(ctx, type, x, y, radius) {
  const sources = type?.imageSources || (type?.imageSrc ? [type.imageSrc] : []);
  const images = sources.map(getImage);
  if (images.length === 0 || images.some((image) => !isDrawable(image))) {
    return false;
  }

  ctx.save();
  if (images.length === 1) {
    drawFittedImage(ctx, images[0], x, y, radius * 2.08, radius * 2.08);
  } else {
    const pairRadius = radius * 0.78;
    drawFittedImage(ctx, images[0], x - radius * 0.36, y, pairRadius * 2, pairRadius * 2);
    drawFittedImage(ctx, images[1], x + radius * 0.36, y, pairRadius * 2, pairRadius * 2);
  }
  ctx.restore();
  return true;
}
