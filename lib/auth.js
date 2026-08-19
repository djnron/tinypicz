export function checkPasscode(request, envVarName, headerName) {
  const expected = process.env[envVarName];
  if (!expected) {
    // Fail closed: if the env var isn't configured, nobody gets in.
    return false;
  }
  const provided = request.headers.get(headerName);
  return typeof provided === "string" && provided === expected;
}

export function checkUploadPasscode(request) {
  return checkPasscode(request, "UPLOAD_PASSCODE", "x-upload-passcode");
}

export function checkAdminPasscode(request) {
  return checkPasscode(request, "ADMIN_PASSCODE", "x-admin-passcode");
}
