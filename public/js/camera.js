import { CAMERA, CAPTURE } from "./config.js";

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

  const horizontalFov = () =>
    horizontalFovFor(videoElement.videoWidth, videoElement.videoHeight);

  return { start, stop, captureFrame, isRunning, horizontalFov };
}

/**
 * Field of view across the width of a frame. Held upright, a phone's frame is
 * its sensor's short side, which sees far less than the long side: using the
 * long-side figure there would overstate every in-photo offset.
 */
export function horizontalFovFor(width, height, longSide = CAMERA.LONG_SIDE_FOV_DEGREES) {
  if (!width || !height || width >= height) return longSide;
  const halfLong = (longSide / 2) * (Math.PI / 180);
  return (2 * Math.atan(Math.tan(halfLong) * (width / height)) * 180) / Math.PI;
}
