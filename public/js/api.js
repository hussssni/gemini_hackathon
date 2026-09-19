async function post(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new Error("Cannot reach the Breadcrumb server. Check the connection.", { cause });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.error ?? `Request failed with status ${response.status}`;
    throw new Error(detail);
  }
  if (!payload) {
    throw new Error("The server returned a response that could not be read.");
  }

  return payload;
}

export const describeLandmark = ({ image, heading, steps }) =>
  post("/api/landmark", { image, heading, steps });

export const locate = ({ images, landmarks }) =>
  post("/api/locate", { images, landmarks });

export const navigate = ({ landmarks, currentLandmarkId, facingHeading, destination }) =>
  post("/api/navigate", { landmarks, currentLandmarkId, facingHeading, destination });
