export async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error(`Could not load ${url}: ${e.message}`);
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Could not load ${url}: HTTP ${res.status} ${res.statusText}`.trim()), { status: res.status });
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${url} is not valid JSON: ${e.message}`);
  }
}
