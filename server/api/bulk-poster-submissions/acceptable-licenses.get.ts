import { bulkUniformLicenseOptionsFromWorkbook } from "~~/server/utils/bulkUniformLicenses";

export default defineEventHandler(() => {
  return { data: bulkUniformLicenseOptionsFromWorkbook() };
});
