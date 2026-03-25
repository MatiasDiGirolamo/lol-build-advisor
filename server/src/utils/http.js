import http from "node:http";
import https from "node:https";

export class RequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.body = body;
  }
}

export function requestJson(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 15000,
    insecure = false,
  } = options;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const request = transport.request(
      parsedUrl,
      {
        method,
        headers,
        rejectUnauthorized: !insecure,
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const isJson =
            response.headers["content-type"]?.includes("application/json") ||
            rawBody.startsWith("{") ||
            rawBody.startsWith("[");

          const parsedBody = isJson && rawBody
            ? JSON.parse(rawBody)
            : rawBody;

          if (response.statusCode >= 400) {
            reject(
              new RequestError(
                `HTTP ${response.statusCode} when requesting ${url}`,
                response.statusCode,
                parsedBody,
              ),
            );
            return;
          }

          resolve(parsedBody);
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}
