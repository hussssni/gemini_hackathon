import { CAPTURE, MEMORY } from "./config.js";

const BASE64_PREFIX = /^data:image\/jpeg;base64,/;

/**
 * Wraps the rear camera stream and hands back downscaled JPEG keyframes as
 * bare base64, which is what the Gemini inlineData part expects.
 */
export function createCamera(videoElement) {
  const canvas = document.createElement("canvas");
  let stream = null;

  const start = async () => {
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access needs a secure connection (https or localhost).");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    videoElement.srcObject = stream;
    await videoElement.play();
  };

  const stop = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    videoElement.srcObject = null;
  };

  const captureFrame = ({
    width = CAPTURE.FRAME_WIDTH,
    quality = CAPTURE.JPEG_QUALITY,
  } = {}) => {
    const { videoWidth, videoHeight } = videoElement;
    if (!videoWidth || !videoHeight) {
      throw new Error("The camera has not produced a frame yet.");
    }

    const scale = Math.min(1, width / videoWidth);
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);

    const context = canvas.getContext("2d");
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", quality).replace(BASE64_PREFIX, "");
  };

  const isRunning = () => stream !== null;

  return { start, stop, captureFrame, isRunning };
}

/**
 * Pairs each frame with the compass heading it was shot at. The pan is the only
 * moment the phone sweeps the whole scene, so these headings are what turn "a
 * path over there" into a bearing we can point at later.
 */
export function frameAt(camera, heading) {
  // A phone with no usable compass reports nothing rather than zero, and an
  // unusable heading must not become a bearing the marker points at.
  const safe = Number.isFinite(heading) ? ((Math.round(heading) % 360) + 360) % 360 : 0;
  return Object.freeze({ image: camera.captureFrame(), heading: safe });
}

/** A small keepsake of a place, stored so it can be recognised on a return. */
export function referenceShot(camera) {
  return camera.captureFrame({
    width: MEMORY.THUMB_WIDTH,
    quality: MEMORY.THUMB_QUALITY,
  });
}
