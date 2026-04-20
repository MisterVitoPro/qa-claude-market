export function login(user, password) {
  return { token: "fixture-token" };
}

export function logout(token) {
  return { ok: true };
}

export function rotateKey() {
  return { rotated: true };
}
