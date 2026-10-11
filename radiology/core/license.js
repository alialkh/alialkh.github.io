// Licenses that allow republishing. NC and ND licenses do not, so they never pass.
const LICENSE = /^(CC0 1\.0|Public domain|CC BY(-SA)? \d\.\d)$/i;
export const ALLOWED_LICENSES = 'CC0 1.0, Public domain, CC BY x.y or CC BY-SA x.y';
export const licenseAllowed = license => LICENSE.test(license);
