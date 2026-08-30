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

export function getCoverSourceRect(image, targetWidth, targetHeight) {
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const width = image.naturalHeight * targetAspect;
    return { x: (image.naturalWidth - width) * 0.5, y: 0, width, height: image.naturalHeight };
  }

  const height = image.naturalWidth / targetAspect;
  return { x: 0, y: (image.naturalHeight - height) * 0.5, width: image.naturalWidth, height };
}

function drawCoveredImage(ctx, image, x, y, width, height) {
  const source = getCoverSourceRect(image, width, height);
  ctx.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    x - width * 0.5,
    y - height * 0.5,
    width,
    height
  );
}

export function preloadTsumImages(types) {
  for (const type of types || []) {
    const sources = type.imageSources || (type.imageSrc ? [type.imageSrc] : []);
    sources.forEach(getImage);
  }
}

export function drawTsumArtwork(ctx, type, x, y, radius, { fit = "contain" } = {}) {
  const sources = type?.imageSources || (type?.imageSrc ? [type.imageSrc] : []);
  const images = sources.map(getImage);
  if (images.length === 0 || images.some((image) => !isDrawable(image))) {
    return false;
  }

  ctx.save();
  if (images.length === 1) {
    const size = radius * 2.18;
    if (fit === "cover") {
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.04, 0, Math.PI * 2);
      ctx.clip();
      drawCoveredImage(ctx, images[0], x, y, size, size);
    } else {
      drawFittedImage(ctx, images[0], x, y, size, size);
    }
  } else {
    const pairRadius = radius * 0.78;
    drawFittedImage(ctx, images[0], x - radius * 0.36, y, pairRadius * 2, pairRadius * 2);
    drawFittedImage(ctx, images[1], x + radius * 0.36, y, pairRadius * 2, pairRadius * 2);
  }
  ctx.restore();
  return true;
}
