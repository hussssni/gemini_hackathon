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
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }
  if (!payload) {
    throw new Error("The server returned a response that could not be read.");
  }

  return payload;
}

export const survey = ({ images, nodes, destination, heading }) =>
  post("/api/survey", { images, nodes, destination, heading });
